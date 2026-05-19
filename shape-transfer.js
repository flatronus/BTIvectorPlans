/**
 * shape-transfer.js — Перенос фігури на головне полотно.
 * Залежності: constants.js, state.js, g.js, svg-primitives.js, elements-on-line.js, hierarchy.js
 */

/** Заповнює SVG-групу лініями, розмірами та елементами поточної фігури */
window._fillSvgGroup = function (group, offsetX, offsetY) {
    G.figureLines.forEach(lineData => {
        const fromPoint = G.shapePoints.find(p => p.num === lineData.from);
        const toPoint   = lineData.isClosing ? G.shapePoints[0] : G.shapePoints.find(p => p.num === lineData.to);
        if (!fromPoint || !toPoint) return;

        const x1 = fromPoint.x + offsetX, y1 = fromPoint.y + offsetY;
        const x2 = toPoint.x   + offsetX, y2 = toPoint.y   + offsetY;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', 'black');
        line.setAttribute('stroke-width', '1');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        group.appendChild(line);

        drawMainCanvasDimension(group, x1, y1, x2, y2, lineData.length, lineData);

        if (lineData.elements && lineData.elements.length > 0) {
            drawElementsOnLine(lineData, x1, y1, x2, y2, SCALE, group);
        }
    });

    if (G.roomNumber && G.shapePoints.length >= 3) {
        const validPoints = G.shapePoints.filter(p => !p.isTemp);
        let cx = 0, cy = 0;
        validPoints.forEach(p => { cx += p.x + offsetX; cy += p.y + offsetY; });
        cx /= validPoints.length; cy /= validPoints.length;
        group.appendChild(buildRoomNumberText(cx, cy, G.roomNumber));
    }
};

/** Очищає групу і перебудовує її вміст (для режиму редагування) */
window._rebuildSvgGroup = function (group, offsetX, offsetY) {
    while (group.firstChild) group.removeChild(group.firstChild);
    _fillSvgGroup(group, offsetX, offsetY);
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
            _rebuildSvgGroup(existingItem.svgGroup, offsetX, offsetY);

            existingItem.figureLines = JSON.parse(JSON.stringify(G.figureLines));
            existingItem.shapePoints = JSON.parse(JSON.stringify(G.shapePoints));
            existingItem.roomNumber  = G.roomNumber;
            existingItem.type        = G.isBuilding ? 'building' : 'room';
            existingItem.area        = appState.customArea || appState.calculatedArea;

            appState.editingHierarchyItemId = null;
            renderHierarchy();
            showToast('Фігуру оновлено', 'success');
            return;
        }
    }

    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-hierarchy-id', G.hierarchyIdCounter);
    _fillSvgGroup(group, offsetX, offsetY);
    mainSvg.appendChild(group);

    addToHierarchy({
        isBuilding:  G.isBuilding,
        name:        G.isBuilding ? 'Будівля' : 'Кімната',
        roomNumber:  G.roomNumber,
        area:        appState.customArea || appState.calculatedArea,
        figureLines: G.figureLines,
        shapePoints: G.shapePoints,
        svgGroup:    group,
        parentId:    G.selectedHierarchyItem
    });

    showToast('Фігуру перенесено на головне полотно', 'success');
};
