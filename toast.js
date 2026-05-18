/**
 * Toast-повідомлення.
 * Замінює виклики alert() / confirm() у всьому застосунку.
 *
 * Використання:
 *   showToast('Текст повідомлення');
 *   showToast('Увага!', 'warning');
 *   showToast('Помилка', 'error');
 *   showToast('Збережено', 'success');
 */

(function () {
    let container = null;

    function ensureContainer() {
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }
    }

    /**
     * @param {string} message   - Текст повідомлення
     * @param {'info'|'success'|'warning'|'error'} type - Тип (впливає на колір)
     * @param {number} duration  - Тривалість показу у мс (за замовчуванням 3000)
     */
    window.showToast = function (message, type = 'info', duration = 3000) {
        ensureContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Запускаємо анімацію появи
        requestAnimationFrame(() => {
            requestAnimationFrame(() => toast.classList.add('show'));
        });

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, duration);
    };
})();
