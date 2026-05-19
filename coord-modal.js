/**
 * coord-modal.js — Модалка координат: парсинг вводу, кнопки напрямку/типу/елементів.
 * Залежності: state.js, g.js, shape-editor.js, toast.js
 */

/* ── Додати точку ── */
window.addPoint = function () {
    document.getElementById('coordInput').value = '';
    document.getElementById('coordModal').style.display = 'block';
    appState.editingLineId = null;
    setTimeout(() => document.getElementById('coordInput').focus(), 100);
};

/* ── Замкнути фігуру ── */
window.closeShape = function () {
    if (G.shapePoints.length < 2) {
        showToast('Недостатньо точок для замикання фігури', 'warning'); return;
    }
    const lastPoint  = G.shapePoints[G.shapePoints.length - 1];
    const firstPoint = G.shapePoints[0];
    const dx = firstPoint.x - lastPoint.x, dy = firstPoint.y - lastPoint.y;
    const distMeters = (Math.sqrt(dx * dx + dy * dy) / SCALE).toFixed(2);

    document.getElementById('coordInput').value = `free\nline\n${distMeters}`;
    document.getElementById('coordModal').style.display = 'block';
    appState.isClosingLine = true;
    appState.editingLineId = null;

    setTimeout(() => {
        const inp = document.getElementById('coordInput');
        inp.focus(); inp.setSelectionRange(0, 0);
    }, 100);
};

/* ── Діагональ (заглушка) ── */
window.addDiagonal = function () {
    showToast('Функція «Діагональ» буде реалізована пізніше', 'info');
};

/* ── Закрити модалку координат та обробити введення ── */
window.closeCoordModal = function () {
    const inputText = document.getElementById('coordInput').value.trim();

    if (inputText) {
        const parsedData = parseCoordinateInput(inputText);
        if (parsedData) {
            if (appState.editingLineId) {
                updateExistingLine(appState.editingLineId, parsedData);
                appState.editingLineId = null;
            } else {
                drawLineOnCanvas(parsedData);
            }
        }
    }

    document.getElementById('coordModal').style.display = 'none';
    document.getElementById('coordInput').value = '';
};

/* Застаріла функція (залишена для сумісності) */
window.submitCoords = function () { closeCoordModal(); };

/* ── Кнопки напрямку ── */
window.setAngle = function (direction) {
    G.currentAngle = direction;
    const codeMap = { up: 'top', down: 'bottom', right: 'right', left: 'left', free: 'free' };
    if (direction === 'free') G.freeLineQuadrant = null;
    _insertIntoCoordInput(codeMap[direction]);
};

/* ── Кнопки типу лінії ── */
window.setLineType = function (type) {
    G.currentLineType = type;
    const codeMap = { line: 'line', arc: 'curve' };
    _insertIntoCoordInput(codeMap[type]);
};

/* ── Вибір елемента ── */
window.selectElement = function (code) {
    G.selectedElement = code;
    const coordInput = document.getElementById('coordInput');
    const cursorPos  = coordInput.selectionStart;
    const textBefore = coordInput.value.substring(0, cursorPos);
    const textAfter  = coordInput.value.substring(cursorPos);
    const lastChar   = textBefore.slice(-1);
    const prefix     = (textBefore && !textBefore.endsWith('\n') && lastChar !== '-' && isNaN(lastChar)) ? '\n' : '';
    const newText    = textBefore + prefix + code + '\n';
    coordInput.value = newText + textAfter;
    coordInput.setSelectionRange(newText.length, newText.length);
    coordInput.focus();
};

function _insertIntoCoordInput(code) {
    const coordInput = document.getElementById('coordInput');
    const cursorPos  = coordInput.selectionStart;
    const textBefore = coordInput.value.substring(0, cursorPos);
    const textAfter  = coordInput.value.substring(cursorPos);
    const newText    = textBefore + (textBefore && !textBefore.endsWith('\n') ? '\n' : '') + code + '\n';
    coordInput.value = newText + textAfter;
    coordInput.setSelectionRange(newText.length, newText.length);
    coordInput.focus();
}

/* ── Парсинг введених координат ── */
window.parseCoordinateInput = function (inputText) {
    const lines = inputText.trim().split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.length < 2) {
        showToast('Введіть принаймні напрямок та тип лінії', 'warning'); return null;
    }

    const direction = lines[0].toLowerCase();
    if (!['top', 'bottom', 'left', 'right', 'free'].includes(direction)) {
        showToast('Невірний напрямок. Використовуйте: top, bottom, left, right, free', 'error'); return null;
    }

    let quadrant   = null;
    let startIndex = 1;

    if (direction === 'free') {
        if (lines.length > 1 && ['top', 'bottom', 'left', 'right'].includes(lines[1].toLowerCase())) {
            quadrant   = lines[1].toLowerCase();
            startIndex = 2;
        } else if (G.freeLineQuadrant) {
            quadrant = G.freeLineQuadrant;
        }
    }

    if (lines.length < startIndex + 1) {
        showToast('Введіть тип лінії', 'warning'); return null;
    }

    const lineType = lines[startIndex].toLowerCase();
    if (!['line', 'curve'].includes(lineType)) {
        showToast('Невірний тип лінії. Використовуйте: line, curve', 'error'); return null;
    }

    const elements = [];
    for (let i = startIndex + 1; i < lines.length; i++) {
        const numValue = parseFloat(lines[i].replace(',', '.'));
        if (!isNaN(numValue)) {
            elements.push({ type: 'number', value: numValue });
        } else {
            elements.push({ type: 'element', value: lines[i] });
        }
    }

    return { direction, lineType, elements, quadrant };
};
