/**
 * dmf-export.js — Експорт активного полотна у бінарний формат DMF v1.10
 * (GeoSystem Digitals Map File, Version 1.10).
 *
 * Специфікація: GeoSystem DMF, Version 1.10
 * Структура файлу: Заголовок (946 байт) | Шари | Параметри | Символи | Об'єкти
 *
 * Залежності: constants.js, state.js, g.js, canvas-manager.js, toast.js
 */

/* ── Низькорівневі хелпери для запису бінарних даних ── */

/** Записує 32-бітне ціле (little-endian) у DataView */
function _writeInt32(view, offset, value) {
    view.setInt32(offset, value, true);
    return offset + 4;
}

/** Записує 16-бітне слово (little-endian) */
function _writeWord(view, offset, value) {
    view.setUint16(offset, value, true);
    return offset + 2;
}

/** Записує 1 байт */
function _writeByte(view, offset, value) {
    view.setUint8(offset, value);
    return offset + 1;
}

/**
 * Записує 80-бітне число з плаваючою точкою (Extended / Real10) у форматі
 * Pascal/Delphi (80-bit extended precision, little-endian).
 * DataView не має setFloat80, тому реалізуємо вручну через IEEE 754 extended.
 */
function _writeReal10(view, offset, value) {
    // Конвертуємо через 64-bit double → 80-bit extended (approximation)
    const buf = new ArrayBuffer(8);
    const dv  = new DataView(buf);
    dv.setFloat64(0, value, false); // big-endian
    const hi = dv.getUint32(0, false);
    const lo = dv.getUint32(4, false);

    // Розбираємо double: sign(1) exp(11) mantissa(52)
    const sign    = (hi >>> 31) & 1;
    const exp64   = (hi >>> 20) & 0x7FF;
    const mant_hi = hi & 0x000FFFFF;
    const mant_lo = lo;

    let exp80, mant80_hi, mant80_lo;

    if (exp64 === 0 && mant_hi === 0 && mant_lo === 0) {
        // Zero
        exp80 = 0; mant80_hi = 0; mant80_lo = 0;
    } else if (exp64 === 0x7FF) {
        // Inf / NaN
        exp80 = 0x7FFF;
        mant80_hi = 0x80000000 | (mant_hi << 11) | (mant_lo >>> 21);
        mant80_lo = (mant_lo << 11);
    } else {
        // Нормальне число: bias 1023 → 16383
        exp80 = exp64 - 1023 + 16383;
        // Явний integer bit = 1 для normalized
        mant80_hi = 0x80000000 | (mant_hi << 11) | (mant_lo >>> 21);
        mant80_lo = (mant_lo << 11) >>> 0;
    }

    // Записуємо 10 байт little-endian: спочатку mant (8 байт), потім exp+sign (2 байти)
    view.setUint32(offset,     mant80_lo, true);
    view.setUint32(offset + 4, mant80_hi, true);
    view.setUint16(offset + 8, ((sign << 15) | exp80), true);
    return offset + 10;
}

/**
 * Записує Pascal ShortString[N]: перший байт = фактична довжина, далі символи.
 * Загальна фізична довжина = N+1 байт (фіксована, решта — нулі).
 */
function _writeShortString(view, offset, str, maxLen) {
    const bytes = [];
    for (let i = 0; i < Math.min(str.length, maxLen); i++) {
        bytes.push(str.charCodeAt(i) & 0xFF);
    }
    view.setUint8(offset, bytes.length);
    for (let i = 0; i < maxLen; i++) {
        view.setUint8(offset + 1 + i, i < bytes.length ? bytes[i] : 0);
    }
    return offset + 1 + maxLen;
}

/** Записує ASCII-рядок фіксованої довжини (без лічильника байтів), решта — нулі */
function _writeFixedString(view, offset, str, len) {
    for (let i = 0; i < len; i++) {
        view.setUint8(offset + i, i < str.length ? str.charCodeAt(i) & 0xFF : 0);
    }
    return offset + len;
}

/* ── Основна функція генерації DMF ── */

/**
 * Генерує бінарний DMF v1.10 з SVG активного полотна.
 * Витягує всі <line> з SVG, перетворює в поліліній-об'єкти (шар "Стіни").
 * Координати: SVG px → метри (÷ SCALE). Y інвертується (SVG↓ → DMF↑).
 *
 * @param {object} canvas   — об'єкт canvas з canvasManager.canvases
 * @param {SVGElement} svgEl — SVG-елемент полотна
 * @param {string} mapName  — назва карти
 * @returns {ArrayBuffer}
 */
