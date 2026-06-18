/**
 * shape-editor.js — Редактор фігур: малювання, перемалювання, площа, free-лінії.
 * Залежності: constants.js, state.js, g.js, svg-primitives.js
 */

/* ── Перемикачі ── */
window.toggleDimensionSide = function () {
    G.dimensionsOutside = document.getElementById('dimensionSideCheckbox').checked;
    if (G.figureLines.length > 0) redrawEntireFigure();
};

window.toggleBuildingType = function () {
    G.isBuilding = document.getElementById('buildingTypeCheckbox').checked;
    if (G.figureLines.length > 0) redrawEntireFigure();
};

/* ── Скидання даних фігури ── */
window.resetShapeData = function () {
    G.figureLines     = [];
    G.pendingFreeLines = [];
    G.lineIdCounter   = 1;
    G.pointCounter    = 1;
    appState.calculatedArea         = null;
    appState.customArea             = null;
    appState.editingHierarchyItemId = null;
    G.roomNumber          = '';
    G.roomNumberInputValue = '';
    G.diagonals           = [];

    const svg = document.getElementById('shapeCanvas');
    resetSvgCanvas(svg);
    updateLinesList();
};

/* ── Площа (формула Гаусса) ── */
window.calculateAndDisplayArea = function () {
    if (G.shapePoints.length < 3) return;
    let area = 0;
    for (let i = 0; i < G.shapePoints.length; i++) {
        const j = (i + 1) % G.shapePoints.length;
        area += G.shapePoints[i].x * G.shapePoints[j].y;
        area -= G.shapePoints[j].x * G.shapePoints[i].y;
    }

    // Сума підписаної площі сегментів дуги (хорда замінюється дугою)
    const arcArea = _sumArcSegmentAreas(area);
    area += arcArea;

    area = Math.abs(area) / 2;
    appState.calculatedArea = (area / (SCALE * SCALE)).toFixed(1);
    updateLinesList();
};

/**
 * Обчислює суму підписаних площ кругових сегментів для всіх дугових ліній (lineType==='curve'),
 * у тих самих одиницях що й подвоєна площа shoelace (без ділення на 2).
 * polygonShoelaceSum — необроблена (неподілена на 2, без abs) сума shoelace для прямокутних вершин,
 * використовується для визначення напрямку обходу полігону.
 */
function _sumArcSegmentAreas(polygonShoelaceSum) {
    let total = 0;
    (G.figureLines || []).forEach(function(line) {
        if (line.isDiagonal || line.isPending || line.lineType !== 'curve') return;
        const arcP = (typeof _parseArcParams === 'function') ? _parseArcParams(line.elements || []) : null;
        if (!arcP || !arcP.sagMeters) return;

        const fromPt = G.shapePoints.find(function(p) { return p.num === line.from; });
        const toPt   = G.shapePoints.find(function(p) { return p.num === line.to; });
        if (!fromPt || !toPt) return;

        const x1 = fromPt.x, y1 = fromPt.y, x2 = toPt.x, y2 = toPt.y;
        const dx = x2 - x1, dy = y2 - y1;
        const chord = Math.sqrt(dx*dx + dy*dy);
        if (chord < 1) return;

        const sagPx = arcP.sagMeters * SCALE;
        // R = (chord²/4 + sag²) / (2*sag)
        const Rs  = (chord*chord/4 + sagPx*sagPx) / (2*sagPx);
        const R   = Math.abs(Rs);
        // Половина кута дуги: sin(θ/2) = (chord/2)/R
        const half = Math.asin(Math.min(1, (chord/2) / R));
        const theta = half * 2;
        // Площа кругового сегмента (між хордою і дугою)
        const segArea = (R*R/2) * (theta - Math.sin(theta));

        // shoelace-внесок цього ребра (без ділення на 2)
        const edgeShoelace = x1*y2 - x2*y1;

        // Якщо sag бере участь у тому ж напрямку обходу, що і загальний полігон
        // (тобто дуга вигинається у бік інтер'єру), сегмент додає площу; інакше — віднімає.
        // sag>0 — дуга вигинається ліворуч від напрямку from→to.
        // Знак внеску ребра в shoelace показує напрямок обходу для цього ребра;
        // узгоджуємо із загальним знаком обходу полігону.
        const overallSign = polygonShoelaceSum >= 0 ? 1 : -1;
        const edgeSign    = edgeShoelace >= 0 ? 1 : -1;
        const sagSign     = arcP.sagMeters >= 0 ? 1 : -1;

        // Сегмент додає площу, якщо дуга вигинається у той самий бік, що інтер'єр полігону
        const contributionSign = (edgeSign === overallSign) ? sagSign : -sagSign;

        // *2, бо calculateAndDisplayArea ділить (polygonShoelaceSum + arcArea) на 2;
        // polygonShoelaceSum — подвоєна площа полігону, тож segArea теж потрібно подвоїти.
        total += contributionSign * (2 * segArea) * overallSign;
    });
    return total;
}

/* ── Автомасштабування shapeCanvas ── */
window.autoScaleAndCenterFigure = function () {
    if (G.shapePoints.length < 2) return;
    const svg = document.getElementById('shapeCanvas');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    G.shapePoints.filter(p => !p.isTemp).forEach(p => {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    });
    if (!isFinite(minX)) return;
    const fw = maxX - minX, fh = maxY - minY;
    const padX = Math.max(fw * 0.25, 80);
    const padY = Math.max(fh * 0.25, 80);
    // Забезпечуємо квадратний мінімум: щоб xMidYMid meet центрував фігуру по обох осях
    const vbW = Math.max(fw + padX * 2, fh + padY * 2);
    const vbH = vbW;
    const cx  = (minX + maxX) / 2;
    const cy  = (minY + maxY) / 2;
    svg.setAttribute('viewBox', `${cx - vbW / 2} ${cy - vbH / 2} ${vbW} ${vbH}`);
};

/* ── Номер приміщення в центрі ── */
window.drawRoomNumber = function () {
    if (!G.roomNumber || G.shapePoints.length < 3) return;
    const svg = document.getElementById('shapeCanvas');
    const validPoints = G.shapePoints.filter(p => !p.isTemp);
    let cx = 0, cy = 0;
    validPoints.forEach(p => { cx += p.x; cy += p.y; });
    cx /= validPoints.length; cy /= validPoints.length;
    svg.appendChild(buildRoomNumberText(cx, cy, G.roomNumber));
};

/* ── Розміри на shapeCanvas ── */
window.drawLineDimension = function (x1, y1, x2, y2, lengthInMeters, lineData) {
    if (lineData && lineData.dimensionVisible === false) return;

    const svg = document.getElementById('shapeCanvas');
    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const ux = dx / len, uy = dy / len;
    const px = uy, py = -ux;
    const offset = 10;
    const dir    = G.dimensionsOutside ? 1 : -1;
    const textX  = (x1 + x2) / 2 + px * offset * dir;
    const textY  = (y1 + y2) / 2 + py * offset * dir;

    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90)  angle -= 180;
    if (angle < -90) angle += 180;
    if (lineData && lineData.dimensionRotated) angle += 180;

    const numLen  = typeof lengthInMeters === 'number' ? lengthInMeters : parseFloat(lengthInMeters);
    const rounded = Math.round(numLen * 100) / 100;
    svg.appendChild(_makeSvgText(textX, textY, rounded.toFixed(2), angle));
};

/* ── Відносні напрямки ── */
/**
 * Повертає вектор попередньої лінії (від її початку до кінця).
 * Якщо попередньої лінії немає — дефолтний напрямок вправо.
 */
window._getPrevLineVector = function () {
    // Беремо останню не-діагональну, не-pending лінію
    let prevLine = null;
    for (let i = G.figureLines.length - 1; i >= 0; i--) {
        if (!G.figureLines[i].isDiagonal && !G.figureLines[i].isPending) {
            prevLine = G.figureLines[i];
            break;
        }
    }
    if (!prevLine) return { ux: 1, uy: 0 }; // дефолт: вправо

    const fromPt = G.shapePoints.find(function(p) { return p.num === prevLine.from; });
    const toPt   = prevLine.isClosing
        ? G.shapePoints[0]
        : G.shapePoints.find(function(p) { return p.num === prevLine.to; });

    if (!fromPt || !toPt) return { ux: 1, uy: 0 };

    const dx = toPt.x - fromPt.x;
    const dy = toPt.y - fromPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { ux: 1, uy: 0 };
    return { ux: dx / len, uy: dy / len };
};

/**
 * Обчислює кінцеву точку лінії відносно попередньої.
 * Напрямки відносні до вектора попередньої лінії:
 *   top    — продовження вперед (0°)
 *   right  — поворот праворуч (90° за годинниковою)
 *   bottom — розворот (180°)
 *   left   — поворот ліворуч (90° проти годинникової)
 */
