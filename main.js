/**
 * main.js — Точка входу. Ініціалізація та глобальні обробники подій.
 * Підключати ОСТАННІМ.
 * Залежності: усі інші файли.
 */

document.addEventListener('DOMContentLoaded', function () {

    /* ── Ініціалізація першого полотна ── */
    window.canvasManager.createCanvas();

    /* ── Модалка фігур ── */
    window.openShapeModal = function () {
        appState.editingHierarchyItemId = null;
        document.getElementById('shapeModal').style.display = 'block';
        _updateShapeModalToolbar();
    };

    window.closeShapeModal = function () {
        // У режимі перегляду/редагування елемента — просто закриваємо без збереження фігури
        if (appState.viewingElementMode) {
            appState.viewingElementMode    = false;
            appState.viewingElementSource  = null;
            appState.viewingElementTransform = null;
            appState._addingElementLine    = false;
            document.getElementById('shapeModal').style.display = 'none';
            resetShapeData();
            _updateShapeModalToolbar();
            return;
        }
        if (G.figureLines.length === 0) {
            showToast('Спочатку створіть фігуру', 'warning'); return;
        }
        transferFigureToMainCanvas();
        document.getElementById('shapeModal').style.display = 'none';
        resetShapeData();
        _updateShapeModalToolbar();
    };

    /** Закрити редактор фігур без збереження змін */
    window.cancelShapeModal = function () {
        appState.viewingElementMode    = false;
        appState.viewingElementSource  = null;
        appState.viewingElementTransform = null;
        appState._addingElementLine    = false;
        document.getElementById('shapeModal').style.display = 'none';
        resetShapeData();
        _updateShapeModalToolbar();
    };

    /**
     * Кнопка «Додати» в редакторі фігур.
     * В звичайному режимі — addPoint().
     * В режимі елемента — addElementEditorLine().
     */
    window.shapeModalAddAction = function () {
        if (appState.viewingElementMode) {
            addElementEditorLine();
        } else {
            addPoint();
        }
    };

    /**
     * Оновлює підпис кнопки «Додати» залежно від режиму.
     */
    window._updateShapeModalToolbar = function () {
        const isElMode = appState.viewingElementMode;
        const addBtn = document.getElementById('shapeToolbarAddBtn');
        if (addBtn) {
            addBtn.title = isElMode ? 'Додати лінію до вікна' : 'Додати точку';
        }
    };

    /** Відкрити / приховати панель ієрархії */
    window.toggleHierarchyPanel = function () {
        const panel = document.getElementById('hierarchy-panel');
        const btn   = document.getElementById('hierarchy-toggle-btn');
        const isHidden = panel.classList.contains('hierarchy-panel--hidden');
        panel.classList.toggle('hierarchy-panel--hidden', !isHidden);
        if (btn) btn.classList.toggle('bg-blue-100', isHidden);
    };

    /* ── Модалка зміни товщини вікна ── */
    window.openElementThicknessModal = function () {
        const inp = document.getElementById('elementThicknessInput');
        if (inp) inp.value = (appState.editingElementThickness || ELEMENT_THICKNESS).toFixed(2);
        document.getElementById('elementThicknessModal').style.display = 'block';
        setTimeout(() => inp && inp.select(), 100);
    };

    window.closeElementThicknessModal = function () {
        document.getElementById('elementThicknessModal').style.display = 'none';
    };

    window.applyElementThickness = function () {
        const inp = document.getElementById('elementThicknessInput');
        const val = parseFloat(inp ? inp.value : '');
        if (isNaN(val) || val <= 0) {
            showToast('Введіть коректну товщину', 'warning');
            return;
        }
        appState.editingElementThickness = val;
        closeElementThicknessModal();
        _redrawElementEditorCanvas();
        _updateShapeModalToolbar();   // оновлює текст «т=…» у тулбарі
        updateLinesList();
        showToast(`Товщина вікна: ${val.toFixed(2)} м`, 'success');
    };

    /* ── Enter у полі товщини ── */
    document.getElementById('elementThicknessInput')?.addEventListener('keydown', function(e) {
        if (e.code === 'NumpadDecimal') {
            e.preventDefault();
            const el = this, s = el.selectionStart, en = el.selectionEnd;
            el.value = el.value.slice(0, s) + '.' + el.value.slice(en);
            el.setSelectionRange(s + 1, s + 1);
        }
        if (e.key === 'Enter') { e.preventDefault(); applyElementThickness(); }
    });
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n': e.preventDefault(); canvasManager.createCanvas();  break;
                case 'o': e.preventDefault(); canvasManager.openCanvas();    break;
                case 's': e.preventDefault(); saveActiveCanvas();             break;
                case '=':
                case '+': e.preventDefault(); zoomIn();                       break;
                case '-': e.preventDefault(); zoomOut();                      break;
            }
        }
    });

    /* ── Enter у модалці діагоналі ── */
    document.getElementById('diagonalInput')?.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); applyDiagonal(); }
    });

    /* ── Закриття модалок кліком на тлі ── */
    document.addEventListener('click', (event) => {
        const copyModal     = document.getElementById('copyModal');
        const quickModal    = document.getElementById('quickShapeModal');
        const coordModal    = document.getElementById('coordModal');
        const diagonalModal = document.getElementById('diagonalModal');
        if (event.target === copyModal)     copyModal.style.display = 'none';
        if (event.target === quickModal)    closeQuickShapeModal();
        if (event.target === coordModal)    cancelCoordModal();
        if (event.target === diagonalModal) closeDiagonalModal();
    });

    /* ── Escape закриває модалки без змін ── */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.getElementById('coordModal').style.display    === 'block') cancelCoordModal();
            if (document.getElementById('diagonalModal').style.display === 'block') closeDiagonalModal();
        }
    });

    /* ── Ініціалізація поля номера приміщення ── */
    setTimeout(() => {
        const inp = document.getElementById('roomNumberInput');
        if (inp) inp.value = G.roomNumber;
    }, 100);

});
