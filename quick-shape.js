/**
 * quick-shape.js — Швидке створення фігур (прямокутник, трикутник).
 * Залежності: constants.js, g.js, svg-primitives.js, shape-editor.js, lines-panel.js, toast.js
 */

window.openQuickShapeModal = function () {
    document.getElementById('quickShapeModal').style.display = 'block';

    document.querySelectorAll('input[name="shapeType"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const label = document.getElementById('quickDimensionsLabel');
            if (this.value === 'rectangle') {
                label.textContent = 'Розміри (ширина висота через пробіл):';
                document.getElementById('quickDimensionsInput').placeholder = '3.5 4.2';
            } else {
                label.textContent = 'Розміри (сторона1 сторона2 сторона3 через пробіл):';
                document.getElementById('quickDimensionsInput').placeholder = '3.5 4.2 5.0';
            }
        });
    });

    setTimeout(() => document.getElementById('quickDimensionsInput').focus(), 100);
};

window.closeQuickShapeModal = function () {
    document.getElementById('quickShapeModal').style.display = 'none';
    document.getElementById('quickDimensionsInput').value = '';
};

window.createQuickShape = function () {
    const shapeType = document.querySelector('input[name="shapeType"]:checked').value;
    const rawInput  = document.getElementById('quickDimensionsInput').value.trim();

    if (!rawInput) { showToast('Введіть розміри фігури', 'warning'); return; }

    const dims = rawInput.split(/\s+/).map(d => {
        const n = parseFloat(d.replace(',', '.'));
        return isNaN(n) ? null : n;
    }).filter(d => d !== null);

    if (shapeType === 'rectangle') {
        if (dims.length < 2) { showToast('Для прямокутника потрібно 2 розміри', 'warning'); return; }
        createRectangle(dims[0], dims[1]);
    } else if (shapeType === 'triangle') {
        if (dims.length < 3) { showToast('Для трикутника потрібно 3 розміри', 'warning'); return; }
        createTriangle(dims[0], dims[1], dims[2]);
    }

    closeQuickShapeModal();
};

function _resetShapeState() {
    G.figureLines     = [];
    G.pendingFreeLines = [];
    G.lineIdCounter   = 1;
    G.pointCounter    = 1;
    appState.calculatedArea = null;
    appState.customArea     = null;

    const svg = document.getElementById('shapeCanvas');
    resetSvgCanvas(svg);
}

window.createRectangle = function (width, height) {
    _resetShapeState();

    const points = [
        { x: START_X,                 y: START_Y,                 dir: 'right',  len: width,  closing: false },
        { x: START_X + width * SCALE,  y: START_Y,                 dir: 'bottom', len: height, closing: false },
        { x: START_X + width * SCALE,  y: START_Y + height * SCALE, dir: 'left',   len: width,  closing: false },
        { x: START_X,                 y: START_Y + height * SCALE, dir: 'top',    len: height, closing: true  }
    ];

    const lineDataMeta = { dimensionVisible: true, dimensionRotated: false };

    points.forEach((pt, idx) => {
        const from = G.shapePoints[G.shapePoints.length - 1];
        const toX  = idx < 3 ? points[idx + 1]?.x ?? START_X : START_X;
        const toY  = idx < 3 ? points[idx + 1]?.y ?? START_Y : START_Y;

        _drawShapeLine(from.x, from.y, toX, toY, pt.len, pt.closing, lineDataMeta);

        if (!pt.closing) {
            G.pointCounter++;
            G.shapePoints.push({ x: toX, y: toY, num: G.pointCounter });
        }

        const _toX = pt.closing ? START_X : (idx < 3 ? points[idx + 1]?.x ?? START_X : START_X);
        const _toY = pt.closing ? START_Y : (idx < 3 ? points[idx + 1]?.y ?? START_Y : START_Y);
        G.figureLines.push({
            id: G.lineIdCounter++, from: from.num, to: pt.closing ? 1 : G.pointCounter,
            direction: 'free', lineType: 'line',
            elements: [{ type: 'number', value: parseFloat(pt.len) }],
            code: 'free\nline\n' + parseFloat(pt.len).toFixed(2),
            length: parseFloat(pt.len), isClosing: pt.closing, isPending: false,
            dimensionVisible: true, dimensionRotated: false,
            _cachedEnd: pt.closing ? null : { x: _toX, y: _toY }
        });
    });

    calculateAndDisplayArea();
    updateLinesList();
    autoScaleAndCenterFigure();
};

window.createTriangle = function (side1, side2, side3) {
    if (side1 + side2 <= side3 || side1 + side3 <= side2 || side2 + side3 <= side1) {
        showToast('Неможливо створити трикутник (порушена нерівність трикутника)', 'error'); return;
    }

    _resetShapeState();

    const from1 = G.shapePoints[0];
    const endX2 = START_X + side1 * SCALE;
    const endY2 = START_Y;
    const lineDataMeta = { dimensionVisible: true, dimensionRotated: false };

    _drawShapeLine(from1.x, from1.y, endX2, endY2, side1, false, lineDataMeta);
    G.pointCounter++;
    G.shapePoints.push({ x: endX2, y: endY2, num: G.pointCounter });
    G.figureLines.push({
        id: G.lineIdCounter++, from: 1, to: 2, direction: 'free', lineType: 'line',
        elements: [{ type: 'number', value: parseFloat(side1) }],
        code: 'free\nline\n' + parseFloat(side1).toFixed(2),
        length: parseFloat(side1), isClosing: false, isPending: false,
        dimensionVisible: true, dimensionRotated: false,
        _cachedEnd: { x: endX2, y: endY2 }
    });

    const cosAngle = (side1 ** 2 + side2 ** 2 - side3 ** 2) / (2 * side1 * side2);
    const angle    = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
    const endX3    = endX2 + Math.cos(angle) * side2 * SCALE;
    const endY3    = endY2 + Math.sin(angle) * side2 * SCALE;

    const from2 = G.shapePoints[1];
    _drawShapeLine(from2.x, from2.y, endX3, endY3, side2, false, lineDataMeta);
    G.pointCounter++;
    G.shapePoints.push({ x: endX3, y: endY3, num: G.pointCounter });
    G.figureLines.push({
        id: G.lineIdCounter++, from: 2, to: 3, direction: 'free', lineType: 'line',
        elements: [{ type: 'number', value: parseFloat(side2) }],
        code: 'free\nline\n' + parseFloat(side2).toFixed(2),
        length: parseFloat(side2), isClosing: false, isPending: false, quadrant: 'bottom',
        dimensionVisible: true, dimensionRotated: false,
        _cachedEnd: { x: endX3, y: endY3 }
    });

    const from3 = G.shapePoints[2];
    _drawShapeLine(from3.x, from3.y, START_X, START_Y, side3, true, lineDataMeta);
    G.figureLines.push({
        id: G.lineIdCounter++, from: 3, to: 1, direction: 'free', lineType: 'line',
        elements: [{ type: 'number', value: parseFloat(side3) }],
        code: 'free\nline\n' + parseFloat(side3).toFixed(2),
        length: parseFloat(side3), isClosing: true, isPending: false,
        dimensionVisible: true, dimensionRotated: false,
        _cachedEnd: null
    });

    calculateAndDisplayArea();
    updateLinesList();
    autoScaleAndCenterFigure();
};