window._calcRelativeEnd = function (fromX, fromY, direction, scaledLen) {
    // Перевіряємо чи є вже створені лінії (крім діагоналей)
    const hasLines = G.figureLines.some(function(l) { return !l.isDiagonal; });

    let vx, vy;
    if (!hasLines) {
        // Перша лінія: right = горизонталь вправо, left = горизонталь вліво
        vx = direction === 'left' ? -1 : 1;
        vy = 0;
    } else {
        // Наступні лінії: поворот відносно попередньої
        const { ux, uy } = _getPrevLineVector();
        switch (direction) {
            case 'right':    vx = -uy; vy =  ux; break; // праворуч від напрямку (+90° за год. в SVG)
            case 'left':     vx =  uy; vy = -ux; break; // ліворуч від напрямку (-90° проти год. в SVG)
            case 'straight': vx =  ux; vy =  uy; break; // прямо (продовження попередньої лінії)
            default:         vx =  ux; vy =  uy; break;
        }
    }

    return {
        x: fromX + vx * scaledLen,
        y: fromY + vy * scaledLen
    };
};

/**
 * Будує масив об'єктів-ліній для поділу однієї лінії на N відрізків за засічками.
 * marksFromZero — масив [0, m1, m2, ..., mLast] (mLast — загальна довжина).
 * fromNum — номер початкової точки; toNum/isClosingFinal — кінець останнього відрізка.
 * firstDirection — напрямок першого відрізка; наступні — 'straight'.
 * Проміжні точки отримують реальні числові номери через G.pointCounter
 * (без штрихів); точки перенумеровуються за порядком слідування ліній фігури.
 */
window._buildSplitSegments = function (fromNum, marksFromZero, toNum, isClosingFinal, firstDirection, quadrant, dimMeta, firstCachedEnd) {
    const segCount = marksFromZero.length - 1;
    const newLines = [];

    // Генеруємо числові номери для ПРОМІЖНИХ точок (не для останньої — вона toNum)
    const midNums = [];
    for (let s = 0; s < segCount - 1; s++) {
        G.pointCounter++;
        midNums.push(G.pointCounter);
    }

    for (let s = 0; s < segCount; s++) {
        const segLength    = marksFromZero[s + 1] - marksFromZero[s];
        const segFrom      = (s === 0) ? fromNum : midNums[s - 1];
        const segTo        = (s === segCount - 1) ? toNum : midNums[s];
        const segDirection = (s === 0) ? firstDirection : 'straight';

        const segLine = {
            id:               G.lineIdCounter++,
            from:             segFrom,
            to:               segTo,
            direction:        segDirection,
            lineType:         'line',
            elements:         [{ type: 'number', value: segLength }],
            code:             segDirection + '\nline\n' + segLength,
            length:           segLength,
            isClosing:        (s === segCount - 1) ? isClosingFinal : false,
            isPending:        false,
            quadrant:         (s === segCount - 1) ? (quadrant || null) : null,
            dimensionVisible: dimMeta && dimMeta.dimensionVisible !== false,
            dimensionRotated: !!(dimMeta && dimMeta.dimensionRotated === true),
            isSubSegment:     true,
            _fixedTo:         (s === segCount - 1) ? null : midNums[s]
        };
        if (s === 0 && firstCachedEnd) {
            segLine.direction  = 'free';
            segLine._cachedEnd = firstCachedEnd;
        }
        newLines.push(segLine);
    }
    return newLines;
};

/* ── Малювання лінії на shapeCanvas ── */
window.drawLineOnCanvas = function (parsedData) {
    const svg       = document.getElementById('shapeCanvas');
    const lastPoint = G.shapePoints[G.shapePoints.length - 1];
    const isClosing = appState.isClosingLine || false;

    if (parsedData.direction === 'free') {
        const lineLength = parsedData.elements.find(el => el.type === 'number')?.value || 0;

        if (!isClosing) {
            const lineData = _makeLineData(G.lineIdCounter, lastPoint.num, null, parsedData, lineLength, false, true);
            G.pendingFreeLines.push(lineData);
            G.figureLines.push(lineData);
            G.lineIdCounter++;

            G.pointCounter++;
            G.shapePoints.push({ x: lastPoint.x, y: lastPoint.y, num: G.pointCounter, isTemp: true });

            updateLinesList();
            showToast('Лінію з невідомим кутом збережено. Додайте замикаючу для розрахунку.', 'info');
            return;
        }

        if (G.pendingFreeLines.length === 0) {
            parsedData.direction = 'direct-closing';
        } else {
            const lineData = _makeLineData(G.lineIdCounter, lastPoint.num, 1, parsedData, lineLength, true, true);
            G.pendingFreeLines.push(lineData);
            G.figureLines.push(lineData);
            G.lineIdCounter++;
            appState.isClosingLine = false;
            calculateFreeAngleFigure();
            return;
        }
    }

    let endX = lastPoint.x, endY = lastPoint.y;
    let lineLength = 0;

    // ── Поділ на кілька відрізків: декілька чистих чисел без кодів елементів ──
    // Введені числа тлумачаться як позначки (засічки) від спільної початкової точки
    // вздовж лінії; останнє число — загальна довжина лінії. Відрізки = різниці
    // між послідовними засічками (включно з 0 на старті).
    if (!isClosing && parsedData.lineType === 'line' &&
        parsedData.elements.length > 1 &&
        parsedData.elements.every(el => el.type === 'number')) {

        const marks = [0, ...parsedData.elements.map(el => parseFloat(el.value))];

        let curFrom = lastPoint;
        let curDirection = parsedData.direction;

        for (let m = 1; m < marks.length; m++) {
            const segLength = marks[m] - marks[m - 1];
            const scaledLen = segLength * SCALE;
            const rel       = _calcRelativeEnd(curFrom.x, curFrom.y, curDirection, scaledLen);
            const segEndX   = rel.x, segEndY = rel.y;

            const segParsed = {
                direction: curDirection,
                lineType:  'line',
                elements:  [{ type: 'number', value: segLength }],
                quadrant:  parsedData.quadrant
            };

            _renderSvgLine(svg, curFrom.x, curFrom.y, segEndX, segEndY, G.lineIdCounter);
            drawLineDimension(curFrom.x, curFrom.y, segEndX, segEndY, segLength, null);
            drawElementsOnLine(segParsed, curFrom.x, curFrom.y, segEndX, segEndY, SCALE);

            G.pointCounter++;
            G.shapePoints.push({ x: segEndX, y: segEndY, num: G.pointCounter });
            _renderSvgPoint(svg, segEndX, segEndY, G.pointCounter);

            const segLineData = _makeLineData(G.lineIdCounter, curFrom.num, G.pointCounter, segParsed, segLength, false, false);
            G.figureLines.push(segLineData);
            G.lineIdCounter++;

            curFrom      = { x: segEndX, y: segEndY, num: G.pointCounter };
            curDirection = 'straight';
        }

        updateLinesList();
        autoScaleAndCenterFigure();
        return;
    }

    if (parsedData.lineType === 'curve') {
        const arcP = _parseArcParams(parsedData.elements);
        lineLength = arcP ? arcP.chordWidth : 0;
    } else {
        for (let i = parsedData.elements.length - 1; i >= 0; i--) {
            if (parsedData.elements[i].type === 'number') {
                lineLength = parseFloat(parsedData.elements[i].value);
                break;
            }
        }
    }

    if (isClosing) {
        endX = G.shapePoints[0].x;
        endY = G.shapePoints[0].y;
    } else {
        const scaledLen = lineLength * SCALE;
        const rel = _calcRelativeEnd(lastPoint.x, lastPoint.y, parsedData.direction, scaledLen);
        endX = rel.x; endY = rel.y;
    }

    // ── Поділ замикаючої лінії на кілька відрізків за засічками ──
    if (isClosing && parsedData.lineType === 'line' &&
        parsedData.elements.length > 1 &&
        parsedData.elements.every(function(el) { return el.type === 'number'; })) {

        const marks = [0].concat(parsedData.elements.map(function(el) { return parseFloat(el.value); }));
        const dx = endX - lastPoint.x, dy = endY - lastPoint.y;
        const fullLen = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / fullLen, uy = dy / fullLen;

        const firstCachedEnd = {
            x: lastPoint.x + ux * marks[1] * SCALE,
            y: lastPoint.y + uy * marks[1] * SCALE
        };

        const newLines = _buildSplitSegments(
            lastPoint.num, marks, 1, true, parsedData.direction, parsedData.quadrant, null, firstCachedEnd
        );

        G.figureLines.push(...newLines);
        appState.isClosingLine = false;
        redrawEntireFigure();
        return;
    }

    if (parsedData.lineType === 'curve') {
        const arcP = _parseArcParams(parsedData.elements);
        const sag = arcP ? arcP.sagMeters * SCALE : 0;
        _renderSvgArc(svg, lastPoint.x, lastPoint.y, endX, endY, sag, G.lineIdCounter);
    } else {
        _renderSvgLine(svg, lastPoint.x, lastPoint.y, endX, endY, G.lineIdCounter);
    }
    drawLineDimension(lastPoint.x, lastPoint.y, endX, endY, lineLength, null);
    drawElementsOnLine(parsedData, lastPoint.x, lastPoint.y, endX, endY, SCALE);

    let targetPointNum;
    if (isClosing) {
        targetPointNum = 1;
        appState.isClosingLine = false;
        calculateAndDisplayArea();
    } else {
        G.pointCounter++;
        G.shapePoints.push({ x: endX, y: endY, num: G.pointCounter });
        targetPointNum = G.pointCounter;
        _renderSvgPoint(svg, endX, endY, G.pointCounter);
    }

    const lineData = _makeLineData(G.lineIdCounter, lastPoint.num, targetPointNum, parsedData, lineLength, isClosing, false);
    G.figureLines.push(lineData);
    updateLinesList();
    G.lineIdCounter++;
    autoScaleAndCenterFigure();
};

