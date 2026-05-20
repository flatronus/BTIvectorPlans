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
    area = Math.abs(area) / 2;
    appState.calculatedArea = (area / (SCALE * SCALE)).toFixed(1);
    updateLinesList();
};

/* ── Автомасштабування shapeCanvas ── */
window.autoScaleAndCenterFigure = function () {
    if (G.shapePoints.length < 2) return;
    const svg = document.getElementById('shapeCanvas');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    G.shapePoints.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    });
    const fw = maxX - minX, fh = maxY - minY;
    const padX = Math.max(fw * 0.2, 50);
    const padY = Math.max(fh * 0.2, 50);
    svg.setAttribute('viewBox', `${minX - padX} ${minY - padY} ${fw + padX * 2} ${fh + padY * 2}`);
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

    for (let i = parsedData.elements.length - 1; i >= 0; i--) {
        if (parsedData.elements[i].type === 'number') {
            lineLength = parseFloat(parsedData.elements[i].value);
            break;
        }
    }

    if (isClosing) {
        endX = G.shapePoints[0].x;
        endY = G.shapePoints[0].y;
    } else {
        const scaledLen = lineLength * SCALE;
        switch (parsedData.direction) {
            case 'top':    endY = lastPoint.y - scaledLen; break;
            case 'bottom': endY = lastPoint.y + scaledLen; break;
            case 'left':   endX = lastPoint.x - scaledLen; break;
            case 'right':  endX = lastPoint.x + scaledLen; break;
        }
    }

    _renderSvgLine(svg, lastPoint.x, lastPoint.y, endX, endY, G.lineIdCounter);
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

/* ── Редагування лінії ── */
window.editLine = function (line) {
    document.getElementById('coordModal').style.display = 'block';
    document.getElementById('coordInput').value = line.code;
    appState.editingLineId = line.id;
    setTimeout(() => document.getElementById('coordInput').focus(), 100);
};

