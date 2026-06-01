/**
 * dmf-export.js — Експорт активного полотна у бінарний формат DMF v1.10
 * (GeoSystem Digitals Map File, Version 1.10).
 *
 * Джерело даних: G.hierarchyData канви (figureLines + shapePoints).
 * Кожна фігура ієрархії → один об'єкт-полілінія з усіма точками контуру.
 * Координати: SVG px ÷ SCALE = метри, вісь Y інвертується (SVG↓ → DMF↑).
 *
 * Залежності: constants.js, state.js, g.js, canvas-manager.js, toast.js
 */

/* ── Низькорівневі хелпери ── */

function _writeInt32(view, offset, value) {
    view.setInt32(offset, value >>> 0, true);
    return offset + 4;
}

function _writeWord(view, offset, value) {
    view.setUint16(offset, value, true);
    return offset + 2;
}

function _writeByte(view, offset, value) {
    view.setUint8(offset, value);
    return offset + 1;
}

/** 80-бітний Extended (Pascal/Delphi Real10), little-endian */
function _writeReal10(view, offset, value) {
    const buf = new ArrayBuffer(8);
    const dv  = new DataView(buf);
    dv.setFloat64(0, value, false); // big-endian double
    const hi = dv.getUint32(0, false);
    const lo = dv.getUint32(4, false);

    const sign    = (hi >>> 31) & 1;
    const exp64   = (hi >>> 20) & 0x7FF;
    const mant_hi = hi & 0x000FFFFF;
    const mant_lo = lo;

    let exp80, mant80_hi, mant80_lo;

    if (exp64 === 0 && mant_hi === 0 && mant_lo === 0) {
        exp80 = 0; mant80_hi = 0; mant80_lo = 0;
    } else if (exp64 === 0x7FF) {
        exp80     = 0x7FFF;
        mant80_hi = 0x80000000 | (mant_hi << 11) | (mant_lo >>> 21);
        mant80_lo = (mant_lo << 11) >>> 0;
    } else {
        exp80     = exp64 - 1023 + 16383;
        mant80_hi = 0x80000000 | (mant_hi << 11) | (mant_lo >>> 21);
        mant80_lo = (mant_lo << 11) >>> 0;
    }

    view.setUint32(offset,     mant80_lo, true);
    view.setUint32(offset + 4, mant80_hi, true);
    view.setUint16(offset + 8, (sign << 15) | exp80, true);
    return offset + 10;
}

/** ShortString[maxLen]: 1 байт довжини + maxLen байт тіла */
function _writeShortString(view, offset, str, maxLen) {
    const actual = Math.min(str.length, maxLen);
    view.setUint8(offset, actual);
    for (let i = 0; i < maxLen; i++) {
        view.setUint8(offset + 1 + i, i < actual ? str.charCodeAt(i) & 0xFF : 0);
    }
    return offset + 1 + maxLen;
}

/** Рядок фіксованої довжини без лічильника (для сигнатури) */
function _writeFixedString(view, offset, str, len) {
    for (let i = 0; i < len; i++) {
        view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 0xFF : 0);
    }
    return offset + len;
}

/* ── Збір контурних точок з figureLines + shapePoints ── */

/**
 * Повертає масив {x, y} у порядку обходу контуру фігури.
 * Кожна точка — у SVG-пікселях зі зміщенням offsetX/Y.
 */
function _buildContour(figureLines, shapePoints, offsetX, offsetY) {
    const pts = [];
    figureLines.forEach(line => {
        if (line.isDiagonal || line.isPending) return;
        const from = shapePoints.find(p => p.num === line.from);
        if (!from) return;
        pts.push({ x: from.x + offsetX, y: from.y + offsetY });
    });
    return pts;
}

/* ── Головна функція ── */

/**
 * Генерує бінарний DMF v1.10 з ієрархії активного полотна.
 * @param {object}     canvas  — об'єкт з canvasManager.canvases
 * @param {object[]}   hier    — G.hierarchyData канви
 * @param {string}     mapName — назва карти
 * @returns {ArrayBuffer}
 */
