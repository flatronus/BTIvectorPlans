/**
 * shape-transfer.js — Перенос фігури на головне полотно.
 * Залежності: constants.js, state.js, g.js, svg-primitives.js, elements-on-line.js, hierarchy.js
 */

/** Заповнює SVG-групу лініями, розмірами та елементами поточної фігури */
window._fillSvgGroup = function (group, offsetX, offsetY, parentHierarchyItem) {
    // Прозорий полігон для зручного кліку по всій площі фігури
    const nonDiagLines = G.figureLines.filter(l => !l.isDiagonal);
    if (nonDiagLines.length >= 2) {
        const hitPoints = G.shapePoints.map(p => (p.x + offsetX) + ',' + (p.y + offsetY)).join(' ');
        const hitPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        hitPoly.setAttribute('points', hitPoints);
        hitPoly.setAttribute('fill', 'transparent');
        hitPoly.setAttribute('stroke', 'none');
        hitPoly.setAttribute('data-hit-area', '1');
        group.appendChild(hitPoly);
    }

    G.figureLines.forEach(lineData => {
        const fromPoint = G.shapePoints.find(p => p.num === lineData.from);
        const toPoint   = lineData.isClosing ? G.shapePoints[0] : G.shapePoints.find(p => p.num === lineData.to);
        if (!fromPoint || !toPoint) return;

        const x1 = fromPoint.x + offsetX, y1 = fromPoint.y + offsetY;
        const x2 = toPoint.x   + offsetX, y2 = toPoint.y   + offsetY;

        // Діагоналі на головному полотні невидимі
        if (lineData.isDiagonal) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', 'black');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        group.appendChild(line);

        drawMainCanvasDimension(group, x1, y1, x2, y2, lineData.length, lineData);

        if (lineData.elements && lineData.elements.length > 0) {
            const elThickness = typeof lineData._elementThickness === 'number'
                ? lineData._elementThickness
                : undefined;
            _drawElementsIntoGroups(lineData, x1, y1, x2, y2, SCALE, group, elThickness, parentHierarchyItem);
        }
    });

    if (G.roomNumber && G.shapePoints.length >= 2) {
        const validPoints = G.shapePoints.filter(p => !p.isTemp);
        let cx = 0, cy = 0;
        validPoints.forEach(p => { cx += p.x + offsetX; cy += p.y + offsetY; });
        cx /= validPoints.length; cy /= validPoints.length;

        // Визначаємо налаштування підпису з parentHierarchyItem
        const phi = parentHierarchyItem;
        const showLabel  = !phi || phi.showRoomLabel !== false;
        const labelStyle = (phi && phi.roomLabelStyle === 'leader') ? 'leader' : 'inline';
        const displayArea = phi && phi.useCustomArea && phi.customArea
            ? phi.customArea
            : (phi ? phi.area : null);

        if (showLabel) {
            if (displayArea) {
                group.appendChild(buildRoomLabel(cx, cy, G.roomNumber, displayArea, labelStyle,
                    phi && phi.leaderDx != null ? phi.leaderDx : 40,
                    phi && phi.leaderDy != null ? phi.leaderDy : -30));
            } else {
                group.appendChild(buildRoomNumberText(cx, cy, G.roomNumber));
            }
        }
    }
};

/**
 * Малює елементи лінії (WI1 тощо) кожен у власну <g data-hierarchy-id>,
 * реєструє їх як дочірні елементи ієрархії батьківської фігури.
 */
