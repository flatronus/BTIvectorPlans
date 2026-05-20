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
    const idx = G.figureLines.findIndex(l => l.id === lineId);
    if (idx === -1) { showToast('Лінію не знайдено', 'error'); return; }

    let newLength = 0;
    for (let i = parsedData.elements.length - 1; i >= 0; i--) {
        if (parsedData.elements[i].type === 'number') { newLength = parsedData.elements[i].value; break; }
    }

    if (newLength <= 0) {
        showToast('Довжина лінії не може бути нульовою або від\'ємною', 'warning');
        return;
    }

    G.figureLines[idx].direction = parsedData.direction;
    G.figureLines[idx].lineType  = parsedData.lineType;
    G.figureLines[idx].elements  = parsedData.elements;
    G.figureLines[idx].code      = document.getElementById('coordInput').value;
    G.figureLines[idx].length    = newLength;

    const closingIdx = G.figureLines.findIndex(l => l.isClosing);
    if (closingIdx !== -1 && idx < closingIdx) recalculateClosingLine();

    redrawEntireFigure();
};

window.recalculateClosingLine = function () {
    const closingIdx = G.figureLines.findIndex(l => l.isClosing);
    if (closingIdx === -1) return;

    const closingLine = G.figureLines.splice(closingIdx, 1)[0];

    const svg = document.getElementById('shapeCanvas');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    G.shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
    renderStartPoint(svg);

    let currentPointNum = 1;
    G.figureLines.forEach(lineData => {
        const last = G.shapePoints[G.shapePoints.length - 1];
        let endX = last.x, endY = last.y;
        const scaledLen = lineData.length * SCALE;
        switch (lineData.direction) {
            case 'top':    endY = last.y - scaledLen; break;
            case 'bottom': endY = last.y + scaledLen; break;
            case 'left':   endX = last.x - scaledLen; break;
            case 'right':  endX = last.x + scaledLen; break;
        }
        currentPointNum++;
        G.shapePoints.push({ x: endX, y: endY, num: currentPointNum });
    });

    const last  = G.shapePoints[G.shapePoints.length - 1];
    const first = G.shapePoints[0];
    const newLen = (Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2) / SCALE).toFixed(2);

    closingLine.length = parseFloat(newLen);
    for (let i = closingLine.elements.length - 1; i >= 0; i--) {
        if (closingLine.elements[i].type === 'number') {
            closingLine.elements[i].value = parseFloat(newLen); break;
        }
    }
    const codeLines = closingLine.code.split('\n');
    for (let i = codeLines.length - 1; i >= 0; i--) {
        if (!isNaN(parseFloat(codeLines[i]))) { codeLines[i] = newLen; break; }
    }
    closingLine.code = codeLines.join('\n');
    G.figureLines.push(closingLine);
};