window.exportCanvasToDmf = function (canvas, hier, mapName) {

    const px2m = v =>  v / SCALE;
    const invY = y => -(y / SCALE);   // SVG Y вниз → DMF Y вгору

    /* ── 1. Збираємо об'єкти з ієрархії ── */

    /** Рекурсивно обходить ієрархію і збирає всі фігури */
    function collectItems(items, result) {
        items.forEach(item => {
            if (item.figureLines && item.figureLines.length > 0) {
                result.push(item);
            }
            if (item.children && item.children.length > 0) {
                collectItems(item.children, result);
            }
        });
    }

    const allItems = [];
    collectItems(hier || [], allItems);

    /** Для кожного item будуємо масив точок контуру в метрах */
    const objects = allItems.map(item => {
        const offsetX = item._offsetX !== undefined ? item._offsetX : 0;
        const offsetY = item._offsetY !== undefined ? item._offsetY : 0;
        const contour = _buildContour(item.figureLines, item.shapePoints, offsetX, offsetY);
        const pts = contour.map(p => ({ x: px2m(p.x), y: invY(p.y) }));
        return { item, pts };
    }).filter(o => o.pts.length >= 2);

    /* ── 2. Константи секцій ── */

    const HEADER_TOTAL = 946;

    // Шари: TotalSize(4)+HeaderSize(4)+Count(4)+Status(4)+MinService(4)+Reserve(1) = 21
    // + 1 елемент: Size(4)+тіло(71) = 75
    const LAYER_ELEM_BODY  = 71;   // поле Size елемента шару
    const LAYER_ELEM_TOTAL = 4 + LAYER_ELEM_BODY;  // 75
    const LAYERS_HDR       = 21;
    const LAYERS_TOTAL     = LAYERS_HDR + LAYER_ELEM_TOTAL; // 96

    // Параметри: Size(4)+HeaderSize(4)+Count(4)+Status(4)+MinService(4)+Reserve(1) = 21
    const PARAMS_TOTAL = 21;

    // Символи: Size(4)+Count(4) = 8
    const SYMBOLS_TOTAL = 8;

    // Об'єкти: для N точок:
    // Size(4) включно з собою + Format(2)+HeaderSize(4)+Count(4)+LayerID(4)+Kind(4)+Layer(4)+ID(4)
    // +Status(4)+Where(4)+Scale(4)+Group(4)+Parent(4)+SO(4) [=50 після Size]
    // + ParamsSize(4) + N*(Status(4)+X(10)+Y(10)+Z(10))
    // Size = 4(Size) + 50 + 4 + N*34 = 58 + N*34   ← включає само поле Size(4)
    const objSizeField  = N => 58 + N * 34;
    const objTotalBytes = N => objSizeField(N);  // Size вже включає себе

    const OBJECTS_TOTAL = objects.reduce((s, o) => s + objTotalBytes(o.pts.length), 0);

    const TOTAL = HEADER_TOTAL + LAYERS_TOTAL + PARAMS_TOTAL + SYMBOLS_TOTAL + OBJECTS_TOTAL;
    const buf   = new ArrayBuffer(TOTAL);
    const view  = new DataView(buf);
    let   off   = 0;

    /* ── 3. Заголовок карти (946 байт) ── */

    // Сигнатура: 31 байт тексту + chr(26)
    off = _writeFixedString(view, off, 'GeoSystem DMF, Version 1.10    ', 31);
    view.setUint8(off, 26); off++;

    // HeaderSize = 910
    off = _writeInt32(view, off, 910);

    // Scale: знаменник масштабу
    off = _writeReal10(view, off, 100.0);

    // Count: кількість об'єктів
    off = _writeInt32(view, off, objects.length);

    // Units, Status: зарезервовано
    off = _writeInt32(view, off, 0);
    off = _writeInt32(view, off, 0);

    // Frame: bounding box у метрах (4 кути, лівий нижній за годинниковою)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    objects.forEach(o => o.pts.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }));
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 10; maxY = 10; }

    [[minX,minY,0],[maxX,minY,0],[maxX,maxY,0],[minX,maxY,0]].forEach(([x,y,z]) => {
        off = _writeReal10(view, off, x);
        off = _writeReal10(view, off, y);
        off = _writeReal10(view, off, z);
    });

    // Name, LeftFile, RightFile: ShortString[255]
    off = _writeShortString(view, off, (mapName || 'Plan').substring(0, 255), 255);
    off = _writeShortString(view, off, '', 255);
    off = _writeShortString(view, off, '', 255);
    // off === 946 ✓

    /* ── 4. Список шарів ── */

    off = _writeInt32(view, off, LAYERS_TOTAL);  // TotalSize
    off = _writeInt32(view, off, 13);             // HeaderSize (=13)
    off = _writeInt32(view, off, 1);              // Count
    off = _writeInt32(view, off, 0);              // Status
    off = _writeInt32(view, off, 0);              // MinService
    off = _writeByte (view, off, 0);              // Reserve

    // Елемент шару «Стіни»
    off = _writeInt32(view, off, LAYER_ELEM_BODY); // Size = 71
    off = _writeInt32(view, off, 0x01000000);       // Status: тип=Polyline(1), стан=редагований(0)
    off = _writeInt32(view, off, 1);                // ID
    off = _writeInt32(view, off, 0);                // MinScale
    off = _writeInt32(view, off, 0);                // MaxScale
    off = _writeInt32(view, off, 0x000000);         // PenColor: чорний
    off = _writeInt32(view, off, 10);               // PenWidth: 1.0 мм
    off = _writeInt32(view, off, 0xFFFFFF);         // BrushColor: білий
    off = _writeInt32(view, off, 0x000000);         // FontColor
    off = _writeInt32(view, off, 10);               // FontSize
    off = _writeByte (view, off, 0);                // PenStyle: суцільна
    off = _writeByte (view, off, 1);                // BrushStyle: прозора (BS_NULL)
    off = _writeByte (view, off, 0);                // FontStyle
    off = _writeShortString(view, off, 'Walls', 5); // Name: ShortString[5] = 6 байт
    off = _writeShortString(view, off, '', 0);      // FontName: ShortString[0] = 1 байт
    off = _writeInt32(view, off, 0);                // Reserve
    off = _writeInt32(view, off, 0);                // ParamLength
    // Params: 0 байт (ParamLength=0)
    off = _writeInt32(view, off, 0);                // Symbol
    off = _writeShortString(view, off, '', 0);      // Format: ShortString[0] = 1 байт
    off = _writeInt32(view, off, 0);                // Reference
    off = _writeInt32(view, off, 0);                // PenWidth100
    off = _writeInt32(view, off, 0);                // FontSize10

    /* ── 5. Список параметрів (порожній) ── */

    off = _writeInt32(view, off, PARAMS_TOTAL); // Size = 21
    off = _writeInt32(view, off, 13);            // HeaderSize
    off = _writeInt32(view, off, 0);             // Count
    off = _writeInt32(view, off, 0);             // Status
    off = _writeInt32(view, off, 0);             // MinService
    off = _writeByte (view, off, 0);             // Reserve

    /* ── 6. Бібліотека символів (порожня) ── */

    off = _writeInt32(view, off, SYMBOLS_TOTAL); // Size = 8
    off = _writeInt32(view, off, 0);              // Count

    /* ── 7. Об'єкти ── */

    objects.forEach((obj, idx) => {
        const pts = obj.pts;
        const N   = pts.length;
        const SF  = objSizeField(N); // поле Size

        off = _writeInt32(view, off, SF);  // Size
        off = _writeWord (view, off, 0);   // Format = 0
        off = _writeInt32(view, off, 44);  // HeaderSize = 44
        off = _writeInt32(view, off, N);   // Count
        off = _writeInt32(view, off, 1);   // LayerID = 1 (код шару «Walls»)
        off = _writeInt32(view, off, 0);   // Kind
        off = _writeInt32(view, off, 0);   // Layer = 0 (індекс шару у списку)
        off = _writeInt32(view, off, idx + 1); // ID
        off = _writeInt32(view, off, 0);   // Status
        off = _writeInt32(view, off, 0);   // Where
        view.setFloat32(off, 0, true); off += 4; // Scale = 0
        off = _writeInt32(view, off, 0);   // Group
        off = _writeInt32(view, off, 0);   // Parent
        off = _writeInt32(view, off, 0);   // SO

        // Параметри об'єкта: порожньо
        off = _writeInt32(view, off, 0);   // Params Size = 0

        // Точки
        pts.forEach(p => {
            off = _writeInt32(view, off, 0);     // Status
            off = _writeReal10(view, off, p.x);
            off = _writeReal10(view, off, p.y);
            off = _writeReal10(view, off, 0);    // Z = 0
        });
    });

    return buf;
};

