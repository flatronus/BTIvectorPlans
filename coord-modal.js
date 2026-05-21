/**
 * coord-modal.js — Модалка координат: парсинг вводу, кнопки напрямку/типу/елементів.
 * Залежності: state.js, g.js, shape-editor.js, toast.js
 */

/* ── Додати точку ── */
window.addPoint = function () {
    document.getElementById('coordInput').value = '';
    document.getElementById('coordModal').style.display = 'block';
    appState.editingLineId = null;
    _updateWindowCornerAnchorUI();
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

    try {
        _applyDiagonalConstraint(pt1Num, pt2Num, dist);
    } finally {
        closeDiagonalModal();
    }
};

/* ── Закрити модалку координат та обробити введення ── */
window.closeCoordModal = function () {
    const modal   = document.getElementById('coordModal');
    const inputEl = document.getElementById('coordInput');
    const inputText = inputEl ? inputEl.value.trim() : '';

    try {
        // Режим додавання лінії до елемента (вікна)
        if (appState._addingElementLine) {
            appState._addingElementLine = false;
            if (inputText) {
                const parsedData = parseCoordinateInput(inputText);
                if (parsedData) {
                    _addLineToElementEditor(parsedData);
                }
            }
            return;
        }

        if (inputText) {
            /* Є текст — парсимо і малюємо або оновлюємо */
            const parsedData = parseCoordinateInput(inputText);
            if (parsedData) {
                if (appState.editingLineId) {
                    updateExistingLine(appState.editingLineId, parsedData);
                    appState.editingLineId = null;
                } else {
                    drawLineOnCanvas(parsedData);
                }
            }
        } else if (appState.editingLineId) {
            /* Порожнє поле при редагуванні → видалити цю лінію і всі наступні */
            deleteLineAndFollowing(appState.editingLineId);
            appState.editingLineId = null;
            appState.isClosingLine = false;
        } else {
            /* Порожнє поле без редагування — просто закрити */
            appState.isClosingLine = false;
        }
    } catch (err) {
        console.error('closeCoordModal error:', err);
        showToast('Помилка: ' + err.message, 'error');
        appState.editingLineId = null;
        appState.isClosingLine = false;
        appState._addingElementLine = false;
    } finally {
        if (modal)   modal.style.display = 'none';
        if (inputEl) inputEl.value = '';
        // Сховати блок прив'язки
        const box = document.getElementById('windowCornerAnchorBox');
        if (box) box.style.display = 'none';
    }
};

/* ── Відмінити — закрити без змін ── */
window.cancelCoordModal = function () {
    appState.editingLineId = null;
    appState.isClosingLine = false;
    appState._addingElementLine = false;
    document.getElementById('coordModal').style.display = 'none';
    document.getElementById('coordInput').value = '';
    const box = document.getElementById('windowCornerAnchorBox');
    if (box) box.style.display = 'none';
};

/* Застаріла функція (залишена для сумісності) */
window.submitCoords = function () { closeCoordModal(); };

/* ── Кнопки напрямку ── */
window.setAngle = function (direction) {
    G.currentAngle = direction;
    // right і left — відносні напрямки від попередньої лінії
    _insertIntoCoordInput(direction);
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
    if (!['left', 'right', 'free', 'diagonal'].includes(direction)) {
        showToast('Невірний напрямок. Використовуйте: right, left', 'error'); return null;
    }

    const startIndex = 1;

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

    return { direction, lineType, elements };
};

/* ── UI прив'язки до кута вікна (A/B) ── */

/**
 * Оновлює блок прив'язки до кута вікна у coord modal.
 * Показує блок тільки в режимі редагування елемента, розраховує
 * відстань від поточної точки 1 редактора до кутів A та B.
 */
window._updateWindowCornerAnchorUI = function () {
    const box = document.getElementById('windowCornerAnchorBox');
    if (!box) return;

    if (!appState.viewingElementMode || !appState.viewingElementTransform) {
        box.style.display = 'none';
        return;
    }

    const tr = appState.viewingElementTransform;
    if (!tr.wA || !tr.wB) {
        box.style.display = 'none';
        return;
    }

    box.style.display = 'block';

    // Точка 1 в редакторі елементів = START_X, START_Y
    const pt1 = G.elementEditorPoints && G.elementEditorPoints.length > 0
        ? G.elementEditorPoints[0]
        : { x: START_X, y: START_Y };

    const distA = (Math.hypot(tr.wA.x - pt1.x, tr.wA.y - pt1.y) / SCALE).toFixed(2);
    const distB = (Math.hypot(tr.wB.x - pt1.x, tr.wB.y - pt1.y) / SCALE).toFixed(2);

    const info = document.getElementById('windowCornerDistanceInfo');
    if (info) info.textContent = `відстань від т.1 до A: ${distA} м, до B: ${distB} м`;
};

/**
 * Вставляє у поле вводу відстань від точки 1 до кута A або B.
 * Це дозволяє прив'язати першу лінію до кута вікна.
 */
window.insertWindowCornerAnchor = function (corner) {
    if (!appState.viewingElementTransform) return;
    const tr = appState.viewingElementTransform;
    const cornerPt = corner === 'A' ? tr.wA : tr.wB;
    if (!cornerPt) return;

    const pt1 = G.elementEditorPoints && G.elementEditorPoints.length > 0
        ? G.elementEditorPoints[0]
        : { x: START_X, y: START_Y };

    const dist = (Math.hypot(cornerPt.x - pt1.x, cornerPt.y - pt1.y) / SCALE).toFixed(2);

    const coordInput = document.getElementById('coordInput');
    const cursorPos  = coordInput.selectionStart;
    const textBefore = coordInput.value.substring(0, cursorPos);
    const textAfter  = coordInput.value.substring(cursorPos);
    const prefix     = (textBefore && !textBefore.endsWith('\n')) ? '\n' : '';
    const newText    = textBefore + prefix + dist + '\n';
    coordInput.value = newText + textAfter;
    coordInput.setSelectionRange(newText.length, newText.length);
    coordInput.focus();
};

/**
 * Відкриває coord modal у режимі редагування елемента.
 * Додає нову лінію до G.elementEditorLines.
 */
window.addElementEditorLine = function () {
    document.getElementById('coordInput').value = '';
    document.getElementById('coordModal').style.display = 'block';
    appState.editingLineId = null;
    appState._addingElementLine = true;
    _updateWindowCornerAnchorUI();
    setTimeout(() => document.getElementById('coordInput').focus(), 100);
};
