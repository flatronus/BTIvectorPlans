/**
 * g.js — Глобальний змінний стан застосунку.
 * Доступний як window.G з будь-якого файлу.
 * Підключати ПЕРШИМ після constants.js і state.js.
 */

window.G = {
    /* ── Середовище ── */
    isWebCodeApp: navigator.userAgent.toLowerCase().includes('web code'),
    isAndroid:    /Android/i.test(navigator.userAgent),
    isLocalFile:  window.location.protocol === 'file:',

    /* ── Стан редактора фігур ── */
    dimensionsOutside: false,
    isBuilding:        false,
    roomNumber:        '',

    /* Збереження стану поля номера приміщення між перемалюваннями */
    roomNumberInputValue:          '',
    roomNumberInputFocused:        false,
    roomNumberInputSelectionStart: 0,
    roomNumberInputSelectionEnd:   0,

    /* Масив ліній фігури та лічильники */
    figureLines:   [],
    lineIdCounter: 1,
    pointCounter:  1,

    /* Free-лінії (з невідомим кутом) */
    pendingFreeLines: [],
    freeLineQuadrant: null,

    /* Ієрархія елементів — активна (поточна канва) */
    hierarchyData:         [],
    hierarchyIdCounter:    1,
    selectedHierarchyItem: null,

    /* Поточні налаштування модалки координат */
    currentAngle:    'up',
    currentLineType: 'line',
    selectedElement: null,

    /* Точки фігури */
    shapePoints: [{ x: START_X, y: START_Y, num: 1 }],
};
