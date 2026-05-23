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
    appState.viewingElementMode     = false;
    appState.viewingElementSource   = null;
    appState.viewingElementTransform = null;
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
            case 'right':  vx = -uy; vy =  ux; break; // праворуч від напрямку (+90° за год. в SVG)
            case 'left':   vx =  uy; vy = -ux; break; // ліворуч від напрямку (-90° проти год. в SVG)
            default:       vx =  ux; vy =  uy; break;
        }
    }

    return {
        x: fromX + vx * scaledLen,
        y: fromY + vy * scaledLen
    };
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
        const rel = _calcRelativeEnd(lastPoint.x, lastPoint.y, parsedData.direction, scaledLen);
        endX = rel.x; endY = rel.y;
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
                    case 'right':  vx = -prevUy; vy =  prevUx; break; // праворуч від напрямку
                    case 'left':   vx =  prevUy; vy = -prevUx; break; // ліворуч від напрямку
                    default:       vx =  prevUx; vy =  prevUy; break;
                }
            }
            endX = lastPt.x + vx * scaledLen;
            endY = lastPt.y + vy * scaledLen;
        }

        currentPointNum++;
        G.shapePoints.push({ x: endX, y: endY, num: currentPointNum });
        G.figureLines[index].from = lastPt.num;
        G.figureLines[index].to   = currentPointNum;

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

    // Знаходимо лінію що ЗАКІНЧУЄТЬСЯ в pt2Num (вона буде змінювати кут)
    const lineIdx = G.figureLines.findIndex(function(l) {
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

    // Оновлюємо лінію X→pt2: direction=free, _cachedEnd = нова позиція pt2
    G.figureLines[lineIdx].direction  = 'free';
    G.figureLines[lineIdx]._cachedEnd = { x: newPt2.x, y: newPt2.y };

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

/* ── Відкриття елемента (WI1 тощо) у редакторі фігур — режим редагування ── */
/**
 * Відкриває редактор фігур у режимі редагування елемента.
 * Показує лінію-хост із вікном. Кути вікна (на протилежному боці від лінії-хоста)
 * нумеруються A і B. Можна додавати лінії, дотичні до вікна.
 * Товщину вікна можна змінити через список ліній.
 */
window.openElementInShapeEditor = function (item, hostLine, el) {
    appState.editingHierarchyItemId = null;
    appState.viewingElementMode = true;            // прапорець «режим елемента» (не звичайний редактор)
    appState.viewingElementSource = { item, hostLine, el };
    appState.editingElementThickness = typeof el.thickness === 'number' ? el.thickness : ELEMENT_THICKNESS;

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

/**
 * Перемальовує canvas у режимі редагування елемента.
 * Точка 1 розміщується поруч із вікном (не в глобальних START_X/START_Y).
 * viewBox будується тільки навколо хост-лінії + кутів A/B + доданих точок.
 */
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

    // Мітки кутів A і B
    _renderWindowCornerLabel(svg, wA_x, wA_y, 'A');
    _renderWindowCornerLabel(svg, wB_x, wB_y, 'B');

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
            case 'right':  vx = -prevUy; vy =  prevUx; break;
            case 'left':   vx =  prevUy; vy = -prevUx; break;
            default:       vx =  prevUx; vy =  prevUy; break;
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

/**
 * Розбирає рядок прив'язки типу "A 2,12" або "B 0.50".
 * Повертає { corner: 'A'|'B', dist: number } або null.
 */
window._parseAnchorInput = function (raw) {
    if (!raw) return null;
    const parts = raw.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const corner = parts[0].toUpperCase();
    if (corner !== 'A' && corner !== 'B') return null;
    const dist = parseFloat(parts[1].replace(',', '.'));
    if (isNaN(dist) || dist <= 0) return null;
    return { corner, dist };
};

/**
 * Відкриває звичайний редактор фігури з першою лінією прив'язаною до вікна.
 *
 * Геометрія:
 *   wA, wB — кути вікна на протилежному боці від хост-лінії (у SVG-координатах).
 *   anchor.corner = 'A', anchor.dist = d:
 *     - вектор вздовж вікна: u = normalize(wB - wA)
 *     - вектор від B (від центру вікна): -u
 *     - точка 1 = wA + (-u) * d  = wA - u * d  (відходимо від wA у бік від wB)
 *     - точка 2 = pt1 + u * d               (вздовж вікна на відстань d)
 *   anchor.corner = 'B': симетрично — від wB у бік від wA.
 */
window._startFigureFromAnchor = function (anchor, wA, wB) {
    const svg = document.getElementById('shapeCanvas');
    if (!svg) return;

    // Вектор вздовж вікна A→B
    const dx  = wB.x - wA.x, dy = wB.y - wA.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) { showToast('Некоректні координати вікна', 'error'); return; }
    const ux = dx / len, uy = dy / len;

    const distPx = anchor.dist * SCALE;

    // Точка 1: від відповідного кута вікна, у напрямку від протилежного кута
    let pt1x, pt1y;
    if (anchor.corner === 'A') {
        // від wA у напрямку -u (від B)
        pt1x = wA.x - ux * distPx;
        pt1y = wA.y - uy * distPx;
    } else {
        // від wB у напрямку +u (від A)
        pt1x = wB.x + ux * distPx;
        pt1y = wB.y + uy * distPx;
    }

    // Точка 2: від точки 1 вздовж вікна (A→B) на відстань dist
    const pt2x = pt1x + ux * distPx;
    const pt2y = pt1y + uy * distPx;

    // Скидаємо канвас і ставимо точку 1 в pt1
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    G.shapePoints   = [{ x: pt1x, y: pt1y, num: 1 }];
    G.figureLines   = [];
    G.pendingFreeLines = [];
    G.lineIdCounter = 1;
    G.pointCounter  = 1;
    G.diagonals     = [];

    // Малюємо точку 1
    _renderSvgPoint(svg, pt1x, pt1y, 1);

    // Малюємо першу лінію (вздовж вікна, довжина = dist)
    const lineData = { dimensionVisible: true, dimensionRotated: false };
    _renderSvgLine(svg, pt1x, pt1y, pt2x, pt2y);
    drawLineDimension(pt1x, pt1y, pt2x, pt2y, anchor.dist, lineData);
    _renderSvgPoint(svg, pt2x, pt2y, 2);

    // Додаємо точку 2 і лінію в стан фігури
    G.pointCounter = 2;
    G.shapePoints.push({ x: pt2x, y: pt2y, num: 2 });
    G.figureLines.push({
        id:               G.lineIdCounter++,
        from:             1,
        to:               2,
        direction:        'free',
        lineType:         'line',
        elements:         [{ type: 'number', value: anchor.dist }],
        code:             'free\nline\n' + anchor.dist.toFixed(2),
        length:           anchor.dist,
        isClosing:        false,
        isPending:        false,
        isDiagonal:       false,
        dimensionVisible: true,
        dimensionRotated: false,
        _cachedEnd:       { x: pt2x, y: pt2y }
    });

    autoScaleAndCenterFigure();
    updateLinesList();
    showToast(`Фігуру прив'язано до вікна (${anchor.corner} ${anchor.dist} м)`, 'success');
};