window._drawElementsIntoGroups = function (lineData, x1, y1, x2, y2, scale, parentGroup, overrideThickness, parentHierarchyItem) {
    const lineThickness = (overrideThickness !== undefined ? overrideThickness : ELEMENT_THICKNESS);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const ux = dx / len, uy = dy / len;
    const px = uy, py = -ux;
    const elements = lineData.elements || [];

    for (let i = 0; i < elements.length; i++) {
        if (elements[i]?.type     === 'number' &&
            elements[i+1]?.type   === 'number' &&
            elements[i+2]?.type   === 'element') {

            const start = elements[i].value   * scale;
            const end   = elements[i+1].value * scale;
            let code    = elements[i+2].value;
            let side    = 1;
            if (code.startsWith('-')) { side = -1; code = code.substring(1); }

            const sx   = x1 + ux * start;
            const sy   = y1 + uy * start;
            const elen = end - start;

            // Шукаємо існуючий дочірній елемент ієрархії для цього WI1
            const elKey = `wi_${lineData.from}_${lineData.to ?? 'c'}_${code}_${elements[i].value}`;
            let elItem = null;
            if (parentHierarchyItem) {
                elItem = (parentHierarchyItem.children || []).find(c => c._elKey === elKey && c.type === 'element');
            }

            // SVG-група для елемента
            const elGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

            if (elItem) {
                // Оновлюємо існуючий: перереєструємо групу
                elGroup.setAttribute('data-hierarchy-id', elItem.id);
                elItem.svgGroup = elGroup;
            } else {
                // Новий елемент ієрархії
                const newId = G.hierarchyIdCounter++;
                elGroup.setAttribute('data-hierarchy-id', newId);
                if (parentHierarchyItem) {
                    const newEl = {
                        id:       newId,
                        type:     'element',
                        name:     (code === 'WI1' ? 'Вікно' : code) + ' ' + lineData.from + '-' + (lineData.to ?? 'c'),
                        _elKey:   elKey,
                        elCode:   code,
                        elStart:  elements[i].value,
                        elEnd:    elements[i+1].value,
                        elSide:   side,
                        lineFrom: lineData.from,
                        lineTo:   lineData.to,
                        svgGroup: elGroup,
                        children: [],
                        expanded: false,
                        parentId: parentHierarchyItem.id
                    };
                    parentHierarchyItem.children.push(newEl);
                    elItem = newEl;
                }
            }

            parentGroup.appendChild(elGroup);

            if (code === 'WI1') {
                // Товщина: індивідуальна для елемента > загальна для лінії > константа
                const elThickness = (elItem && elItem.elThickness != null)
                    ? elItem.elThickness
                    : lineThickness;
                _drawWI1inGroup(elGroup, sx, sy, ux, uy, px, py, elen, elThickness * scale, side);
            }

            i += 2;
        }
    }
};

/** Малює WI1 у вказану групу (виділено з elements-on-line.js для використання тут) */
function _drawWI1inGroup(target, sx, sy, ux, uy, px, py, elen, thickness, side) {
    const c1x = sx,             c1y = sy;
    const c2x = sx + ux * elen, c2y = sy + uy * elen;
    const c3x = c2x + px * thickness * side, c3y = c2y + py * thickness * side;
    const c4x = sx  + px * thickness * side, c4y = sy  + py * thickness * side;

    // Прозорий полігон — вся площа WI1 клікабельна
    const hitPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hitPoly.setAttribute('points', c1x+','+c1y+' '+c2x+','+c2y+' '+c3x+','+c3y+' '+c4x+','+c4y);
    hitPoly.setAttribute('fill', 'transparent');
    hitPoly.setAttribute('stroke', 'none');
    hitPoly.setAttribute('data-hit-area', '1');
    target.appendChild(hitPoly);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    rect.setAttribute('points', `${c1x},${c1y} ${c2x},${c2y} ${c3x},${c3y} ${c4x},${c4y}`);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(rect);

    const midStartX = sx  + px * (thickness / 2) * side;
    const midStartY = sy  + py * (thickness / 2) * side;
    const midEndX   = c2x + px * (thickness / 2) * side;
    const midEndY   = c2y + py * (thickness / 2) * side;

    const midLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    midLine.setAttribute('x1', midStartX); midLine.setAttribute('y1', midStartY);
    midLine.setAttribute('x2', midEndX);   midLine.setAttribute('y2', midEndY);
    midLine.setAttribute('stroke', 'black');
    midLine.setAttribute('stroke-width', '1');
    midLine.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(midLine);
}

/** Очищає групу і перебудовує її вміст (для режиму редагування) */
window._rebuildSvgGroup = function (group, offsetX, offsetY, parentHierarchyItem) {
    while (group.firstChild) group.removeChild(group.firstChild);
    _fillSvgGroup(group, offsetX, offsetY, parentHierarchyItem);
};

