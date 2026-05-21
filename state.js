/**
 * Централізований стан застосунку.
 * Замінює розрізнені window.* прапорці.
 */

const appState = {
    /** true — замикаюча лінія очікує введення */
    isClosingLine: false,

    /** id лінії, яку зараз редагують (null якщо нова) */
    editingLineId: null,

    /** id елемента ієрархії, відкритого для редагування (null якщо новий) */
    editingHierarchyItemId: null,

    /** Розрахована площа фігури (рядок, наприклад "12.3") */
    calculatedArea: null,

    /** true — редактор фігур відкрито у режимі перегляду елемента (не редагування) */
    viewingElementMode: false,

    /** Дані для режиму перегляду: { item, hostLine, el } */
    viewingElementSource: null,

    /** Трансформація для відображення елемента */
    viewingElementTransform: null,

};