window._makeLineData = function (id, from, to, parsedData, length, isClosing, isPending) {
    return {
        id, from, to,
        direction:        parsedData.direction,
        lineType:         parsedData.lineType,
        elements:         parsedData.elements,
        code:             document.getElementById('coordInput').value,
        length:           parseFloat(length),
        isClosing,
        isPending,
        quadrant:         parsedData.quadrant || null,
        dimensionVisible: true,
        dimensionRotated: false
    };
};

/* ── Видалення лінії та всіх наступних ── */
/**
 * Видаляє лінію з даним id і всі лінії, що були створені після неї
 * (тобто всі лінії з більшим id, включно з діагоналями що посилаються на видалені точки).
 */
window.deleteLineAndFollowing = function (lineId) {
    const idx = G.figureLines.findIndex(function(l) { return l.id === lineId; });
    if (idx === -1) { showToast('Лінію не знайдено', 'error'); return; }

    const deletedLine = G.figureLines[idx];

    // Визначаємо першу точку що зникне — «to» видаленої лінії
    // (для замикаючої — точка 1 не видаляється, просто прибираємо замикання)
    const firstDeletedPointNum = (!deletedLine.isDiagonal && !deletedLine.isClosing)
        ? deletedLine.to
        : null;

    // Збираємо id ліній що треба видалити:
    // 1) Сама лінія
    // 2) Всі не-діагональні лінії у яких from >= firstDeletedPointNum
    //    (тобто починаються з видаленої або пізнішої точки)
    // 3) Діагоналі у яких хоча б одна точка (from або to) >= firstDeletedPointNum
    const toDelete = new Set();
    toDelete.add(lineId);

    if (firstDeletedPointNum !== null) {
        G.figureLines.forEach(function(l) {
            if (l.id === lineId) return;
            if (!l.isDiagonal) {
                // Звичайна лінія: видаляємо якщо її початок >= firstDeletedPointNum
                if (l.from >= firstDeletedPointNum || l.to >= firstDeletedPointNum) {
                    toDelete.add(l.id);
                }
            } else {
                // Діагональ: видаляємо тільки якщо хоча б одна точка зникає
                if (l.from >= firstDeletedPointNum || l.to >= firstDeletedPointNum) {
                    toDelete.add(l.id);
                }
            }
        });
    }

    G.figureLines = G.figureLines.filter(function(l) { return !toDelete.has(l.id); });

    // Скидаємо pointCounter
    let maxPt = 1;
    G.figureLines.forEach(function(l) {
        if (!l.isDiagonal && !l.isClosing && l.to) maxPt = Math.max(maxPt, l.to);
    });
    G.pointCounter = maxPt;

    appState.calculatedArea = null;
    appState.customArea     = null;

    if (G.figureLines.length === 0) {
        const svg = document.getElementById('shapeCanvas');
        resetSvgCanvas(svg);
        updateLinesList();
        return;
    }

    redrawEntireFigure();
    showToast('Лінію видалено', 'info');
};

/* ── Видалення точки фігури ── */
window.openDeletePointModal = function () {
    _rebuildChainPoints();
    // Збираємо всі точки крім pending (isTemp)
    const deletable = G.shapePoints.filter(function(p) { return !p.isTemp; });
    if (deletable.length < 2) {
        showToast('Немає точок для видалення', 'warning');
        return;
    }

    const select = document.getElementById('deletePointSelect');
    select.innerHTML = '';
    deletable.forEach(function(p) {
        const opt = document.createElement('option');
        opt.value = String(p.num);
        opt.textContent = 'Точка ' + p.num;
        select.appendChild(opt);
    });

    const hint = document.getElementById('deletePointHint');
    hint.textContent = 'Наявні точки: ' + deletable.map(function(p) { return p.num; }).join(', ');

    document.getElementById('deletePointModal').style.display = 'block';
};

window.closeDeletePointModal = function () {
    document.getElementById('deletePointModal').style.display = 'none';
};

window.applyDeletePoint = function () {
    const select = document.getElementById('deletePointSelect');
    const ptNum  = select.value;

    if (!ptNum) {
        showToast('Оберіть точку', 'warning');
        return;
    }

    _deleteShapePoint(ptNum);
    closeDeletePointModal();
};

/**
 * Видаляє точку з номером ptNum з фігури.
 * Перед видаленням заморожує координати ВСІХ точок:
 * кожна не-замикаюча лінія переводиться в direction='free' з _cachedEnd,
 * тому _rebuildChainPoints більше не перераховує координати через ланцюг кутів.
 * Після цього дві лінії що суміжні з видаленою точкою об'єднуються в одну пряму.
 */
window._deleteShapePoint = function (ptNum) {
    // 1. Будуємо актуальні координати всіх точок
    _rebuildChainPoints();

    // 2. Заморожуємо координати: кожну не-замикаючу лінію → direction='free' + _cachedEnd
    //    Це гарантує що після будь-яких змін у масиві ліній _rebuildChainPoints
    //    не буде перераховувати позиції через ланцюг напрямків.
    G.figureLines.forEach(function(lineData) {
        if (lineData.isDiagonal || lineData.isClosing || lineData.isPending) return;
        if (lineData.direction !== 'free') {
            // Знаходимо кінцеву точку цієї лінії в G.shapePoints
            const toPt = G.shapePoints.find(function(p) {
                return String(p.num) === String(lineData.to);
            });
            if (toPt) {
                lineData.direction  = 'free';
                lineData._cachedEnd = { x: toPt.x, y: toPt.y };
            }
        }
        // Для ліній зі штрихами (_fixedTo): також зберігаємо _cachedEnd якщо ще немає
        if (lineData._fixedTo !== undefined && lineData._fixedTo !== null && !lineData._cachedEnd) {
            const toPt = G.shapePoints.find(function(p) {
                return String(p.num) === String(lineData._fixedTo);
            });
            if (toPt) {
                lineData.direction  = 'free';
                lineData._cachedEnd = { x: toPt.x, y: toPt.y };
            }
        }
    });

    // 3. Знаходимо лінію що ЗАКІНЧУЄТЬСЯ на ptNum і що ПОЧИНАЄТЬСЯ з ptNum
    //    Для точки 1: лінія що входить — це замикаюча (isClosing=true, to=1)
    const lineInIdx  = G.figureLines.findIndex(function(l) {
        return !l.isDiagonal && String(l.to) === String(ptNum);
    });
    const lineOutIdx = G.figureLines.findIndex(function(l) {
        return !l.isDiagonal && String(l.from) === String(ptNum);
    });

    if (lineInIdx === -1 || lineOutIdx === -1) {
        showToast('Не вдалося знайти лінії для точки ' + ptNum, 'error');
        return;
    }

    const lineIn  = G.figureLines[lineInIdx];
    const lineOut = G.figureLines[lineOutIdx];

    // 4. Координати фіксованих сусідніх точок з G.shapePoints
    const ptFrom = G.shapePoints.find(function(p) { return String(p.num) === String(lineIn.from); });
    const ptTo   = lineOut.isClosing
        ? G.shapePoints[0]
        : G.shapePoints.find(function(p) { return String(p.num) === String(lineOut.to); });

    if (!ptFrom || !ptTo) {
        showToast('Помилка координат точок', 'error');
        return;
    }

    // 5. Довжина нової прямої між незрушеними точками
    const dx = ptTo.x - ptFrom.x;
    const dy = ptTo.y - ptFrom.y;
    const newLen = parseFloat((Math.sqrt(dx * dx + dy * dy) / SCALE).toFixed(3));

    // 6. Нова об'єднана лінія
    const mergedLine = {
        id:               lineIn.id,
        from:             lineIn.from,
        to:               lineOut.to,
        direction:        'free',
        lineType:         'line',
        elements:         [{ type: 'number', value: newLen }],
        code:             'free\nline\n' + newLen,
        length:           newLen,
        isClosing:        lineOut.isClosing,
        isPending:        false,
        dimensionVisible: lineIn.dimensionVisible !== false,
        dimensionRotated: false,
        _cachedEnd:       lineOut.isClosing ? null : { x: ptTo.x, y: ptTo.y }
    };

    // 7. Видаляємо діагоналі що посилаються на видалену точку
    G.figureLines = G.figureLines.filter(function(l) {
        if (!l.isDiagonal) return true;
        return String(l.from) !== String(ptNum) && String(l.to) !== String(ptNum);
    });

    // 8. Замінюємо lineIn на mergedLine, видаляємо lineOut
    const idxIn = G.figureLines.findIndex(function(l) { return l.id === lineIn.id; });
    G.figureLines.splice(idxIn, 1, mergedLine);
    const idxOut = G.figureLines.findIndex(function(l) { return l.id === lineOut.id; });
    if (idxOut !== -1) G.figureLines.splice(idxOut, 1);

    // 9. Якщо видалялась точка 1 — нова перша точка = ptTo (колишня точка після 1).
    //    Ротуємо масив ліній так щоб нова замикаюча стала останньою,
    //    і встановлюємо G._overrideStart = координати нової точки 1.
    if (String(ptNum) === '1') {
        // Нова «перша» точка — це ptTo (колишня точка lineOut.to)
        // Ланцюг тепер починається з неї. Оскільки всі лінії вже free+_cachedEnd,
        // треба ротувати масив: знайти першу не-діагональну лінію що починається з ptTo
        // і переставити її на початок (разом з хвостом до неї).
        const newFirstIdx = G.figureLines.findIndex(function(l) {
            return !l.isDiagonal && String(l.from) === String(lineOut.to);
        });
        if (newFirstIdx > 0) {
            const diags    = G.figureLines.filter(function(l) { return  l.isDiagonal; });
            const nonDiags = G.figureLines.filter(function(l) { return !l.isDiagonal; });
            const rotated  = nonDiags.slice(newFirstIdx).concat(nonDiags.slice(0, newFirstIdx));
            // Остання стає замикаючою
            rotated[rotated.length - 1].isClosing  = true;
            rotated[rotated.length - 1]._cachedEnd = null;
            // Перша більше не замикаюча
            rotated[0].isClosing = false;
            G.figureLines = rotated.concat(diags);
        }
        // Перенумеровуємо from/to: нова точка 1 = ptTo.num → 1
        const oldNum1 = String(lineOut.to);
        if (oldNum1 !== '1') {
            G.figureLines.forEach(function(l) {
                if (String(l.from) === oldNum1) l.from = 1;
                if (String(l.to)   === oldNum1) l.to   = 1;
            });
        }
        G._overrideStart = { x: ptTo.x, y: ptTo.y };
    }

    appState.calculatedArea = null;
    appState.customArea     = null;

    redrawEntireFigure();
    updateLinesList();
    showToast('Точку ' + ptNum + ' видалено', 'info');
};