/* ── Збереження ── */

window.saveDmfActiveCanvas = function () {
    try {
        if (!window.canvasManager) { showToast('canvasManager не знайдено', 'error'); return; }
        const canvas = window.canvasManager.canvases.find(
            c => c.id === window.canvasManager.activeCanvasId
        );
        if (!canvas) { showToast('Немає активного полотна', 'error'); return; }

        // Дані беремо з ієрархії канви, не з SVG
        const hier = canvas.hierarchyData || G.hierarchyData || [];
        if (hier.length === 0) {
            showToast('Немає фігур для експорту', 'warning'); return;
        }

        // Діагностика
        console.log('=== DMF EXPORT DEBUG ===');
        console.log('hier.length:', hier.length);
        hier.forEach((item, i) => {
            console.log(`item[${i}]: name="${item.name}" figureLines=${item.figureLines?.length} shapePoints=${item.shapePoints?.length} _offsetX=${item._offsetX} _offsetY=${item._offsetY}`);
            if (item.shapePoints) item.shapePoints.forEach(p => console.log(`  pt${p.num}: x=${p.x} y=${p.y}`));
            if (item.figureLines) item.figureLines.forEach(l => console.log(`  line from=${l.from} to=${l.to} isDiag=${l.isDiagonal} isPend=${l.isPending}`));
        });

        const mapName   = (canvas.savedPath || canvas.name || 'Plan').replace(/\.(svg|dmf)$/i, '');
        const dmfBuffer = exportCanvasToDmf(canvas, hier, mapName);

        // Hex-дамп перших 64 байт + байти біля об'єктів
        const dv = new DataView(dmfBuffer);
        let hexStr = 'HEADER bytes 0-63:\n';
        for (let i = 0; i < 64; i++) hexStr += dv.getUint8(i).toString(16).padStart(2,'0') + ' ';
        console.log(hexStr);
        console.log('Buffer total size:', dmfBuffer.byteLength);
        // Offset після fixed sections
        const fixedEnd = 946 + 96 + 21 + 8;
        console.log('First object starts at offset:', fixedEnd);
        let objHex = `OBJ[0] bytes ${fixedEnd}-${fixedEnd+31}:\n`;
        for (let i = fixedEnd; i < Math.min(fixedEnd+32, dmfBuffer.byteLength); i++) {
            objHex += dv.getUint8(i).toString(16).padStart(2,'0') + ' ';
        }
        console.log(objHex);
        console.log('OBJ[0] Size field (Int32LE):', dv.getInt32(fixedEnd, true));
        console.log('OBJ[0] Format (Word):', dv.getUint16(fixedEnd+4, true));
        console.log('OBJ[0] HeaderSize (Int32):', dv.getInt32(fixedEnd+6, true));
        console.log('OBJ[0] Count (Int32):', dv.getInt32(fixedEnd+10, true));
        console.log('OBJ[0] LayerID (Int32):', dv.getInt32(fixedEnd+14, true));
        console.log('OBJ[0] Layer (Int32):', dv.getInt32(fixedEnd+22, true));
        console.log('=== END DEBUG ===');

        const blob      = new Blob([dmfBuffer], { type: 'application/octet-stream' });

        const isMobile  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isDesktop = !isMobile && 'showSaveFilePicker' in window;

        if (isDesktop) {
            _saveDmfWithFilePicker(blob, mapName);
        } else {
            _saveDmfWithDownload(canvas, blob, mapName);
        }
    } catch (err) {
        showToast('Помилка DMF: ' + err.message, 'error');
        console.error('saveDmfActiveCanvas error:', err);
    }
};

async function _saveDmfWithFilePicker(blob, mapName) {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: `${mapName}.dmf`,
            types: [{ description: 'Digitals Map File (DMF)', accept: { 'application/octet-stream': ['.dmf'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        showToast(`Збережено DMF: ${handle.name}`, 'success');
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.warn('showSaveFilePicker failed, falling back to download:', err);
        _saveDmfWithDownload(null, blob, mapName);
    }
}

function _saveDmfWithDownload(canvas, blob, mapName) {
    try {
        const fileName = canvas && canvas.savedPath
            ? canvas.savedPath.replace(/\.(svg|dmf)$/i, '') + '.dmf'
            : `${mapName}.dmf`;
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = fileName; link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
        showToast(`DMF збережено: ${fileName}`, 'success');
    } catch (err) {
        showToast('Помилка збереження DMF: ' + err.message, 'error');
        console.error('_saveDmfWithDownload error:', err);
    }
}