/** Розміри на головному полотні */
window.drawMainCanvasDimension = function (group, x1, y1, x2, y2, lengthInMeters, lineData) {
    if (lineData && lineData.dimensionVisible === false) return;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const ux = dx / len, uy = dy / len;
    const px = uy, py = -ux;
    const offset = 7.5;
    const dir    = G.dimensionsOutside ? 1 : -1;
    const cx     = (x1 + x2) / 2;
    const cy     = (y1 + y2) / 2;
    const textX  = cx + px * offset * dir;
    const textY  = cy + py * offset * dir;

    let angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (angle > 90)  angle -= 180;
    if (angle < -90) angle += 180;
    if (lineData && lineData.dimensionRotated) angle += 180;

    const numLen = typeof lengthInMeters === 'number' ? lengthInMeters : parseFloat(lengthInMeters);
    group.appendChild(_makeSvgText(textX, textY, numLen.toFixed(2), angle));
};

/** Перенос / оновлення фігури на головному полотні */
window.transferFigureToMainCanvas = function () {
    const canvas = window.canvasManager?.canvases.find(
        c => c.id === window.canvasManager?.activeCanvasId
    );
    if (!canvas) { showToast('Немає активного полотна', 'error'); return; }
    const mainSvg = document.querySelector(`[data-canvas-id="${canvas.id}"] svg`);
    if (!mainSvg) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    G.shapePoints.forEach(p => {
        if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
    });

    const frameCenterX  = A4_OFFSET + A4_WIDTH  / 2;
    const frameCenterY  = A4_OFFSET + A4_HEIGHT / 2;
    const figureCenterX = minX + (maxX - minX) / 2;
    const figureCenterY = minY + (maxY - minY) / 2;
    const offsetX = frameCenterX - figureCenterX;
    const offsetY = frameCenterY - figureCenterY;

    const editId = appState.editingHierarchyItemId;
    if (editId !== null) {
        const existingItem = findHierarchyItemById(editId);
        if (existingItem && existingItem.svgGroup) {

            // Визначаємо offset: якір → прив'язана фігура; збережений → звичайна фігура
            let useOffsetX, useOffsetY;
            if (existingItem._anchorOnCanvas) {
                useOffsetX = existingItem._anchorOnCanvas.x - START_X;
                useOffsetY = existingItem._anchorOnCanvas.y - START_Y;
            } else if (existingItem._offsetX !== undefined) {
                useOffsetX = existingItem._offsetX;
                useOffsetY = existingItem._offsetY;
            } else {
                useOffsetX = offsetX;
                useOffsetY = offsetY;
            }

            _rebuildSvgGroup(existingItem.svgGroup, useOffsetX, useOffsetY, existingItem);

            existingItem.figureLines = JSON.parse(JSON.stringify(G.figureLines));
            existingItem.shapePoints = JSON.parse(JSON.stringify(G.shapePoints));
            existingItem.roomNumber  = G.roomNumber;
            existingItem.type        = G.isBuilding ? 'building' : 'room';
            existingItem.area        = appState.customArea || appState.calculatedArea;
            // Оновлюємо збережений offset (міг бути null для старих елементів)
            if (!existingItem._anchorOnCanvas) {
                existingItem._offsetX = useOffsetX;
                existingItem._offsetY = useOffsetY;
            }

            _refreshChildAnchors(existingItem, useOffsetX, useOffsetY);

            appState.editingHierarchyItemId = null;
            renderHierarchy();
            showToast('Фігуру оновлено', 'success');
            return;
        }
    }

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-hierarchy-id', G.hierarchyIdCounter);
    mainSvg.appendChild(group);

    const newItem = addToHierarchy({
        isBuilding:  G.isBuilding,
        name:        G.isBuilding ? 'Будівля' : 'Кімната',
        roomNumber:  G.roomNumber,
        area:        appState.customArea || appState.calculatedArea,
        figureLines: G.figureLines,
        shapePoints: G.shapePoints,
        svgGroup:    group,
        parentId:    G.selectedHierarchyItem
    });
    _fillSvgGroup(group, offsetX, offsetY, newItem);
    // Зберігаємо offset щоб при повторному редагуванні фігура не зміщувалась
    newItem._offsetX = offsetX;
    newItem._offsetY = offsetY;

    showToast('Фігуру перенесено на головне полотно', 'success');
};