/* ── Редагування лінії ── */
window.editLine = function (line) {
    // Діагональ — відкриваємо модалку діагоналі з поточною довжиною
    if (line.isDiagonal) {
        document.getElementById('diagonalModal').style.display = 'block';
        document.getElementById('diagonalInput').value = line.from + ' ' + line.to + ' ' + line.length;
        const pts = G.shapePoints.map(function(p) { return p.num; }).join(', ');
        document.getElementById('diagonalPointsHint').textContent = 'Наявні точки: ' + pts;
        setTimeout(function() { document.getElementById('diagonalInput').focus(); }, 100);
        return;
    }

    document.getElementById('coordModal').style.display = 'block';
    document.getElementById('coordInput').value = line.code;
    appState.editingLineId = line.id;
    setTimeout(() => document.getElementById('coordInput').focus(), 100);
};

window.updateExistingLine = function (lineId, parsedData) {
    const idx = G.figureLines.findIndex(function(l) { return l.id === lineId; });
    if (idx === -1) { showToast('Лінію не знайдено', 'error'); return; }

    // ── Поділ існуючої лінії на кілька відрізків за засічками ──
    // Якщо введено декілька чистих чисел без кодів елементів — лінія розбивається
    // на N послідовних відрізків (засічки від точки 'from', останнє число —
    // загальна довжина). Проміжні точки отримують унікальні позначення зі штрихом:
    // <from>', <from>'', ... Кінцева точка лінії (line.to) залишається незмінною.
    if (!G.figureLines[idx].isDiagonal &&
        !G.figureLines[idx].isPending &&
        parsedData.lineType === 'line' &&
        parsedData.elements.length > 1 &&
        parsedData.elements.every(function(el) { return el.type === 'number'; })) {

        const origLine = G.figureLines[idx];
        const marks    = [0].concat(parsedData.elements.map(function(el) { return parseFloat(el.value); }));

        let firstCachedEnd = null;
        if (origLine._cachedEnd) {
            // Лінія з фіксованим напрямком (зафіксована діагоналлю): рахуємо реальний
            // вектор від точки 'from' до _cachedEnd і будуємо перший відрізок уздовж нього.
            _rebuildChainPoints();
            const fromPt = G.shapePoints.find(function(p) { return p.num === origLine.from; });
            if (fromPt) {
                const dx = origLine._cachedEnd.x - fromPt.x;
                const dy = origLine._cachedEnd.y - fromPt.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const ux = dx / len, uy = dy / len;
                firstCachedEnd = {
                    x: fromPt.x + ux * marks[1] * SCALE,
                    y: fromPt.y + uy * marks[1] * SCALE
                };
            }
        }

        // Встановлюємо G.pointCounter до максимального наявного числового номера точки,
        // щоб нові проміжні точки не колідували з існуючими.
        {
            let maxPtNum = 1;
            G.figureLines.forEach(function(l) {
                if (typeof l.from === 'number' && l.from > maxPtNum) maxPtNum = l.from;
                if (typeof l.to   === 'number' && l.to   > maxPtNum) maxPtNum = l.to;
            });
            G.pointCounter = maxPtNum;
        }

        const newLines = _buildSplitSegments(
            origLine.from, marks, origLine.to, origLine.isClosing,
            origLine.direction, origLine.quadrant, origLine, firstCachedEnd
        );
        newLines[0].id = origLine.id;
        G.lineIdCounter--; // перший сегмент перевикористовує id оригінальної лінії

        G.figureLines.splice(idx, 1, ...newLines);
        redrawEntireFigure();
        return;
    }

    let newLength = 0;
    if (parsedData.lineType === 'curve') {
        const arcP = _parseArcParams(parsedData.elements);
        newLength = arcP ? arcP.chordWidth : 0;
    } else {
        for (let i = parsedData.elements.length - 1; i >= 0; i--) {
            if (parsedData.elements[i].type === 'number') { newLength = parsedData.elements[i].value; break; }
        }
    }

    if (!G.figureLines[idx].isDiagonal && newLength <= 0) {
        showToast('Довжина лінії не може бути нульовою або від\'ємною', 'warning');
        return;
    }

    // Якщо лінія має _cachedEnd (зафіксована діагоналлю) — завжди зберігаємо direction='free'
    // і перемасштабовуємо _cachedEnd незалежно від того що ввів користувач у direction.
    // Це запобігає «прокручуванню» лінії при додаванні WI1 або зміні довжини.
    const hasCachedEnd = !!G.figureLines[idx]._cachedEnd;
    if (hasCachedEnd) {
        // Зберігаємо direction=free, оновлюємо лише elements/code/length
        G.figureLines[idx].lineType  = parsedData.lineType;
        G.figureLines[idx].elements  = parsedData.elements;
        G.figureLines[idx].code      = document.getElementById('coordInput').value;
        G.figureLines[idx].length    = newLength;
        // Перемасштабовуємо _cachedEnd на нову довжину зі збереженням напрямку
        _rebuildChainPoints();
        const fromPt = G.shapePoints.find(function(p) { return p.num === G.figureLines[idx].from; });
        if (fromPt) {
            const oldEnd = G.figureLines[idx]._cachedEnd;
            const dx = oldEnd.x - fromPt.x;
            const dy = oldEnd.y - fromPt.y;
            const oldLen = Math.sqrt(dx * dx + dy * dy);
            if (oldLen > 0) {
                G.figureLines[idx]._cachedEnd = {
                    x: fromPt.x + dx / oldLen * newLength * SCALE,
                    y: fromPt.y + dy / oldLen * newLength * SCALE
                };
            }
        }
    } else {
        G.figureLines[idx].direction = parsedData.direction;
        G.figureLines[idx].lineType  = parsedData.lineType;
        G.figureLines[idx].elements  = parsedData.elements;
        G.figureLines[idx].code      = document.getElementById('coordInput').value;
        G.figureLines[idx].length    = newLength;
    }

    // Якщо це діагональ — оновлюємо позицію кінцевої точки
    if (G.figureLines[idx].isDiagonal && newLength > 0) {
        _applyDiagonalConstraint(G.figureLines[idx].from, G.figureLines[idx].to, newLength);
        return;
    }

    redrawEntireFigure();
};


