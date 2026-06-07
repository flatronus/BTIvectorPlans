/**
 * main.js — Точка входу. Ініціалізація та глобальні обробники подій.
 * Підключати ОСТАННІМ.
 * Залежності: усі інші файли.
 */

document.addEventListener('DOMContentLoaded', function () {

    /* ── Ініціалізація першого полотна ── */
    window.canvasManager.createCanvas();

    /* ── Ініціалізація панелі Конструктиви ── */
    if (typeof initConstructsPanel === 'function') initConstructsPanel();

    /* ── Акордеон бічної панелі ── */
    window.toggleAccordion = function (panelId) {
        const sections = document.querySelectorAll('.accordion-section');
        sections.forEach(sec => {
            if (sec.id === panelId) {
                // Якщо вже відкрита — не закриваємо (одна завжди відкрита)
                if (!sec.classList.contains('accordion-open')) {
                    sec.classList.add('accordion-open');
                }
            } else {
                sec.classList.remove('accordion-open');
            }
        });
    };

    /* ── Модалка фігур ── */
    window.openShapeModal = function () {
        appState.editingHierarchyItemId = null;
        document.getElementById('shapeModal').style.display = 'block';
        _updateShapeModalToolbar();
    };

    window.closeShapeModal = function () {
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
        document.getElementById('shapeModal').style.display = 'none';
        resetShapeData();
        _updateShapeModalToolbar();
    };

    /**
     * Кнопка «Додати» в редакторі фігур.
     */
    window.shapeModalAddAction = function () {
        addPoint();
    };

    /**
     * Оновлює видимість кнопок тулбара.
     */
    window._updateShapeModalToolbar = function () {
        const thickBtn = document.getElementById('shapeToolbarThicknessBtn');
        if (thickBtn) thickBtn.style.display = 'none';
    };

    /** Відкрити / приховати панель ієрархії */
    window.toggleHierarchyPanel = function () {
        const panel = document.getElementById('hierarchy-panel');
        const btn   = document.getElementById('hierarchy-toggle-btn');
        const isHidden = panel.classList.contains('hierarchy-panel--hidden');
        panel.classList.toggle('hierarchy-panel--hidden', !isHidden);
        if (btn) btn.classList.toggle('bg-blue-100', isHidden);
    };

    /* ── Клавіатурні скорочення ── */
    document.addEventListener('keydown', (e) => {
        // Пропускаємо якщо фокус в полі вводу
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n': e.preventDefault(); canvasManager.createCanvas();  break;
                case 'o': e.preventDefault(); canvasManager.openCanvas();    break;
                case 's': e.preventDefault(); saveActiveCanvas();             break;
                case '=':
                case '+': e.preventDefault(); zoomIn();                       break;
                case '-': e.preventDefault(); zoomOut();                      break;
            }
            return;
        }
        // Режими інструментів
        switch (e.key.toLowerCase()) {
            case 'h': shapeTransform.setMode('pan');    break;
            case 'v': shapeTransform.setMode('select'); break;
            case 'm': shapeTransform.setMode('move');   break;
            case 'r': shapeTransform.setMode('rotate'); break;
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