/**
 * Перераховує абсолютну координату точки прив'язки на SVG
 * з параметричного опису (_anchorDef) і поточного offsetX/Y батьківської фігури.
 *
 * anchorDef: { hostLineId, elStart, elEnd, elSide, thickness, corner, dist }
 * parentItem: елемент ієрархії батьківської фігури (має figureLines, shapePoints)
 * offsetX/Y:  зміщення батьківської фігури на полотні
 *
 * Повертає { x, y } або null якщо неможливо обчислити.
 */
window._computeAnchorOnCanvas = function (anchorDef, parentItem, offsetX, offsetY) {
    const { hostLineId, elStart, elEnd, elSide, thickness, corner, dist } = anchorDef;

    // Перебудовуємо координати батьківської фігури
    const savedLines  = G.figureLines;
    const savedPoints = G.shapePoints;
    G.figureLines = JSON.parse(JSON.stringify(parentItem.figureLines));
    G.shapePoints = JSON.parse(JSON.stringify(parentItem.shapePoints));
    _rebuildChainPoints();
    const rebuildPoints = G.shapePoints;
    const rebuildLines  = G.figureLines;
    G.figureLines = savedLines;
    G.shapePoints = savedPoints;

    const hostLine = rebuildLines.find(l => l.id === hostLineId);
    if (!hostLine) return null;

    const fromPt = rebuildPoints.find(p => p.num === hostLine.from);
    const toPt   = hostLine.isClosing ? rebuildPoints[0] : rebuildPoints.find(p => p.num === hostLine.to);
    if (!fromPt || !toPt) return null;

    const x1 = fromPt.x + offsetX, y1 = fromPt.y + offsetY;
    const x2 = toPt.x   + offsetX, y2 = toPt.y   + offsetY;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return null;

    const ux = dx / len, uy = dy / len;
    const px = uy, py = -ux;
    const side = elSide || 1;

    const wA_x = x1 + ux * elStart * SCALE + px * thickness * SCALE * side;
    const wA_y = y1 + uy * elStart * SCALE + py * thickness * SCALE * side;
    const wB_x = x1 + ux * elEnd   * SCALE + px * thickness * SCALE * side;
    const wB_y = y1 + uy * elEnd   * SCALE + py * thickness * SCALE * side;

    const anchorX = corner === 1 ? wA_x : wB_x;
    const anchorY = corner === 1 ? wA_y : wB_y;

    const wdx = wB_x - wA_x, wdy = wB_y - wA_y;
    const wlen = Math.sqrt(wdx * wdx + wdy * wdy);
    if (wlen === 0) return { x: anchorX, y: anchorY };

    const sign = corner === 1 ? -1 : 1;
    return {
        x: anchorX + sign * wdx / wlen * dist * SCALE,
        y: anchorY + sign * wdy / wlen * dist * SCALE
    };
};

/**
 * Рекурсивно перераховує _anchorOnCanvas для всіх дочірніх кімнат
 * після того як батьківська фігура була переміщена/перемальована.
 */