/* ── Перемалювання всієї фігури ── */
window.redrawEntireFigure = function () {
    const svg = document.getElementById('shapeCanvas');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    _rebuildChainPoints();
    renderStartPoint(svg);

    G.figureLines.forEach(function(lineData) {
        const fromPt = G.shapePoints.find(function(p) { return p.num === lineData.from; });
        const toPt   = lineData.isClosing
            ? G.shapePoints[0]
            : G.shapePoints.find(function(p) { return p.num === lineData.to; });
        if (!fromPt || !toPt) return;

        if (lineData.isDiagonal) {
            if (typeof _renderSvgDashedLine === 'function') {
                _renderSvgDashedLine(svg, fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.id);
            } else {
                _renderSvgLine(svg, fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.id);
            }
            drawLineDimension(fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.length, lineData);
        } else {
            if (lineData.lineType === 'curve') {
                const arcP = _parseArcParams(lineData.elements || []);
                const sag = arcP ? arcP.sagMeters * SCALE : 0;
                _renderSvgArc(svg, fromPt.x, fromPt.y, toPt.x, toPt.y, sag, lineData.id);
            } else {
                _renderSvgLine(svg, fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.id);
            }
            drawLineDimension(fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.length, lineData);
            drawElementsOnLine(lineData, fromPt.x, fromPt.y, toPt.x, toPt.y, SCALE);
            if (!lineData.isClosing) {
                _renderSvgPoint(svg, toPt.x, toPt.y, toPt.num);
            }
        }
    });

    G.pointCounter = G.shapePoints.length;
    if (G.figureLines.some(function(l) { return l.isClosing && !l.isDiagonal; })) {
        calculateAndDisplayArea();
    }
    updateLinesList();
    autoScaleAndCenterFigure();
    drawRoomNumber();
};

/**
 * Перебудовує G.shapePoints ланцюговим методом.
 * Точка 1 = START_X/START_Y. Кожна наступна = кінець попередньої не-діагональної лінії.
 * Замикаюча лінія завжди йде до точки 1.
 * Діагоналі пов'язують наявні точки — нових не додають.
 */
window._rebuildChainPoints = function () {
    const sx = (G._overrideStart && G._overrideStart.x !== undefined) ? G._overrideStart.x : START_X;
    const sy = (G._overrideStart && G._overrideStart.y !== undefined) ? G._overrideStart.y : START_Y;
    G.shapePoints = [{ x: sx, y: sy, num: 1 }];
    let currentPointNum = 1;
    let prevUx = 1, prevUy = 0; // дефолтний вектор
    let isFirstLine = true;     // прапорець першої лінії

    G.figureLines.forEach(function(lineData, index) {
        if (lineData.isDiagonal) return;
        if (lineData.isClosing)  return;

        const lastPt    = G.shapePoints[G.shapePoints.length - 1];
        let endX = lastPt.x, endY = lastPt.y;
        const scaledLen = lineData.length * SCALE;

        if (lineData.isPending) {
            currentPointNum++;
            G.shapePoints.push({ x: lastPt.x, y: lastPt.y, num: currentPointNum, isTemp: true });
            G.figureLines[index].from = lastPt.num;
            G.figureLines[index].to   = currentPointNum;
            return;
        }

        if (lineData.direction === 'free' && lineData._cachedEnd) {
            endX = lineData._cachedEnd.x;
            endY = lineData._cachedEnd.y;
        } else if (lineData.direction === 'free') {
            endX = lastPt.x; endY = lastPt.y;
        } else {
            let vx, vy;
            if (isFirstLine) {
                // Перша лінія: right = вправо, left = вліво (абсолютно горизонтально)
                vx = lineData.direction === 'left' ? -1 : 1;
                vy = 0;
            } else {
                // Наступні: поворот відносно попередньої
                switch (lineData.direction) {
                    case 'right':    vx = -prevUy; vy =  prevUx; break; // праворуч від напрямку
                    case 'left':     vx =  prevUy; vy = -prevUx; break; // ліворуч від напрямку
                    case 'straight': vx =  prevUx; vy =  prevUy; break; // прямо (продовження)
                    default:         vx =  prevUx; vy =  prevUy; break;
                }
            }
            endX = lastPt.x + vx * scaledLen;
            endY = lastPt.y + vy * scaledLen;
        }

        if (lineData._fixedTo !== undefined && lineData._fixedTo !== null) {
            if (typeof lineData._fixedTo === 'number') {
                currentPointNum = lineData._fixedTo;
            }
            G.shapePoints.push({ x: endX, y: endY, num: lineData._fixedTo });
            G.figureLines[index].from = lastPt.num;
            G.figureLines[index].to   = lineData._fixedTo;
        } else {
            currentPointNum++;
            G.shapePoints.push({ x: endX, y: endY, num: currentPointNum });
            G.figureLines[index].from = lastPt.num;
            G.figureLines[index].to   = currentPointNum;
        }

        // Оновлюємо вектор і скидаємо прапорець першої лінії
        const dx = endX - lastPt.x, dy = endY - lastPt.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) { prevUx = dx / len; prevUy = dy / len; }
        isFirstLine = false;
    });

    G.pointCounter = currentPointNum;

    G.figureLines.forEach(function(lineData, index) {
        if (!lineData.isClosing || lineData.isDiagonal) return;
        const lastNonDiag = G.shapePoints[G.shapePoints.length - 1];
        G.figureLines[index].from = lastNonDiag.num;
        G.figureLines[index].to   = 1;
        _updateClosingLineLength(index);
    });
};

/** Оновлює довжину замикаючої лінії за реальними координатами */
window._updateClosingLineLength = function (closingIdx) {
    const cl     = G.figureLines[closingIdx];
    const fromPt = G.shapePoints.find(function(p) { return p.num === cl.from; });
    if (!fromPt) return;
    const toPt   = G.shapePoints[0];
    const realLen = parseFloat(
        (Math.sqrt(Math.pow(toPt.x - fromPt.x, 2) + Math.pow(toPt.y - fromPt.y, 2)) / SCALE).toFixed(3)
    );
    G.figureLines[closingIdx].length = realLen;
    for (let i = G.figureLines[closingIdx].elements.length - 1; i >= 0; i--) {
        if (G.figureLines[closingIdx].elements[i].type === 'number') {
            G.figureLines[closingIdx].elements[i].value = realLen;
            break;
        }
    }
};
/* ── Розрахунок free-ліній (теорема косинусів) ── */
window._calcFreeLineEnd = function (currentPoint, firstPoint, lineData, closingLine) {
    const a = lineData.length    * SCALE;
    const c = closingLine.length * SCALE;
    const dx = currentPoint.x - firstPoint.x;
    const dy = currentPoint.y - firstPoint.y;
    const b  = Math.sqrt(dx * dx + dy * dy);

    const cosAngle  = (a * a + b * b - c * c) / (2 * a * b);
    const angle     = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    const baseAngle = Math.atan2(firstPoint.y - currentPoint.y, firstPoint.x - currentPoint.x);

    let finalAngle;
    switch (lineData.quadrant) {
        case 'bottom': finalAngle = baseAngle - angle; break;
        case 'right':  finalAngle = baseAngle - angle; break;
        default:       finalAngle = baseAngle + angle; break;
    }

    return {
        x: currentPoint.x + Math.cos(finalAngle) * a,
        y: currentPoint.y + Math.sin(finalAngle) * a
    };
};

window.calculateFreeAngleFigure = function () {
    if (G.pendingFreeLines.length === 0) {
        showToast('Немає ліній з невідомим кутом', 'warning'); return;
    }

    const closingLineData = G.pendingFreeLines.find(l => l.isClosing);
    if (!closingLineData) { showToast('Не знайдено замикаючу лінію', 'error'); return; }

    const closingLength = closingLineData.elements.find(e => e.type === 'number')?.value || 0;

    let currentPoint = null;
    for (let i = G.shapePoints.length - 1; i >= 0; i--) {
        if (!G.shapePoints[i].isTemp) { currentPoint = G.shapePoints[i]; break; }
    }
    if (!currentPoint) { showToast('Не знайдено початкову точку', 'error'); return; }

    const firstPoint = G.shapePoints[0];

    const processPendingLine = (pendingLine) => {
        const lineData   = { ...pendingLine, length: pendingLine.length };
        const closingRef = { length: closingLength };
        const { x: endX, y: endY } = _calcFreeLineEnd(currentPoint, firstPoint, lineData, closingRef);

        const tempIdx = G.shapePoints.findIndex(p => p.isTemp);
        if (tempIdx !== -1) {
            G.shapePoints[tempIdx].x      = endX;
            G.shapePoints[tempIdx].y      = endY;
            G.shapePoints[tempIdx].isTemp = false;
        }

        pendingLine.isPending = false;
        pendingLine.to        = G.shapePoints[tempIdx]?.num || 2;
        return { endX, endY, tempIdx };
    };

    if (G.pendingFreeLines.length === 1) {
        const pendingLine = G.pendingFreeLines[0];
        processPendingLine(pendingLine);

        G.pendingFreeLines = [];

        const lineData = _makeLineData(
            G.lineIdCounter++,
            pendingLine.to, 1,
            { direction: closingLineData.direction, lineType: closingLineData.lineType, elements: closingLineData.elements, quadrant: null },
            closingLength, true, false
        );
        G.figureLines.push(lineData);

        appState.isClosingLine = false;
        redrawEntireFigure();
        showToast('Фігуру розраховано успішно!', 'success');

    } else if (G.pendingFreeLines.length === 2) {
        const regularLine = G.pendingFreeLines.find(l => !l.isClosing);
        const closingFree = G.pendingFreeLines.find(l =>  l.isClosing);
        if (!regularLine || !closingFree) {
            showToast('Помилка: не знайдено потрібні лінії', 'error'); return;
        }

        const { tempIdx } = processPendingLine(regularLine);

        closingFree.isPending = false;
        closingFree.from      = G.shapePoints[tempIdx]?.num || 2;
        closingFree.to        = 1;

        G.pendingFreeLines = [];
        appState.isClosingLine = false;
        redrawEntireFigure();
        showToast('Трикутник розраховано успішно!', 'success');

    } else {
        showToast('Розрахунок для більше ніж двох free-ліній поки не підтримується', 'warning');
    }
};