/* ── Перемалювання всієї фігури ── */
window.redrawEntireFigure = function () {
    const svg = document.getElementById('shapeCanvas');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    G.shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
    renderStartPoint(svg);

    let currentPointNum = 1;
    const calculatedPoints = {};

    G.figureLines.forEach((lineData, index) => {
        const lastPoint = G.shapePoints[G.shapePoints.length - 1];
        let endX, endY;

        if (lineData.isClosing) {
            endX = G.shapePoints[0].x; endY = G.shapePoints[0].y;
        } else if (lineData.direction === 'free') {
            if (lineData.isPending) {
                currentPointNum++;
                G.shapePoints.push({ x: lastPoint.x, y: lastPoint.y, num: currentPointNum, isTemp: true });
                G.figureLines[index].from = lastPoint.num;
                G.figureLines[index].to   = currentPointNum;
                return;
            }

            if (calculatedPoints[lineData.id]) {
                endX = calculatedPoints[lineData.id].x;
                endY = calculatedPoints[lineData.id].y;
            } else {
                let nextClosingIdx = -1;
                for (let i = index + 1; i < G.figureLines.length; i++) {
                    if (!G.figureLines[i].isPending || G.figureLines[i].isClosing) {
                        nextClosingIdx = i; break;
                    }
                }
                if (nextClosingIdx !== -1 && G.figureLines[nextClosingIdx].isClosing) {
                    const coords = _calcFreeLineEnd(lastPoint, G.shapePoints[0], lineData, G.figureLines[nextClosingIdx]);
                    endX = coords.x; endY = coords.y;
                    calculatedPoints[lineData.id] = { x: endX, y: endY };
                } else { return; }
            }
        } else {
            endX = lastPoint.x; endY = lastPoint.y;
            const scaledLen = lineData.length * SCALE;
            switch (lineData.direction) {
                case 'top':    endY = lastPoint.y - scaledLen; break;
                case 'bottom': endY = lastPoint.y + scaledLen; break;
                case 'left':   endX = lastPoint.x - scaledLen; break;
                case 'right':  endX = lastPoint.x + scaledLen; break;
            }
        }

        _renderSvgLine(svg, lastPoint.x, lastPoint.y, endX, endY, lineData.id);
        drawLineDimension(lastPoint.x, lastPoint.y, endX, endY, lineData.length, lineData);
        drawElementsOnLine(lineData, lastPoint.x, lastPoint.y, endX, endY, SCALE);

        if (!lineData.isClosing) {
            currentPointNum++;
            G.shapePoints.push({ x: endX, y: endY, num: currentPointNum });
            G.figureLines[index].from = lastPoint.num;
            G.figureLines[index].to   = currentPointNum;
            _renderSvgPoint(svg, endX, endY, currentPointNum);
        } else {
            G.figureLines[index].from = lastPoint.num;
            G.figureLines[index].to   = 1;
        }
    });

    G.pointCounter = currentPointNum;

    if (G.figureLines.some(l => l.isClosing)) calculateAndDisplayArea();
    updateLinesList();
    autoScaleAndCenterFigure();
    drawRoomNumber();
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
window._applyDiagonalConstraint = function (pt1Num, pt2Num, diagDist) {
    // Знаходимо лінії між pt1 і pt2
    // Шукаємо шлях pt1 -> ... -> pt2 у G.figureLines
    // Підтримуємо найпростіший випадок: pt1 -> mid -> pt2 (одна проміжна точка)

    const p1 = G.shapePoints.find(function(p) { return p.num === pt1Num; });
    const p2 = G.shapePoints.find(function(p) { return p.num === pt2Num; });
    if (!p1 || !p2) { showToast('Точки не знайдено', 'error'); return; }

    // Знаходимо лінію від pt1 до наступної точки
    const lineFromPt1 = G.figureLines.find(function(l) { return l.from === pt1Num && !l.isClosing; });
    if (!lineFromPt1) { showToast('Немає лінії від точки ' + pt1Num, 'error'); return; }

    const midNum = lineFromPt1.to;
    if (midNum === pt2Num) {
        showToast('Точки ' + pt1Num + ' і ' + pt2Num + ' є сусідніми — діагональ не потрібна', 'warning');
        return;
    }

    // Перевіряємо, що є лінія від mid до pt2
    const lineToCheck = G.figureLines.find(function(l) {
        return l.from === midNum && (l.to === pt2Num || (l.isClosing && pt2Num === 1));
    });
    if (!lineToCheck) {
        showToast('Діагональ підтримується тільки через одну проміжну точку', 'warning');
        return;
    }

    const a = lineFromPt1.length * SCALE;  // pt1 -> mid
    const b = lineToCheck.length  * SCALE; // mid -> pt2
    const c = diagDist            * SCALE; // pt1 -> pt2 (діагональ)

    // Перевірка нерівності трикутника
    if (a + b <= c || a + c <= b || b + c <= a) {
        showToast('Неможливо побудувати трикутник з такою діагоналлю (порушена нерівність)', 'error');
        return;
    }

    // Теорема косинусів: знаходимо кут при pt1
    // c² = a² + b² - 2ab·cos(C)  — але нам потрібен кут при pt1 між pt1->p2_direction і pt1->mid
    // Замість цього: розміщуємо mid через теорему косинусів
    // Знаємо: |pt1->mid| = a, |mid->pt2| = b, |pt1->pt2| = c
    // Кут при pt1: cos(α) = (a² + c² - b²) / (2ac)
    const cosAlpha = (a * a + c * c - b * b) / (2 * a * c);
    const alpha    = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

    // Вектор від pt1 до pt2 (задана діагональ — це напрямок pt2)
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    if (len2 === 0) { showToast('Точки збігаються', 'error'); return; }

    const baseAngle = Math.atan2(dy2, dx2);

    // Визначаємо, з якого боку розташована проміжна точка
    // Пробуємо обидва варіанти і вибираємо ближчий до поточного положення mid
    const midPt = G.shapePoints.find(function(p) { return p.num === midNum; });
    const tryAngle1 = baseAngle + alpha;
    const tryAngle2 = baseAngle - alpha;

    const mid1x = p1.x + Math.cos(tryAngle1) * a;
    const mid1y = p1.y + Math.sin(tryAngle1) * a;
    const mid2x = p1.x + Math.cos(tryAngle2) * a;
    const mid2y = p1.y + Math.sin(tryAngle2) * a;

    let newMidX, newMidY;
    if (midPt) {
        const d1 = Math.hypot(mid1x - midPt.x, mid1y - midPt.y);
        const d2 = Math.hypot(mid2x - midPt.x, mid2y - midPt.y);
        if (d1 <= d2) { newMidX = mid1x; newMidY = mid1y; }
        else          { newMidX = mid2x; newMidY = mid2y; }
    } else {
        newMidX = mid1x; newMidY = mid1y;
    }

    // Оновлюємо координату mid-точки в G.shapePoints
    const midIdx = G.shapePoints.findIndex(function(p) { return p.num === midNum; });
    if (midIdx !== -1) {
        G.shapePoints[midIdx].x = newMidX;
        G.shapePoints[midIdx].y = newMidY;
    }

    // Перемалювати
    redrawEntireFigureFromPoints();
    showToast('Діагональ застосовано: ' + pt1Num + '-' + pt2Num + ' = ' + diagDist + ' м', 'success');
};

/**
 * Перемалювання фігури БЕЗ перерахунку координат (використовує вже обчислені G.shapePoints).
 * Використовується після корекції точок (наприклад, діагоналлю).
 */
window.redrawEntireFigureFromPoints = function () {
    const svg = document.getElementById('shapeCanvas');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    renderStartPoint(svg);

    G.figureLines.forEach(function(lineData, index) {
        const fromPt = G.shapePoints.find(function(p) { return p.num === lineData.from; });
        const toPt   = lineData.isClosing
            ? G.shapePoints[0]
            : G.shapePoints.find(function(p) { return p.num === lineData.to; });
        if (!fromPt || !toPt) return;

        _renderSvgLine(svg, fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.id);
        drawLineDimension(fromPt.x, fromPt.y, toPt.x, toPt.y, lineData.length, lineData);
        drawElementsOnLine(lineData, fromPt.x, fromPt.y, toPt.x, toPt.y, SCALE);

        if (!lineData.isClosing) {
            _renderSvgPoint(svg, toPt.x, toPt.y, toPt.num);
        }
    });

    if (G.figureLines.some(function(l) { return l.isClosing; })) {
        // Перерахувати площу з оновленими точками
        let area = 0;
        for (let i = 0; i < G.shapePoints.length; i++) {
            const j = (i + 1) % G.shapePoints.length;
            area += G.shapePoints[i].x * G.shapePoints[j].y;
            area -= G.shapePoints[j].x * G.shapePoints[i].y;
        }
        area = Math.abs(area) / 2;
        appState.calculatedArea = (area / (SCALE * SCALE)).toFixed(1);
    }

    updateLinesList();
    autoScaleAndCenterFigure();
    drawRoomNumber();
};

/* ── Допоміжна: намалювати лінію + розмір + точку на shapeCanvas ── */
window._drawShapeLine = function (x1, y1, x2, y2, length, isClosing, lineData) {
    const svg = document.getElementById('shapeCanvas');
    _renderSvgLine(svg, x1, y1, x2, y2);
    const numLen = typeof length === 'number' ? length : parseFloat(length);
    drawLineDimension(x1, y1, x2, y2, numLen, lineData);
    if (!isClosing) _renderSvgPoint(svg, x2, y2, G.pointCounter + 1);
};