window._refreshChildAnchors = function (parentItem, parentOffsetX, parentOffsetY) {
    // Отримуємо головний SVG полотна для re-append відірваних груп
    const canvas  = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
    const mainSvg = canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;

    (parentItem.children || []).forEach(child => {
        if (!child._anchorDef) {
            // Немає anchorDef — але є свої діти, рекурсуємо з поточним offsetX/Y дитини
            if (child.children && child.children.length > 0 && child.svgGroup) {
                const co = child._anchorOnCanvas
                    ? { x: child._anchorOnCanvas.x - START_X, y: child._anchorOnCanvas.y - START_Y }
                    : { x: child._offsetX || 0, y: child._offsetY || 0 };
                _refreshChildAnchors(child, co.x, co.y);
            }
            return;
        }

        // Синхронізуємо товщину: якщо батько змінив товщину вікна (_elementThickness),
        // оновлюємо її в anchorDef щоб якір рахувався від нової позиції вікна
        const anchorDef = child._anchorDef;
        const hostLineData = (parentItem.figureLines || []).find(l => l.id === anchorDef.hostLineId);
        if (hostLineData && typeof hostLineData._elementThickness === 'number') {
            anchorDef.thickness = hostLineData._elementThickness;
        }

        const newAnchor = _computeAnchorOnCanvas(
            anchorDef, parentItem, parentOffsetX, parentOffsetY
        );
        if (!newAnchor) return;
        child._anchorOnCanvas = newAnchor;

        if (child.svgGroup) {
            const childOffsetX = newAnchor.x - START_X;
            const childOffsetY = newAnchor.y - START_Y;

            // Якщо SVG-група відірвана від DOM — повертаємо її назад
            if (mainSvg && !mainSvg.contains(child.svgGroup)) {
                mainSvg.appendChild(child.svgGroup);
            }

            const savedLines  = G.figureLines;
            const savedPoints = G.shapePoints;
            G.figureLines = JSON.parse(JSON.stringify(child.figureLines));
            G.shapePoints = JSON.parse(JSON.stringify(child.shapePoints));
            _rebuildSvgGroup(child.svgGroup, childOffsetX, childOffsetY);
            G.figureLines = savedLines;
            G.shapePoints = savedPoints;

            // Рекурсивно оновлюємо глибші рівні
            _refreshChildAnchors(child, childOffsetX, childOffsetY);
        }
    });
};

/**
 * Знаходить батьківський елемент ієрархії для заданого id.
 */
window._findParentInHierarchy = function (childId, items, parent) {
    items = items || G.hierarchyData;
    for (const item of items) {
        if (item.id === childId) return parent || null;
        const found = _findParentInHierarchy(childId, item.children, item);
        if (found !== undefined) return found;
    }
    return undefined;
};

/**
 * Зберігає результат редагування елемента (вікна) на головному полотні:
 * 1. Перемальовує SVG-групу батьківської фігури з оновленою товщиною вікна.
 * 2. Малює лінію прив'язки (якщо задана) у тій самій групі.
 * 3. Якщо є лінія прив'язки — додає «Кімнату» дочірньою до елемента вікна в ієрархії.
 */
