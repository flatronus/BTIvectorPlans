# BTIvectorPlans
Редактор планів БТІ

---

## Журнал версій

| Дата і час | Версія | Опис змін |
|---|---|---|
| 2026-05-18 18:00 | v0.1.0 | Початковий стан проєкту: `index.html`, `script.js`, `app.css`, `constants.js`, `state.js`, `toast.js`. Базовий редактор фігур із підтримкою полілінії, замикання, free-ліній, ієрархії елементів, мультиканви з вкладками, збереження SVG, toast-повідомлень. |
| 2026-05-19 12:00 | v0.2.0 | Рефакторинг: `script.js` розбито на 9 модулів без import/export (підключення через `<script>` в `index.html`). Додано `g.js` — глобальний змінний стан `window.G`. Нові файли: `svg-primitives.js`, `elements-on-line.js`, `canvas-manager.js`, `hierarchy.js`, `shape-editor.js`, `shape-transfer.js`, `coord-modal.js`, `lines-panel.js`, `quick-shape.js`, `main.js`. Файл `script.js` виведено з використання. |