window.updateExistingLine = function (lineId, parsedData) {
    const idx = G.figureLines.findIndex(function(l) { return l.id === lineId; });
    if (idx === -1) { showToast('Лінію не знайдено', 'error'); return; }

    let newLength = 0;
    for (let i = parsedData.elements.length - 1; i >= 0; i--) {
        if (parsedData.elements[i].type === 'number') { newLength = parsedData.elements[i].value; break; }
    }

    if (!G.figureLines[idx].isDiagonal && newLength <= 0) {
        showToast('Довжина лінії не може бути нульовою або від\'ємною', 'warning');
        return;
    }

    G.figureLines[idx].direction = parsedData.direction;
    G.figureLines[idx].lineType  = parsedData.lineType;
    G.figureLines[idx].elements  = parsedData.elements;
    G.figureLines[idx].code      = document.getElementById('coordInput').value;
    G.figureLines[idx].length    = newLength;

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
            _renderSvgLine(svg, fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.id);
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
    G.shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
    let currentPointNum = 1;

    G.figureLines.forEach(function(lineData, index) {
        if (lineData.isDiagonal) return;
        if (lineData.isClosing)  return;

        const lastPt    = G.shapePoints[G.shapePoints.length - 1];
        let endX = lastPt.x, endY = lastPt.y;
        const scaledLen = lineData.length * SCALE;

        if (lineData.direction === 'free' && lineData.isPending) {
            currentPointNum++;
            G.shapePoints.push({ x: lastPt.x, y: lastPt.y, num: currentPointNum, isTemp: true });
            G.figureLines[index].from = lastPt.num;
            G.figureLines[index].to   = currentPointNum;
            return;
        }

        if (lineData.direction === 'free' && lineData._cachedEnd) {
            endX = lineData._cachedEnd.x;
            endY = lineData._cachedEnd.y;
        } else {
            switch (lineData.direction) {
                case 'top':    endY = lastPt.y - scaledLen; break;
                case 'bottom': endY = lastPt.y + scaledLen; break;
                case 'left':   endX = lastPt.x - scaledLen; break;
                case 'right':  endX = lastPt.x + scaledLen; break;
            }
        }

        currentPointNum++;
        G.shapePoints.push({ x: endX, y: endY, num: currentPointNum });
        G.figureLines[index].from = lastPt.num;
        G.figureLines[index].to   = currentPointNum;
    });

    G.pointCounter = currentPointNum;

    // Прив'язуємо замикаючі лінії та оновлюємо їх довжину
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
 * Фіксує pt1 (і всі лінії до неї).
 * Переміщує pt2 — кінець лінії pt1→pt2 — так, щоб відстань pt1→pt2 = diagDist.
 * Лінія pt1→pt2 отримує direction='free', length=diagDist, _cachedEnd={x,y}.
 * Діагональ (штрихова лінія між pt1Num і pt2Num) зберігається/оновлюється в G.figureLines.
 */
window._applyDiagonalConstraint = function (pt1Num, pt2Num, diagDist) {
    // Знаходимо лінію pt1 → pt2 (безпосередню, не діагональну)
    const lineIdx = G.figureLines.findIndex(function(l) {
        return !l.isDiagonal && l.from === pt1Num && l.to === pt2Num;
    });
    if (lineIdx === -1) {
        showToast('Лінія ' + pt1Num + '→' + pt2Num + ' не знайдена', 'error');
        return;
    }

    // Координата pt1 (фіксована)
    const p1 = G.shapePoints.find(function(p) { return p.num === pt1Num; });
    if (!p1) { showToast('Точку ' + pt1Num + ' не знайдено', 'error'); return; }

    // Знаходимо "партнерську" точку для діагоналі.
    // Діагональ введена як pt1Num + pt2Num, але pt2 — це кінець лінії pt1→pt2.
    // Нам потрібно знати, де зараз знаходиться pt1Num у ланцюгу, і куди повинна потрапити pt2Num.
    // Знаходимо точку, від якої виходить діагональ (anchor = pt1Num в ланцюгу),
    // і куди вона повинна вказувати.

    // Визначаємо: pt2Num — це точка, до якої йде ДІАГОНАЛЬ (вхідний параметр з modals).
    // pt2Num в нашій системі — це точка-якір (вже є в ланцюгу).
    // Шукаємо anchor-точку pt2Num:
    const anchor = G.shapePoints.find(function(p) { return p.num === pt2Num; });
    if (!anchor) { showToast('Точку ' + pt2Num + ' не знайдено', 'error'); return; }

    // Лінія pt1→pt2 у ланцюгу — це lineIdx.
    // Її довжина залишається такою ж (НЕ змінюємо), але КУТ змінюється.
    // Нова позиція pt2 = pt1 + вектор довжиною lineData.length,
    //   такий що відстань pt2_new → anchor = diagDist.
    const lineLen = G.figureLines[lineIdx].length * SCALE;  // довжина лінії pt1→pt2 в px
    const diagPx  = diagDist * SCALE;

    // Відстань від p1 до anchor
    const dx_anch = anchor.x - p1.x;
    const dy_anch = anchor.y - p1.y;
    const distToAnchor = Math.sqrt(dx_anch * dx_anch + dy_anch * dy_anch);

    if (distToAnchor === 0) { showToast('Точки збігаються', 'error'); return; }

    // Перевірка трикутника: lineLen, diagPx, distToAnchor
    if (lineLen + diagPx <= distToAnchor ||
        lineLen + distToAnchor <= diagPx ||
        diagPx + distToAnchor <= lineLen) {
        showToast('Неможливо побудувати трикутник з такою діагоналлю (порушена нерівність трикутника)', 'error');
        return;
    }

    // Теорема косинусів: кут при p1 між (p1→anchor) і (p1→pt2_new)
    // lineLen² = distToAnchor² + diagPx² - 2*distToAnchor*diagPx*cos(angle_at_anchor)  — НЕ те
    // Нам: знаємо |p1→pt2_new|=lineLen, |pt2_new→anchor|=diagPx, |p1→anchor|=distToAnchor
    // Кут при p1: cos(α) = (lineLen² + distToAnchor² - diagPx²) / (2*lineLen*distToAnchor)
    const cosAlpha = (lineLen * lineLen + distToAnchor * distToAnchor - diagPx * diagPx) /
                     (2 * lineLen * distToAnchor);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

    // Базовий кут p1 → anchor
    const baseAngle = Math.atan2(dy_anch, dx_anch);

    // Два варіанти положення pt2_new
    const angle1 = baseAngle + alpha;
    const angle2 = baseAngle - alpha;
    const pt2a = { x: p1.x + Math.cos(angle1) * lineLen, y: p1.y + Math.sin(angle1) * lineLen };
    const pt2b = { x: p1.x + Math.cos(angle2) * lineLen, y: p1.y + Math.sin(angle2) * lineLen };

    // Поточна позиція pt2 (до зміни)
    const currentPt2 = G.shapePoints.find(function(p) { return p.num === pt2Num; });
    let newPt2;
    if (currentPt2) {
        const da = Math.hypot(pt2a.x - currentPt2.x, pt2a.y - currentPt2.y);
        const db = Math.hypot(pt2b.x - currentPt2.x, pt2b.y - currentPt2.y);
        newPt2 = da <= db ? pt2a : pt2b;
    } else {
        newPt2 = pt2a;
    }

    // Оновлюємо лінію pt1→pt2: direction=free, зберігаємо length, запам'ятовуємо кінцеву точку
    G.figureLines[lineIdx].direction  = 'free';
    G.figureLines[lineIdx]._cachedEnd = { x: newPt2.x, y: newPt2.y };

    // Зберігаємо/оновлюємо діагональну лінію в G.figureLines
    const existDiagIdx = G.figureLines.findIndex(function(l) {
        return l.isDiagonal &&
               ((l.from === pt1Num && l.to === pt2Num) ||
                (l.from === pt2Num && l.to === pt1Num));
    });
    const diagLineData = {
        id:              existDiagIdx !== -1 ? G.figureLines[existDiagIdx].id : G.lineIdCounter++,
        from:            pt1Num,
        to:              pt2Num,
        isDiagonal:      true,
        isClosing:       false,
        isPending:       false,
        direction:       'free',
        lineType:        'line',
        length:          diagDist,
        elements:        [{ type: 'number', value: diagDist }],
        code:            'diagonal
line
' + diagDist,
        dimensionVisible: true,
        dimensionRotated: false,
        _cachedEnd:      null
    };
    if (existDiagIdx !== -1) {
        G.figureLines[existDiagIdx] = diagLineData;
    } else {
        G.figureLines.push(diagLineData);
    }

    redrawEntireFigure();
    showToast('Діагональ ' + pt1Num + '-' + pt2Num + ' = ' + diagDist + ' м застосовано', 'success');
};


/* ── Допоміжна: намалювати лінію + розмір + точку на shapeCanvas ── */
window._drawShapeLine = function (x1, y1, x2, y2, length, isClosing, lineData) {
    const svg = document.getElementById('shapeCanvas');
    _renderSvgLine(svg, x1, y1, x2, y2);
    const numLen = typeof length === 'number' ? length : parseFloat(length);
    drawLineDimension(x1, y1, x2, y2, numLen, lineData);
    if (!isClosing) _renderSvgPoint(svg, x2, y2, G.pointCounter + 1);
};