/* ── Застосування діагонального обмеження ── */
/**
 * Встановлює відстань між точками pt1Num і pt2Num = diagDist.
 * Точка pt1Num і всі лінії до неї — фіксовані.
 * Рухається точка pt2Num: знаходимо лінію що закінчується в pt2Num (лінія X→pt2),
 * і змінюємо її direction='free' + _cachedEnd так, щоб pt2 виявилась на відстані diagDist від pt1.
 * Довжина лінії X→pt2 зберігається (не змінюється).
 * Між pt1Num і pt2Num додається штрихова діагональна лінія.
 */
window._applyDiagonalConstraint = function (pt1Num, pt2Num, diagDist) {
    // Спочатку синхронізуємо G.shapePoints з поточним станом G.figureLines
    _rebuildChainPoints();

    // Якщо перше число більше другого — міняємо місцями (діагональ симетрична)
    if (pt1Num > pt2Num) { const tmp = pt1Num; pt1Num = pt2Num; pt2Num = tmp; }

    let lineIdx = G.figureLines.findIndex(function(l) {
        return !l.isDiagonal && !l.isClosing && l.to === pt2Num;
    });
    if (lineIdx === -1) {
        showToast('Лінія що веде до точки ' + pt2Num + ' не знайдена', 'error');
        return;
    }

    // Координата pt1 (фіксована — звідси вимірюємо діагональ)
    const p1 = G.shapePoints.find(function(p) { return p.num === pt1Num; });
    if (!p1) { showToast('Точку ' + pt1Num + ' не знайдено', 'error'); return; }

    // Початок лінії X→pt2 (фіксований, бо лежить до pt2 у ланцюгу)
    const lineFromNum = G.figureLines[lineIdx].from;
    const pFrom = G.shapePoints.find(function(p) { return p.num === lineFromNum; });
    if (!pFrom) { showToast('Початкову точку лінії не знайдено', 'error'); return; }

    // Довжина лінії X→pt2 (зберігаємо)
    const lineLen = G.figureLines[lineIdx].length * SCALE;  // px
    const diagPx  = diagDist * SCALE;                        // px

    // Відстань від p1 до pFrom (відома, фіксована)
    const dx_pf = pFrom.x - p1.x;
    const dy_pf = pFrom.y - p1.y;
    const distP1toFrom = Math.sqrt(dx_pf * dx_pf + dy_pf * dy_pf);

    // Нам треба знайти точку pt2_new таку що:
    //   |pFrom → pt2_new| = lineLen
    //   |p1    → pt2_new| = diagPx
    //
    // Це перетин двох кіл: коло C1(pFrom, lineLen) і коло C2(p1, diagPx).
    // Розв'язуємо систему.

    const d = Math.sqrt(Math.pow(pFrom.x - p1.x, 2) + Math.pow(pFrom.y - p1.y, 2));

    if (d === 0) {
        showToast('Точки pt1 і початок лінії збігаються', 'error');
        return;
    }
    if (d > lineLen + diagPx) {
        showToast('Відстань між точками завелика — кола не перетинаються', 'error');
        return;
    }
    if (d < Math.abs(lineLen - diagPx)) {
        showToast('Одне коло всередині іншого — перетин неможливий', 'error');
        return;
    }

    // Знаходимо точку перетину двох кіл
    // a = (lineLen² - diagPx² + d²) / (2d)
    const a = (lineLen * lineLen - diagPx * diagPx + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, lineLen * lineLen - a * a));

    // Одиничний вектор pFrom → p1
    const ux = (p1.x - pFrom.x) / d;
    const uy = (p1.y - pFrom.y) / d;

    // Перпендикуляр
    const px = -uy, py = ux;

    // Два варіанти перетину
    const midX = pFrom.x + a * ux;
    const midY = pFrom.y + a * uy;
    const pt2a = { x: midX + h * px, y: midY + h * py };
    const pt2b = { x: midX - h * px, y: midY - h * py };

    // Вибираємо варіант ближчий до поточної позиції pt2
    const currentPt2 = G.shapePoints.find(function(p) { return p.num === pt2Num; });
    let newPt2;
    if (currentPt2) {
        const da = Math.hypot(pt2a.x - currentPt2.x, pt2a.y - currentPt2.y);
        const db = Math.hypot(pt2b.x - currentPt2.x, pt2b.y - currentPt2.y);
        newPt2 = da <= db ? pt2a : pt2b;
    } else {
        newPt2 = pt2a;
    }

    // Зберігаємо стару позицію pt2 до оновлення (потрібна для rigid-body rotation)
    const pt2Idx = G.shapePoints.findIndex(function(p) { return p.num === pt2Num; });
    const _savedOldPt2X = pt2Idx !== -1 ? G.shapePoints[pt2Idx].x : newPt2.x;
    const _savedOldPt2Y = pt2Idx !== -1 ? G.shapePoints[pt2Idx].y : newPt2.y;

    // Оновлюємо лінію X→pt2: direction=free, _cachedEnd = нова позиція pt2
    G.figureLines[lineIdx].direction  = 'free';
    G.figureLines[lineIdx]._cachedEnd = { x: newPt2.x, y: newPt2.y };

    // Оновлюємо G.shapePoints[pt2] на нову позицію
    if (pt2Idx !== -1) {
        G.shapePoints[pt2Idx].x = newPt2.x;
        G.shapePoints[pt2Idx].y = newPt2.y;
    }

    // Знаходимо індекс pt1 у G.shapePoints
    const pt1Idx = G.shapePoints.findIndex(function(p) { return p.num === pt1Num; });
    const pt2ShapeIdx = pt2Idx;
    const pt1ShapeIdx = pt1Idx;

    if (pt2ShapeIdx !== -1 && pt1ShapeIdx !== -1 && pt2ShapeIdx < pt1ShapeIdx) {
        // Між pt2 і pt1 є проміжні точки — повертаємо підланцюг як жорстке тіло.
        // Кут повороту = різниця кутів вектора (oldPt2→pt1) і (newPt2→pt1).
        const oldPt1 = G.shapePoints[pt1ShapeIdx]; // pt1 не змінюється
        const rotAngleOld = Math.atan2(oldPt1.y - _savedOldPt2Y, oldPt1.x - _savedOldPt2X);
        const rotAngleNew = Math.atan2(oldPt1.y - newPt2.y,      oldPt1.x - newPt2.x);
        const rotDelta = rotAngleNew - rotAngleOld;
        const cosA = Math.cos(rotDelta), sinA = Math.sin(rotDelta);

        // Повертаємо всі точки між pt2 (не вкл) і pt1 (не вкл)
        for (let i = lineIdx + 1; i < G.figureLines.length; i++) {
            const l = G.figureLines[i];
            if (l.isDiagonal || l.isClosing || l.isPending) continue;
            if (l.from === pt1Num || l.to === pt1Num) break;

            const toPt = G.shapePoints.find(function(p) { return p.num === l.to; });
            if (!toPt) continue;
            // Повертаємо toPt навколо _savedOldPt2 на rotDelta, потім зміщуємо на (newPt2 - _savedOldPt2)
            const relX = toPt.x - _savedOldPt2X;
            const relY = toPt.y - _savedOldPt2Y;
            const newX = newPt2.x + relX * cosA - relY * sinA;
            const newY = newPt2.y + relX * sinA + relY * cosA;
            toPt.x = newX; toPt.y = newY;
            l.direction  = 'free';
            l._cachedEnd = { x: newX, y: newY };
        }
        // Лінія що веде ДО pt1 — фіксуємо _cachedEnd = стара позиція pt1 (незмінна)
        for (let i = lineIdx + 1; i < G.figureLines.length; i++) {
            const l = G.figureLines[i];
            if (l.isDiagonal || l.isPending) continue;
            if (l.to === pt1Num) {
                l.direction  = 'free';
                l._cachedEnd = { x: oldPt1.x, y: oldPt1.y };
                break;
            }
        }
        // Лінії після pt1 — фіксуємо у поточних позиціях G.shapePoints
        let pastPt1 = false;
        for (let i = 0; i < G.figureLines.length; i++) {
            const l = G.figureLines[i];
            if (l.isDiagonal || l.isClosing || l.isPending) continue;
            if (l.from === pt1Num) pastPt1 = true;
            if (!pastPt1) continue;
            const toPt = G.shapePoints.find(function(p) { return p.num === l.to; });
            if (!toPt) continue;
            l.direction  = 'free';
            l._cachedEnd = { x: toPt.x, y: toPt.y };
        }
    } else {
        // pt2 пізніша за pt1 або немає проміжних точок:
        // тягнемо всі лінії після pt2 паралельно (зі збереженням напрямку)
        let prevX = newPt2.x, prevY = newPt2.y;
        for (let i = lineIdx + 1; i < G.figureLines.length; i++) {
            const l = G.figureLines[i];
            if (l.isDiagonal || l.isClosing || l.isPending) continue;

            const toPt   = G.shapePoints.find(function(p) { return p.num === l.to; });
            if (!toPt) continue;
            const fromPt = G.shapePoints.find(function(p) { return p.num === l.from; });
            if (!fromPt) continue;

            const oldDx = toPt.x - fromPt.x;
            const oldDy = toPt.y - fromPt.y;
            const oldLen = Math.sqrt(oldDx * oldDx + oldDy * oldDy);

            let newEndX, newEndY;
            if (oldLen > 0) {
                newEndX = prevX + (oldDx / oldLen) * l.length * SCALE;
                newEndY = prevY + (oldDy / oldLen) * l.length * SCALE;
            } else {
                newEndX = prevX + l.length * SCALE;
                newEndY = prevY;
            }

            l.direction  = 'free';
            l._cachedEnd = { x: newEndX, y: newEndY };

            const endPtIdx = G.shapePoints.findIndex(function(p) { return p.num === l.to; });
            if (endPtIdx !== -1) {
                G.shapePoints[endPtIdx].x = newEndX;
                G.shapePoints[endPtIdx].y = newEndY;
            }
            prevX = newEndX; prevY = newEndY;
        }
    }
    // Зберігаємо/оновлюємо діагональну (штрихову) лінію pt1↔pt2 в G.figureLines
    const existDiagIdx = G.figureLines.findIndex(function(l) {
        return l.isDiagonal &&
               ((l.from === pt1Num && l.to === pt2Num) ||
                (l.from === pt2Num && l.to === pt1Num));
    });
    const diagLineData = {
        id:               existDiagIdx !== -1 ? G.figureLines[existDiagIdx].id : G.lineIdCounter++,
        from:             pt1Num,
        to:               pt2Num,
        isDiagonal:       true,
        isClosing:        false,
        isPending:        false,
        direction:        'free',
        lineType:         'line',
        length:           diagDist,
        elements:         [{ type: 'number', value: diagDist }],
        code:             'diagonal\nline\n' + diagDist,
        dimensionVisible: true,
        dimensionRotated: false,
        _cachedEnd:       null
    };
    if (existDiagIdx !== -1) {
        G.figureLines[existDiagIdx] = diagLineData;
    } else {
        G.figureLines.push(diagLineData);
    }

    redrawEntireFigure();
    showToast('Діагональ ' + pt1Num + '-' + pt2Num + ' = ' + diagDist + ' м застосовано', 'success');
};

