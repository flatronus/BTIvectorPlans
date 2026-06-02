/**
 * main.js — Точка входу. Ініціалізація та глобальні обробники подій.
 * Підключати ОСТАННІМ.
 * Залежності: усі інші файли.
 */

document.addEventListener('DOMContentLoaded', function () {

    /* ── Ініціалізація першого полотна ── */
    window.canvasManager.createCanvas();

    /* ── Розділювач панелей Елементи / Властивості ── */
    (function initPanelDivider() {
        const divider    = document.getElementById('panel-divider');
        const panelEl    = document.getElementById('panel-elements');
        const panelPr    = document.getElementById('panel-properties');
        const container  = document.getElementById('hierarchy-panel');
        if (!divider || !panelEl || !panelPr) return;

        let dragging = false;
        let startY   = 0;
        let startH   = 0;

        function onStart(clientY) {
            dragging = true;
            startY   = clientY;
            startH   = panelEl.getBoundingClientRect().height;
            divider.classList.add('dragging');
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
        }

        function onMove(clientY) {
            if (!dragging) return;
            const totalH  = container.getBoundingClientRect().height;
            const divH    = divider.getBoundingClientRect().height;
            const delta   = clientY - startY;
            const minH    = 50;
            const maxH    = totalH - divH - minH;
            const newH    = Math.max(minH, Math.min(maxH, startH + delta));
            panelEl.style.flex = 'none';
            panelEl.style.height = newH + 'px';
            panelPr.style.flex = '1';
        }

        function onEnd() {
            if (!dragging) return;
            dragging = false;
            divider.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        divider.addEventListener('mousedown',  e => { e.preventDefault(); onStart(e.clientY); });
        document.addEventListener('mousemove', e => onMove(e.clientY));
        document.addEventListener('mouseup',   () => onEnd());

        divider.addEventListener('touchstart', e => { e.preventDefault(); onStart(e.touches[0].clientY); }, { passive: false });
        document.addEventListener('touchmove',  e => { if (dragging) { e.preventDefault(); onMove(e.touches[0].clientY); } }, { passive: false });
        document.addEventListener('touchend',   () => onEnd());

        // Рівний розподіл за замовчуванням
        panelEl.style.flex = '1';
        panelPr.style.flex = '1';
    })();

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
