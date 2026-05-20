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
    };

    window.closeShapeModal = function () {
        if (G.figureLines.length === 0) {
            showToast('Спочатку створіть фігуру', 'warning'); return;
        }
        transferFigureToMainCanvas();
        document.getElementById('shapeModal').style.display = 'none';
        resetShapeData();
    };

    /** Закрити редактор фігур без збереження змін */
    window.cancelShapeModal = function () {
        document.getElementById('shapeModal').style.display = 'none';
        resetShapeData();
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