/* ── Відкриття елемента (WI1 тощо) у редакторі фігур — ВИМКНЕНО ── */
window.openElementInShapeEditor = function (item, hostLine, el) {
    showToast('Редагування елементів вікна вимкнено у цій версії', 'info');
};

window._openElementInShapeEditorLegacy = function (item, hostLine, el) {
    appState.editingHierarchyItemId = null;
    appState.viewingElementMode = true;            // прапорець «режим елемента» (не звичайний редактор)
    appState.viewingElementSource = { item, hostLine, el };
    appState.editingElementThickness = typeof hostLine._elementThickness === 'number'
        ? hostLine._elementThickness
        : (typeof el.thickness === 'number' ? el.thickness : ELEMENT_THICKNESS);
    appState.editingElementBinding   = hostLine._elementBinding || el.binding || null;

    // Скидаємо окремий масив ліній для цього режиму
    G.elementEditorLines   = [];   // лінії що малюються кнопкою «Додати»
    G.elementEditorPoints  = [];   // їх точки (починаючи з точки 1 = START_X, START_Y)
    G.elementEditorCounter = 1;

    // Завантажуємо фігуру для перерахунку координат хоста
    const figureLines = JSON.parse(JSON.stringify(item.figureLines));
    const shapePoints = JSON.parse(JSON.stringify(item.shapePoints));

    // Перебудовуємо координати
    const savedLines  = G.figureLines;
    const savedPoints = G.shapePoints;
    G.figureLines = figureLines;
    G.shapePoints = shapePoints;
    _rebuildChainPoints();
    const rebuildPoints = G.shapePoints;
    G.figureLines = savedLines;
    G.shapePoints = savedPoints;

    // Знаходимо точки лінії-хоста
    const fromPt = rebuildPoints.find(p => p.num === hostLine.from);
    const toPt   = hostLine.isClosing ? rebuildPoints[0] : rebuildPoints.find(p => p.num === hostLine.to);

    if (!fromPt || !toPt) {
        showToast('Не вдалося знайти координати лінії елемента', 'error');
        appState.viewingElementMode = false;
        return;
    }

    // Зберігаємо координати хоста для подальшого малювання
    appState.viewingElementTransform = { x1: fromPt.x, y1: fromPt.y, x2: toPt.x, y2: toPt.y };

    // Відкриваємо модалку
    document.getElementById('shapeModal').style.display = 'block';

    // Оновлюємо тулбар (показуємо інфо + кнопку товщини, ховаємо зайві кнопки)
    if (typeof _updateShapeModalToolbar === 'function') _updateShapeModalToolbar();

    _redrawElementEditorCanvas();
    updateLinesList();
};