window.transferElementResultToMainCanvas = function (src) {
    const { item, hostLine, el } = src;

    // Зберігаємо товщину і прив'язку в lineData батьківської фігури (для _fillSvgGroup і повторного відкриття)
    const hostLineData = item.figureLines.find(l => l.id === hostLine.id);
    if (hostLineData) {
        hostLineData._elementThickness = appState.editingElementThickness;
        hostLineData._elementBinding   = appState.editingElementBinding || null;
    }

    // ── 1. Перемальовуємо групу батьківської фігури ──
    if (item.svgGroup) {
        // Використовуємо збережений offset щоб фігура не зміщувалась
        let offsetX, offsetY;
        if (item._anchorOnCanvas) {
            offsetX = item._anchorOnCanvas.x - START_X;
            offsetY = item._anchorOnCanvas.y - START_Y;
        } else if (item._offsetX !== undefined) {
            offsetX = item._offsetX;
            offsetY = item._offsetY;
        } else {
            // Fallback: обчислюємо від центру A4 (тільки для дуже старих елементів без збереженого offset)
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            item.shapePoints.forEach(p => {
                if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
            });
            const frameCenterX  = A4_OFFSET + A4_WIDTH  / 2;
            const frameCenterY  = A4_OFFSET + A4_HEIGHT / 2;
            const figureCenterX = minX + (maxX - minX) / 2;
            const figureCenterY = minY + (maxY - minY) / 2;
            offsetX = frameCenterX - figureCenterX;
            offsetY = frameCenterY - figureCenterY;
        }

        // Тимчасово підставляємо дані батьківської фігури
        const savedLines  = G.figureLines;
        const savedPoints = G.shapePoints;
        const savedRoom   = G.roomNumber;
        const savedBuild  = G.isBuilding;
        G.figureLines = JSON.parse(JSON.stringify(item.figureLines));
        G.shapePoints = JSON.parse(JSON.stringify(item.shapePoints));
        G.roomNumber  = item.roomNumber || '';
        G.isBuilding  = item.type === 'building';

        _rebuildSvgGroup(item.svgGroup, offsetX, offsetY);

        // Рекурсивно перераховуємо якорі дочірніх кімнат після перемальовування
        _refreshChildAnchors(item, offsetX, offsetY);

        // Якщо item сам є дочірньою — оновлюємо його братів і далі вгору по дереву.
        // Це потрібно щоб при зміні товщини вікна зміщувались і фігури що прив'язані
        // до вікон на глибших рівнях ієрархії.
        (function propagateUp(current) {
            const parentItem = _findParentInHierarchy(current.id);
            if (!parentItem) return; // корінь — нічого більше
            const pOffsetX = parentItem._anchorOnCanvas
                ? parentItem._anchorOnCanvas.x - START_X
                : (parentItem._offsetX || 0);
            const pOffsetY = parentItem._anchorOnCanvas
                ? parentItem._anchorOnCanvas.y - START_Y
                : (parentItem._offsetY || 0);
            _refreshChildAnchors(parentItem, pOffsetX, pOffsetY);
            propagateUp(parentItem);
        })(item);

        // ── 2. Лінія прив'язки на головному полотні ──
        const bp = appState.editingElementBinding;
        if (bp && (bp.corner === 1 || bp.corner === 2) && bp.dist > 0) {
            // Перебудовуємо координати хост-лінії
            _rebuildChainPoints();
            const rebuildPoints = G.shapePoints;
            const fromPt = rebuildPoints.find(p => p.num === hostLine.from);
            const toPt   = hostLine.isClosing ? rebuildPoints[0] : rebuildPoints.find(p => p.num === hostLine.to);

            if (fromPt && toPt) {
                const x1 = fromPt.x + offsetX, y1 = fromPt.y + offsetY;
                const x2 = toPt.x   + offsetX, y2 = toPt.y   + offsetY;

                const dx = x2 - x1, dy = y2 - y1;
                const len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0) {
                    const ux = dx / len, uy = dy / len;
                    const px = uy, py = -ux;
                    const side      = el.side || 1;
                    const thickness = appState.editingElementThickness;

                    const wA_x = x1 + ux * el.start * SCALE + px * thickness * SCALE * side;
                    const wA_y = y1 + uy * el.start * SCALE + py * thickness * SCALE * side;
                    const wB_x = x1 + ux * el.end   * SCALE + px * thickness * SCALE * side;
                    const wB_y = y1 + uy * el.end   * SCALE + py * thickness * SCALE * side;

                    const anchorX = bp.corner === 1 ? wA_x : wB_x;
                    const anchorY = bp.corner === 1 ? wA_y : wB_y;
                    const wdx = wB_x - wA_x, wdy = wB_y - wA_y;
                    const wlen = Math.sqrt(wdx * wdx + wdy * wdy);

                    if (wlen > 0) {
                        const sign = bp.corner === 1 ? -1 : 1;
                        const bx = anchorX + sign * wdx / wlen * bp.dist * SCALE;
                        const by = anchorY + sign * wdy / wlen * bp.dist * SCALE;

                        // ── 3. Лінія кімнати в координатах редактора ──
                        const childLen = bp.dist;
                        const vecX = anchorX - bx;
                        const vecY = anchorY - by;
                        const vecLen = Math.sqrt(vecX * vecX + vecY * vecY);
                        let childEndX = START_X, childEndY = START_Y;
                        if (vecLen > 0) {
                            childEndX = START_X + vecX / vecLen * childLen * SCALE;
                            childEndY = START_Y + vecY / vecLen * childLen * SCALE;
                        }

                        const childShapePoints = [
                            { x: START_X,   y: START_Y,   num: 1 },
                            { x: childEndX, y: childEndY, num: 2 }
                        ];
                        const childFigureLines = [{
                            id: 1, from: 1, to: 2,
                            direction: 'free', lineType: 'line',
                            elements: [{ type: 'number', value: childLen }],
                            code: `free\nline\n${childLen.toFixed(2)}`,
                            length: childLen,
                            isClosing: false, isPending: false,
                            dimensionVisible: true, dimensionRotated: false,
                            _cachedEnd: { x: childEndX, y: childEndY }
                        }];

                        const anchorDef = {
                            hostLineId: hostLine.id,
                            elStart:    el.start,
                            elEnd:      el.end,
                            elSide:     el.side || 1,
                            thickness:  appState.editingElementThickness,
                            corner:     bp.corner,
                            dist:       bp.dist
                        };

                        // ── 4. SVG-група дочірньої кімнати ──
                        const canvasEl = window.canvasManager?.canvases.find(
                            c => c.id === window.canvasManager?.activeCanvasId
                        );
                        const mainSvg = canvasEl
                            ? document.querySelector(`[data-canvas-id="${canvasEl.id}"] svg`)
                            : null;

                        const elKey = `el_${hostLine.from}_${hostLine.to ?? 'c'}_${el.code}_${el.start}`;
                        if (!item._elChildren) item._elChildren = {};
                        const existingChildId = item._elChildren[elKey];

                        // childOffsetX/Y: точка 1 редактора → точка bx,by на полотні
                        const childOffsetX = bx - START_X;
                        const childOffsetY = by - START_Y;

                        if (existingChildId) {
                            const existingChild = findHierarchyItemById(existingChildId);
                            if (existingChild) {
                                existingChild.figureLines     = JSON.parse(JSON.stringify(childFigureLines));
                                existingChild.shapePoints     = JSON.parse(JSON.stringify(childShapePoints));
                                existingChild._anchorOnCanvas = { x: bx, y: by };
                                existingChild._anchorDef      = anchorDef;
                                // Перемальовуємо svgGroup дочірньої з новими координатами
                                if (existingChild.svgGroup) {
                                    const savedL = G.figureLines, savedP = G.shapePoints;
                                    G.figureLines = JSON.parse(JSON.stringify(childFigureLines));
                                    G.shapePoints = JSON.parse(JSON.stringify(childShapePoints));
                                    _rebuildSvgGroup(existingChild.svgGroup, childOffsetX, childOffsetY);
                                    // Рекурсивно оновлюємо вкладені якорі з новою товщиною
                                    _refreshChildAnchors(existingChild, childOffsetX, childOffsetY);
                                    G.figureLines = savedL;
                                    G.shapePoints = savedP;
                                }
                                renderHierarchy();
                                // Відновлюємо G до стану батьківської фігури перед виходом
                                G.figureLines = savedLines;
                                G.shapePoints = savedPoints;
                                G.roomNumber  = savedRoom;
                                G.isBuilding  = savedBuild;
                                showToast('Елемент оновлено', 'success');
                                return;
                            }
                        }

                        // Створюємо SVG-групу для дочірньої кімнати
                        let childGroup = null;
                        if (mainSvg) {
                            childGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                            childGroup.setAttribute('data-hierarchy-id', G.hierarchyIdCounter);
                            // Малюємо через _fillSvgGroup щоб лінія і розмір були консистентні
                            const savedL = G.figureLines, savedP = G.shapePoints;
                            G.figureLines = JSON.parse(JSON.stringify(childFigureLines));
                            G.shapePoints = JSON.parse(JSON.stringify(childShapePoints));
                            _fillSvgGroup(childGroup, childOffsetX, childOffsetY);
                            G.figureLines = savedL;
                            G.shapePoints = savedP;
                            mainSvg.appendChild(childGroup);
                        }

                        // Додаємо нову дочірню «Кімнату» в ієрархію
                        const childItem = addToHierarchy({
                            isBuilding:  false,
                            name:        'Кімната (прив\'язка)',
                            roomNumber:  '',
                            area:        '',
                            figureLines: childFigureLines,
                            shapePoints: childShapePoints,
                            svgGroup:    childGroup,
                            parentId:    item.id
                        });
                        childItem._anchorOnCanvas = { x: bx, y: by };
                        childItem._anchorDef      = anchorDef;
                        item._elChildren[elKey]   = childItem.id;
                    }
                }
            }
        }

        G.figureLines = savedLines;
        G.shapePoints = savedPoints;
        G.roomNumber  = savedRoom;
        G.isBuilding  = savedBuild;
    }

    showToast('Елемент збережено', 'success');
};
