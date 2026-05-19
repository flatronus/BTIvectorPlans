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

    /* ── Закриття модалок кліком на тлі ── */
    document.addEventListener('click', (event) => {
        const copyModal  = document.getElementById('copyModal');
        const quickModal = document.getElementById('quickShapeModal');
        if (event.target === copyModal)  copyModal.style.display  = 'none';
        if (event.target === quickModal) closeQuickShapeModal();
    });

    /* ── Ініціалізація поля номера приміщення ── */
    setTimeout(() => {
        const inp = document.getElementById('roomNumberInput');
        if (inp) inp.value = G.roomNumber;
    }, 100);

});