window._redrawElementEditorCanvas = function () {
    if (!appState.viewingElementMode || !appState.viewingElementTransform) return;

    const svg = document.getElementById('shapeCanvas');
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const { x1, y1, x2, y2 } = appState.viewingElementTransform;
    const { hostLine, el } = appState.viewingElementSource;
    const thickness = appState.editingElementThickness;

    // Вектор вздовж лінії-хоста
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len;
    const px = uy, py = -ux;   // перпендикуляр

    const elStartPx = el.start * SCALE;
    const elEndPx   = el.end   * SCALE;
    const side      = el.side || 1;

    // Кути вікна на протилежному боці (A = початок, B = кінець)
    const wA_x = x1 + ux * elStartPx + px * thickness * SCALE * side;
    const wA_y = y1 + uy * elStartPx + py * thickness * SCALE * side;
    const wB_x = x1 + ux * elEndPx   + px * thickness * SCALE * side;
    const wB_y = y1 + uy * elEndPx   + py * thickness * SCALE * side;

    // Зберігаємо координати кутів для A/B прив'язки
    appState.viewingElementTransform.wA = { x: wA_x, y: wA_y };
    appState.viewingElementTransform.wB = { x: wB_x, y: wB_y };

    // Малюємо лінію-хост
    _renderSvgLine(svg, x1, y1, x2, y2);
    drawLineDimension(x1, y1, x2, y2, hostLine.length, hostLine);

    // Малюємо вікно (елемент на лінії)
    drawElementsOnLine(hostLine, x1, y1, x2, y2, SCALE, svg, thickness);

    // Малюємо протилежну сторону вікна (штрихова)
    _renderSvgDashedLine(svg, wA_x, wA_y, wB_x, wB_y);

    // Мітки кутів 1 і 2
    _renderWindowCornerLabel(svg, wA_x, wA_y, '1');
    _renderWindowCornerLabel(svg, wB_x, wB_y, '2');

    // Розмір вікна над штриховою лінією
    const winLen = (el.end - el.start).toFixed(2);
    const midWx  = (wA_x + wB_x) / 2;
    const midWy  = (wA_y + wB_y) / 2;
    const wAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    svg.appendChild(_makeSvgText(midWx + px * 14 * side, midWy + py * 14 * side, winLen + 'м', wAngle));

    // Реальні номери точок хост-лінії
    const fromNum = hostLine.from;
    const toNum   = hostLine.isClosing
        ? (appState.viewingElementSource.item.shapePoints[0]?.num ?? 1)
        : hostLine.to;

    // Ініціалізуємо elementEditorPoints двома реальними точками хост-лінії
    if (!G.elementEditorPoints || G.elementEditorPoints.length === 0) {
        G.elementEditorPoints  = [
            { x: x1, y: y1, num: fromNum },
            { x: x2, y: y2, num: toNum }
        ];
        G.elementEditorCounter = toNum;
    } else {
        // Оновлюємо координати (якщо товщина змінилась — кути зрушились)
        G.elementEditorPoints[0] = { x: x1, y: y1, num: fromNum };
        if (G.elementEditorPoints.length < 2) {
            G.elementEditorPoints.push({ x: x2, y: y2, num: toNum });
        } else {
            G.elementEditorPoints[1] = { x: x2, y: y2, num: toNum };
        }
    }

    // Малюємо точки хост-лінії з їхніми реальними номерами
    _renderSvgPoint(svg, x1, y1, fromNum);
    _renderSvgPoint(svg, x2, y2, toNum);

    // Малюємо лінію прив'язки (якщо задана)
    const bp = appState.editingElementBinding;
    if (bp && (bp.corner === 1 || bp.corner === 2) && bp.dist > 0) {
        // Опорна точка вікна: corner=1 => wA, corner=2 => wB
        const anchorX = bp.corner === 1 ? wA_x : wB_x;
        const anchorY = bp.corner === 1 ? wA_y : wB_y;
        // Напрямок уздовж лінії вікна (wA → wB)
        const wdx = wB_x - wA_x, wdy = wB_y - wA_y;
        const wlen = Math.sqrt(wdx * wdx + wdy * wdy);
        let bx, by;
        if (wlen > 0) {
            // corner=1 (anchor=wA): нова точка протилежна до 2 → напрямок геть від wB = wA-wB = (-wdx,-wdy)
            // corner=2 (anchor=wB): нова точка протилежна до 1 → напрямок геть від wA = wB-wA = (wdx,wdy)
            const sign = bp.corner === 1 ? -1 : 1;
            const wux = sign * wdx / wlen;
            const wuy = sign * wdy / wlen;
            bx = anchorX + wux * bp.dist * SCALE;
            by = anchorY + wuy * bp.dist * SCALE;
        } else {
            bx = anchorX;
            by = anchorY;
        }
        // Малюємо лінію від anchor до нової точки
        _renderSvgLine(svg, anchorX, anchorY, bx, by);
        // Розмір лінії прив'язки
        drawLineDimension(anchorX, anchorY, bx, by, bp.dist, { dimensionVisible: true, dimensionRotated: false });
        // Крапка нової точки (без номера — просто маркер)
        const bCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        bCircle.setAttribute('cx', bx); bCircle.setAttribute('cy', by);
        bCircle.setAttribute('r', '5'); bCircle.setAttribute('fill', '#FF9800');
        svg.appendChild(bCircle);
        // Додаємо координати нової точки до allX/allY через збереження в тимчасову змінну
        appState._bindingPoint = { x: bx, y: by };
    } else {
        appState._bindingPoint = null;
    }

    // Малюємо додані лінії
    if (G.elementEditorLines && G.elementEditorLines.length > 0) {
        const pts = G.elementEditorPoints;
        G.elementEditorLines.forEach(function (eLine) {
            const fPt = pts.find(p => p.num === eLine.from);
            const tPt = pts.find(p => p.num === eLine.to);
            if (!fPt || !tPt) return;
            _renderSvgLine(svg, fPt.x, fPt.y, tPt.x, tPt.y);
            drawLineDimension(fPt.x, fPt.y, tPt.x, tPt.y, eLine.length, eLine);
            _renderSvgPoint(svg, tPt.x, tPt.y, tPt.num);
        });
    }

    // viewBox — тільки навколо хост-лінії, вікна і доданих точок
    const allX = [x1, x2, wA_x, wB_x];
    const allY = [y1, y2, wA_y, wB_y];
    if (appState._bindingPoint) {
        allX.push(appState._bindingPoint.x);
        allY.push(appState._bindingPoint.y);
    }
    if (G.elementEditorLines && G.elementEditorLines.length > 0) {
        G.elementEditorPoints.forEach(p => { allX.push(p.x); allY.push(p.y); });
    }
    const minX = Math.min(...allX), maxX = Math.max(...allX);
    const minY = Math.min(...allY), maxY = Math.max(...allY);
    const fw = maxX - minX, fh = maxY - minY;
    const pad = Math.max(fw * 0.25, fh * 0.25, 60);
    const vbSz = Math.max(fw, fh) + pad * 2;
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    svg.setAttribute('viewBox', `${cx - vbSz / 2} ${cy - vbSz / 2} ${vbSz} ${vbSz}`);
};

/** Малює мітку кута вікна (A або B) */
window._renderWindowCornerLabel = function (svg, x, y, label) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', '5'); circle.setAttribute('fill', '#9C27B0');
    svg.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 10); text.setAttribute('y', y - 5);
    text.setAttribute('font-size', '14'); text.setAttribute('fill', '#9C27B0');
    text.setAttribute('font-weight', 'bold');
    text.textContent = label;
    svg.appendChild(text);
};

/**
 * Додає нову лінію до G.elementEditorLines на основі parsedData.
 * Перша лінія виходить із точки START_X, START_Y.
 * Напрямок обчислюється за тим самим алгоритмом що і у звичайному редакторі,
 * але відносно попередньої лінії в elementEditorLines.
 */
window._addLineToElementEditor = function (parsedData) {
    if (!G.elementEditorPoints || G.elementEditorPoints.length === 0) {
        const tr = appState.viewingElementTransform;
        const hl = appState.viewingElementSource?.hostLine;
        const fromNum = hl ? hl.from : 1;
        const toNum   = hl ? (hl.isClosing
            ? (appState.viewingElementSource?.item?.shapePoints[0]?.num ?? 1)
            : hl.to) : 2;
        const x1 = tr ? tr.x1 : START_X;
        const y1 = tr ? tr.y1 : START_Y;
        const x2 = tr ? tr.x2 : START_X + SCALE;
        const y2 = tr ? tr.y2 : START_Y;
        G.elementEditorPoints  = [
            { x: x1, y: y1, num: fromNum },
            { x: x2, y: y2, num: toNum }
        ];
        G.elementEditorLines   = [];
        G.elementEditorCounter = toNum;
    }

    let lineLength = 0;
    for (let i = parsedData.elements.length - 1; i >= 0; i--) {
        if (parsedData.elements[i].type === 'number') {
            lineLength = parsedData.elements[i].value;
            break;
        }
    }

    if (lineLength <= 0) {
        showToast('Довжина лінії має бути більше нуля', 'warning');
        return;
    }

    const lastPt    = G.elementEditorPoints[G.elementEditorPoints.length - 1];
    const scaledLen = lineLength * SCALE;

    // Обчислення напрямку відносно попередньої лінії елемента
    let vx, vy;
    const hasLines = G.elementEditorLines.length > 0;

    if (!hasLines) {
        vx = parsedData.direction === 'left' ? -1 : 1;
        vy = 0;
    } else {
        const prevEl = G.elementEditorLines[G.elementEditorLines.length - 1];
        const prevFrom = G.elementEditorPoints.find(p => p.num === prevEl.from);
        const prevTo   = G.elementEditorPoints.find(p => p.num === prevEl.to);
        let prevUx = 1, prevUy = 0;
        if (prevFrom && prevTo) {
            const pdx = prevTo.x - prevFrom.x, pdy = prevTo.y - prevFrom.y;
            const plen = Math.sqrt(pdx * pdx + pdy * pdy);
            if (plen > 0) { prevUx = pdx / plen; prevUy = pdy / plen; }
        }
        switch (parsedData.direction) {
            case 'right':    vx = -prevUy; vy =  prevUx; break;
            case 'left':     vx =  prevUy; vy = -prevUx; break;
            case 'straight': vx =  prevUx; vy =  prevUy; break;
            default:         vx =  prevUx; vy =  prevUy; break;
        }
    }

    const endX = lastPt.x + vx * scaledLen;
    const endY = lastPt.y + vy * scaledLen;

    G.elementEditorCounter++;
    const newPtNum = G.elementEditorCounter;
    G.elementEditorPoints.push({ x: endX, y: endY, num: newPtNum });

    G.elementEditorLines.push({
        id:               G.elementEditorLines.length + 1,
        from:             lastPt.num,
        to:               newPtNum,
        direction:        parsedData.direction,
        lineType:         parsedData.lineType,
        elements:         parsedData.elements,
        length:           lineLength,
        dimensionVisible: true,
        dimensionRotated: false
    });

    _redrawElementEditorCanvas();
    updateLinesList();
    showToast('Лінію додано', 'success');
};

window._drawShapeLine = function (x1, y1, x2, y2, length, isClosing, lineData) {
    const svg = document.getElementById('shapeCanvas');
    _renderSvgLine(svg, x1, y1, x2, y2);
    const numLen = typeof length === 'number' ? length : parseFloat(length);
    drawLineDimension(x1, y1, x2, y2, numLen, lineData);
    if (!isClosing) _renderSvgPoint(svg, x2, y2, G.pointCounter + 1);
};
