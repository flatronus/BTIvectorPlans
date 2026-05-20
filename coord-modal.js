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

/* ── Діагональ ── */
window.addDiagonal = function () {
    if (G.shapePoints.length < 2) {
        showToast('Для діагоналі потрібно мінімум 2 точки', 'warning');
        return;
    }
    document.getElementById('diagonalModal').style.display = 'block';
    document.getElementById('diagonalInput').value = '';
    const pts = G.shapePoints.map(function(p) { return p.num; }).join(', ');
    document.getElementById('diagonalPointsHint').textContent = 'Наявні точки: ' + pts;
    setTimeout(function() { document.getElementById('diagonalInput').focus(); }, 100);
};

window.closeDiagonalModal = function () {
    document.getElementById('diagonalModal').style.display = 'none';
    document.getElementById('diagonalInput').value = '';
};

window.applyDiagonal = function () {
    const raw   = document.getElementById('diagonalInput').value.trim();
    const parts = raw.split(/[\s,;]+/);
    if (parts.length < 3) {
        showToast('Формат: <точка1> <точка2> <відстань>  наприклад: 1 3 4,52', 'warning');
        return;
    }
    const pt1Num = parseInt(parts[0]);
    const pt2Num = parseInt(parts[1]);
    const dist   = parseFloat(parts[2].replace(',', '.'));

    if (isNaN(pt1Num) || isNaN(pt2Num) || isNaN(dist) || dist <= 0) {
        showToast('Невірний формат. Приклад: 1 3 4,52', 'error');
        return;
    }
    if (pt1Num === pt2Num) {
        showToast('Точки мають бути різними', 'warning');
        return;
    }

    const p1 = G.shapePoints.find(function(p) { return p.num === pt1Num; });
    const p2 = G.shapePoints.find(function(p) { return p.num === pt2Num; });
    if (!p1 || !p2) {
        showToast('Точки ' + pt1Num + ' або ' + pt2Num + ' не знайдено', 'error');
        return;
    }

    if (!G.diagonals) G.diagonals = [];
    const existIdx = G.diagonals.findIndex(function(d) {
        return (d.pt1 === pt1Num && d.pt2 === pt2Num) ||
               (d.pt1 === pt2Num && d.pt2 === pt1Num);
    });
    const diagEntry = { pt1: pt1Num, pt2: pt2Num, dist: dist };
    if (existIdx !== -1) G.diagonals[existIdx] = diagEntry;
    else                 G.diagonals.push(diagEntry);

    _applyDiagonalConstraint(pt1Num, pt2Num, dist);
    closeDiagonalModal();
};

/* ── Закрити модалку координат та обробити введення ── */
window.closeCoordModal = function () {
    /* Модалка закривається в будь-якому випадку */
    const modal     = document.getElementById('coordModal');
    const inputEl   = document.getElementById('coordInput');
    const inputText = inputEl ? inputEl.value.trim() : '';

    try {
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
            /* parsedData === null: помилка парсингу — showToast вже показано, нічого не міняємо */
        } else {
            /* Порожнє поле — закрити без змін */
            appState.editingLineId = null;
            appState.isClosingLine = false;
        }
    } catch (err) {
        console.error('closeCoordModal error:', err);
        showToast('Помилка обробки координат: ' + err.message, 'error');
        appState.editingLineId = null;
        appState.isClosingLine = false;
    } finally {
        if (modal)   modal.style.display = 'none';
        if (inputEl) inputEl.value = '';
    }
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