window.exportCanvasToDmf = function (canvas, svgEl, mapName) {

    /* ── 1. Збираємо відрізки з SVG ── */
    const segments = [];
    svgEl.querySelectorAll('line').forEach(el => {
        if (el.closest('[data-highlight]')) return;
        segments.push({
            x1: parseFloat(el.getAttribute('x1')),
            y1: parseFloat(el.getAttribute('y1')),
            x2: parseFloat(el.getAttribute('x2')),
            y2: parseFloat(el.getAttribute('y2')),
        });
    });

    // Кожен відрізок SVG → окремий об'єкт-полілінія (2 точки)
    // px → метри, Y інвертується
    const px2m = v => v / SCALE;
    const invY = y => -(y / SCALE);

    /* ── 2. Розміри буфера ── */

    // Заголовок карти: 32 (сигнатура) + 4 (HeaderSize) + 910 (тіло) = 946
    const HEADER_TOTAL = 946;

    // Шари: мінімальний список — 1 шар "Стіни"
    // Заголовок списку шарів: 17 байт
    // Кожен елемент шару: 4(Size)+4(Status)+4(ID)+4(MinScale)+4(MaxScale)+
    //   4(PenColor)+4(PenWidth)+4(BrushColor)+4(FontColor)+4(FontSize)+
    //   1(PenStyle)+1(BrushStyle)+1(FontStyle)+
    //   Name(ShortString: 1+len)+FontName(ShortString:1+0)+
    //   4(Reserve)+4(ParamLength)+0(Params)+4(Symbol)+Format(1+0)+
    //   4(Reference)+4(PenWidth100)+4(FontSize10)
    // Name = "Walls" (5 chars) → 6 байт; FontName = "" → 1 байт; Format="" → 1 байт
    // Size поля елемента = все крім самого Size(4):
    //   4+4+4+4+4+4+4+4+4+1+1+1+6+1+4+4+0+4+1+4+4 = 67
    const LAYER_ELEM_SIZE_FIELD = 71;   // значення поля Size (без самого Size)
    const LAYER_ELEM_TOTAL      = 4 + LAYER_ELEM_SIZE_FIELD; // 75 байт
    const LAYERS_HEADER_SIZE    = 21;   // TotalSize(4)+HeaderSize(4)+Count(4)+Status(4)+MinService(4)+Reserve(1)
    const LAYERS_COUNT          = 1;    // 1 шар
    const LAYERS_TOTAL_SIZE     = LAYERS_HEADER_SIZE + LAYER_ELEM_TOTAL; // 96

    // Параметри: порожній список (Size(4)+HeaderSize(4)+Count(4)+Status(4)+MinService(4)+Reserve(1)=21)
    const PARAMS_TOTAL = 21;

    // Бібліотека символів: порожня
    // Size(4) + Count(4) = 8
    const SYMBOLS_TOTAL = 8;

    // Об'єкти:
    // Кожен об'єкт (відрізок → полілінія з 2 точками):
    // Заголовок: 54 байти
    //   Size(4)+Format(2)+HeaderSize(4)+Count(4)+LayerID(4)+Kind(4)+
    //   Layer(4)+ID(4)+Status(4)+Where(4)+Scale(4)+Group(4)+Parent(4)+SO(4)
    //   = 54
    // Параметри об'єкта: Size(4) + '' = 4 байти (порожній рядок)
    // Точки: Count * (Status(4)+X(10)+Y(10)+Z(10)) = 2 * 34 = 68
    // Разом на об'єкт: 4 + (54-4) + 4 + 68 = 126 (Size включно)
    // Але Size = кількість байт після самого Size(4):
    //   Format(2)+HeaderSize(4)+Count(4)+LayerID(4)+Kind(4)+Layer(4)+ID(4)+
    //   Status(4)+Where(4)+Scale(4)+Group(4)+Parent(4)+SO(4) = 50
    //   + Params(4) + Points(68) = 122
    const OBJ_SIZE_FIELD  = 122;  // значення поля Size
    const OBJ_TOTAL       = 4 + OBJ_SIZE_FIELD; // 126 байт
    const OBJECTS_TOTAL   = segments.length * OBJ_TOTAL;

    const TOTAL = HEADER_TOTAL + LAYERS_TOTAL_SIZE + PARAMS_TOTAL + SYMBOLS_TOTAL + OBJECTS_TOTAL;
    const buf   = new ArrayBuffer(TOTAL);
    const view  = new DataView(buf);
    let   off   = 0;

    /* ── 3. Заголовок карти (946 байт) ── */

    // Сигнатура 32 байти: "GeoSystem DMF, Version 1.10    " + chr(26)
    const SIG = 'GeoSystem DMF, Version 1.10    ';
    off = _writeFixedString(view, off, SIG, 31);
    view.setUint8(off, 26); off++; // chr(26) = EOF marker

    // HeaderSize = 910
    off = _writeInt32(view, off, 910);

    // Scale (Real10, 10 байт): знаменник масштабу (наприклад 100 для M1:100)
    off = _writeReal10(view, off, 100.0);

    // Count (Integer, 4): кількість об'єктів
    off = _writeInt32(view, off, segments.length);

    // Units (Integer, 4): зарезервовано
    off = _writeInt32(view, off, 0);

    // Status (Integer, 4): зарезервовано
    off = _writeInt32(view, off, 0);

    // Frame (T3DFrame = 4 × T3D = 4 × 30 байт = 120 байт)
    // Обчислюємо bounding box у метрах
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    segments.forEach(s => {
        const xs = [px2m(s.x1), px2m(s.x2)];
        const ys = [invY(s.y1), invY(s.y2)];
        xs.forEach(x => { if (x < minX) minX = x; if (x > maxX) maxX = x; });
        ys.forEach(y => { if (y < minY) minY = y; if (y > maxY) maxY = y; });
    });
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 10; maxY = 10; }

    // 4 кути рамки: лівий нижній, правий нижній, правий верхній, лівий верхній
    const corners = [
        [minX, minY, 0], [maxX, minY, 0],
        [maxX, maxY, 0], [minX, maxY, 0]
    ];
    corners.forEach(([x, y, z]) => {
        off = _writeReal10(view, off, x);
        off = _writeReal10(view, off, y);
        off = _writeReal10(view, off, z);
    });

    // Name (ShortString[255], 256 байт)
    const nameStr = (mapName || canvas.name || 'Plan').substring(0, 255);
    off = _writeShortString(view, off, nameStr, 255);

    // LeftFile (ShortString[255], 256 байт)
    off = _writeShortString(view, off, '', 255);

    // RightFile (ShortString[255], 256 байт)
    off = _writeShortString(view, off, '', 255);

    // Перевіряємо зміщення: має бути 946
    // 32 + 4 + 10 + 4 + 4 + 4 + 120 + 256 + 256 + 256 = 946 ✓

    /* ── 4. Список шарів ── */

    // Заголовок (21 байт): TotalSize+HeaderSize+Count+Status+MinService+Reserve
    off = _writeInt32(view, off, LAYERS_TOTAL_SIZE);    // TotalSize
    off = _writeInt32(view, off, 13);                    // HeaderSize
    off = _writeInt32(view, off, LAYERS_COUNT);          // Count
    off = _writeInt32(view, off, 0);                     // Status (reserve)
    off = _writeInt32(view, off, 0);                     // MinService (немає службових шарів)
    off = _writeByte(view, off, 0);                      // Reserve

    // Елемент шару "Walls" (71 байт)
    off = _writeInt32(view, off, LAYER_ELEM_SIZE_FIELD); // Size = 67
    // Status: тип Polygon/polyline=1, стан редагований=0, локалізація=polilinii (bit0=0)
    // Byte4(тип)=1, Byte3(стан)=0, Byte1=0 → Status = 0x01000000
    off = _writeInt32(view, off, 0x01000000);
    off = _writeInt32(view, off, 1);     // ID
    off = _writeInt32(view, off, 0);     // MinScale
    off = _writeInt32(view, off, 0);     // MaxScale
    off = _writeInt32(view, off, 0x000000); // PenColor: чорний (RGB 0,0,0)
    off = _writeInt32(view, off, 10);    // PenWidth: 1.0 мм = 10 десятих мм
    off = _writeInt32(view, off, 0xFFFFFF); // BrushColor: білий
    off = _writeInt32(view, off, 0x000000); // FontColor
    off = _writeInt32(view, off, 10);    // FontSize (пунктів)
    off = _writeByte(view, off, 0);      // PenStyle: суцільна (GDI PS_SOLID=0)
    off = _writeByte(view, off, 1);      // BrushStyle: порожня (GDI BS_NULL=1)
    off = _writeByte(view, off, 0);      // FontStyle
    // Name: ShortString (1+5 = 6 байт)
    off = _writeShortString(view, off, 'Walls', 5);
    // FontName: ShortString (1+0 = 1 байт)
    off = _writeShortString(view, off, '', 0);
    off = _writeInt32(view, off, 0);     // Reserve
    off = _writeInt32(view, off, 0);     // ParamLength
    // Params: 0 байт
    off = _writeInt32(view, off, 0);     // Symbol
    // Format: ShortString (1+0 = 1 байт)
    off = _writeShortString(view, off, '', 0);
    off = _writeInt32(view, off, 0);     // Reference
    off = _writeInt32(view, off, 0);     // PenWidth100
    off = _writeInt32(view, off, 0);     // FontSize10

    /* ── 5. Список параметрів (порожній, тільки заголовок) ── */

    off = _writeInt32(view, off, PARAMS_TOTAL); // Size
    off = _writeInt32(view, off, 13);            // HeaderSize
    off = _writeInt32(view, off, 0);             // Count
    off = _writeInt32(view, off, 0);             // Status
    off = _writeInt32(view, off, 0);             // MinService
    off = _writeByte(view, off, 0);              // Reserve

    /* ── 6. Бібліотека символів (порожня) ── */

    off = _writeInt32(view, off, SYMBOLS_TOTAL); // Size
    off = _writeInt32(view, off, 0);              // Count

    /* ── 7. Об'єкти (поліліній) ── */

    segments.forEach((seg, idx) => {
        const x1m = px2m(seg.x1), y1m = invY(seg.y1);
        const x2m = px2m(seg.x2), y2m = invY(seg.y2);

        // Size
        off = _writeInt32(view, off, OBJ_SIZE_FIELD); // 122
        // Format (Word, 2)
        off = _writeWord(view, off, 0);
        // HeaderSize (Integer, 4): розмір заголовка об'єкта (=44, не враховуючи Size(4)+Format(2)=6)
        // Специфікація: HeaderSize = 44
        off = _writeInt32(view, off, 44);
        // Count: 2 точки
        off = _writeInt32(view, off, 2);
        // LayerID: 1 (шар "Walls")
        off = _writeInt32(view, off, 1);
        // Kind: зарезервовано
        off = _writeInt32(view, off, 0);
        // Layer: 0 (індекс у списку шарів, 0-based — перший)
        off = _writeInt32(view, off, 0);
        // ID: унікальний номер об'єкта
        off = _writeInt32(view, off, idx + 1);
        // Status: 0 (звичайний, видимий)
        off = _writeInt32(view, off, 0);
        // Where: зарезервовано
        off = _writeInt32(view, off, 0);
        // Scale (Real Single, 4 байти): 0 = використовувати масштаб карти
        view.setFloat32(off, 0, true); off += 4;
        // Group: зарезервовано
        off = _writeInt32(view, off, 0);
        // Parent: зарезервовано
        off = _writeInt32(view, off, 0);
        // SO: кут повороту умовного знаку
        off = _writeInt32(view, off, 0);

        // Параметри об'єкта: Size(4) + порожній текст = 4 байти
        off = _writeInt32(view, off, 0); // Size = 0 (немає параметрів)

        // Точки (2 × 34 = 68 байт)
        const points = [[x1m, y1m, 0], [x2m, y2m, 0]];
        points.forEach(([x, y, z]) => {
            off = _writeInt32(view, off, 0); // Status (reserve)
            off = _writeReal10(view, off, x);
            off = _writeReal10(view, off, y);
            off = _writeReal10(view, off, z);
        });
    });

    return buf;
};

/* ── Публічна функція збереження DMF ── */

window.saveDmfActiveCanvas = function () {
    try {
        if (!window.canvasManager) { showToast('canvasManager не знайдено', 'error'); return; }
        const canvas = window.canvasManager.canvases.find(
            c => c.id === window.canvasManager.activeCanvasId
        );
        if (!canvas) { showToast('Немає активного полотна', 'error'); return; }

        const canvasEl = document.querySelector(`[data-canvas-id="${canvas.id}"]`);
        const svgEl    = canvasEl ? canvasEl.querySelector('svg') : null;
        if (!svgEl) { showToast('SVG не знайдено', 'error'); return; }

        const mapName   = (canvas.savedPath || canvas.name || 'Plan').replace(/\.(svg|dmf)$/i, '');
        const dmfBuffer = exportCanvasToDmf(canvas, svgEl, mapName);
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
        // Якщо showSaveFilePicker не спрацював — fallback на download
        console.warn('showSaveFilePicker failed, falling back to download:', err);
        _saveDmfWithDownload(null, blob, mapName);
    }
}

function _saveDmfWithDownload(canvas, blob, mapName) {
    try {
        let fileName = canvas && canvas.savedPath
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
