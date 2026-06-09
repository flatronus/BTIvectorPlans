/**
 * hierarchy.js — Ієрархія елементів (дерево, відображення, вибір).
 * Залежності: g.js, canvas-manager.js
 */

/** Зручна назва для коду елемента */
const ELEMENT_NAMES = {
    WI1: 'Вікно',  DV1: 'Двері',   OT1: 'Отвір',
    KO1: 'Комин 1', KO2: 'Комин 2',
    PI1: 'Піч 1',   PI2: 'Піч 2',
    KU1: 'Кухня 1', KU2: 'Кухня 2', KU3: 'Кухня 3',
    KL1: 'Колона 1', KL2: 'Колона 2',
    NI1: 'Ніша'
};

/**
 * Витягує з масиву elements лінії всі присутні елементи у форматі:
 * [ { start, end, code } ]
 */
window.extractLineElements = function (elements) {
    const result = [];
    for (let i = 0; i < elements.length; i++) {
        if (elements[i]?.type     === 'number' &&
            elements[i + 1]?.type === 'number' &&
            elements[i + 2]?.type === 'element') {
            let code = elements[i + 2].value;
            let side = 1;
            if (code.startsWith('-')) { side = -1; code = code.substring(1); }
            result.push({ start: elements[i].value, end: elements[i + 1].value, code, side });
            i += 2;
        }
    }
    return result;
};

/** Зберігає поточні G.hierarchyData/G.hierarchyIdCounter в активний canvas-об'єкт */
window._syncHierarchyToCanvas = function () {
    const canvas = window.canvasManager?.canvases.find(
        c => c.id === window.canvasManager?.activeCanvasId
    );
    if (canvas) {
        canvas.hierarchyData      = G.hierarchyData;
        canvas.hierarchyIdCounter = G.hierarchyIdCounter;
    }
};

window.addToHierarchy = function (shapeData) {
    const item = {
        id:         G.hierarchyIdCounter++,
        type:       shapeData.isBuilding ? 'building' : 'room',
        name:       shapeData.name || (shapeData.isBuilding ? `Будівля ${G.hierarchyIdCounter}` : `Кімната ${G.hierarchyIdCounter}`),
        roomNumber: shapeData.roomNumber || '',
        area:       shapeData.area || '',
        figureLines: JSON.parse(JSON.stringify(shapeData.figureLines)),
        shapePoints: JSON.parse(JSON.stringify(shapeData.shapePoints)),
        svgGroup:   shapeData.svgGroup,
        children:   [],
        expanded:   true,
        parentId:   shapeData.parentId || null
    };

    if (shapeData.parentId) {
        const parent = findHierarchyItemById(shapeData.parentId);
        if (parent) parent.children.push(item);
    } else {
        G.hierarchyData.push(item);
    }

    _syncHierarchyToCanvas();
    renderHierarchy();
    return item;
};

window.findHierarchyItemById = function (id, items = G.hierarchyData) {
    for (const item of items) {
        if (item.id === id) return item;
        const found = findHierarchyItemById(id, item.children);
        if (found) return found;
    }
    return null;
};

window.renderHierarchy = function () {
    const tree = document.getElementById('hierarchy-tree');
    tree.innerHTML = '';
    if (G.hierarchyData.length === 0) {
        
        renderProperties(null);
        return;
    }
    G.hierarchyData.forEach(item => tree.appendChild(createHierarchyItemElement(item)));
};

window.selectHierarchyItem = function (item) {
    G.selectedHierarchyItem = item.id;
    _highlightSvgItem(item);
    renderHierarchy();
    renderProperties(item);
};

/** Виділяє SVG-групу елемента: лінії стають червоними; попереднє виділення знімається */
window._highlightSvgItem = function (item) {
    const canvas = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
    const mainSvg = canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;
    if (mainSvg) {
        // Знімаємо виділення з ліній/полігонів фігур
        mainSvg.querySelectorAll('line[data-selected], polyline[data-selected], polygon[data-selected], path[data-selected]').forEach(el => {
            el.setAttribute('stroke', el.getAttribute('data-orig-stroke') || 'black');
            el.setAttribute('stroke-width', el.getAttribute('data-orig-stroke-width') || '1');
            el.removeAttribute('data-selected');
            el.removeAttribute('data-orig-stroke');
            el.removeAttribute('data-orig-stroke-width');
        });
        // Знімаємо виділення з полосок конструктивів
        mainSvg.querySelectorAll('polygon[data-construct][data-selected-construct]').forEach(function(el) {
            el.setAttribute('stroke', el.getAttribute('data-orig-stroke') || '#38bdf8');
            el.setAttribute('stroke-width', '1');
            el.removeAttribute('data-selected-construct');
            el.removeAttribute('data-orig-stroke');
        });
        // Ховаємо маркери початку всіх полосок
        G.hierarchyData.forEach(function(i) {
            if (i.type === 'construct' && typeof _hideConstructStartMarker === 'function')
                _hideConstructStartMarker(i);
        });
        // Видаляємо мітки точок попереднього виділення
        mainSvg.querySelectorAll('[data-point-label]').forEach(el => el.remove());
    }

    if (!item) return;

    // ── Construct: виділяємо полоску ──
    if (item.type === 'construct') {
        if (item._svgPoly) {
            const orig = item._svgPoly.getAttribute('stroke') || '#38bdf8';
            item._svgPoly.setAttribute('data-orig-stroke', orig);
            item._svgPoly.setAttribute('data-selected-construct', '1');
            item._svgPoly.setAttribute('stroke', '#ef4444');
            item._svgPoly.setAttribute('stroke-width', '2.5');
        }
        if (typeof _showConstructStartMarker === 'function') _showConstructStartMarker(item);
        return;
    }

    if (!item.svgGroup) return;

    // Виділяємо тільки елементи цієї групи, не заходячи в дочірні <g data-hierarchy-id>
    function collectLines(node) {
        node.childNodes.forEach(function(child) {
            if (child.nodeType !== 1) return;
            if (child.tagName === 'g' && child.hasAttribute('data-hierarchy-id')) return;
            var tag = child.tagName;
            if (tag === 'line' || tag === 'polyline' || tag === 'polygon' || tag === 'path') {
                var orig = child.getAttribute('stroke') || 'black';
                child.setAttribute('data-orig-stroke', orig);
                child.setAttribute('data-selected', '1');
                child.setAttribute('stroke', '#ef4444');
            }
            if (tag === 'g') collectLines(child);
        });
    }
    collectLines(item.svgGroup);

    // Малюємо номери точок по кутах фігури
    if (item.shapePoints && item.shapePoints.length > 0 && mainSvg) {
        // Зміщення точок у локальній системі групи (початковий offset при малюванні)
        var offsetX = item._offsetX || 0;
        var offsetY = item._offsetY || 0;
        if (item._anchorOnCanvas) {
            offsetX = item._anchorOnCanvas.x - (typeof START_X !== 'undefined' ? START_X : 400);
            offsetY = item._anchorOnCanvas.y - (typeof START_Y !== 'undefined' ? START_Y : 300);
        }

        // CTM групи: перетворює локальні координати групи → SVG-координати.
        // Автоматично враховує translate + rotate на групі (і при drag, і після).
        var groupCTM = null;
        try {
            var svgScreenCTM = mainSvg.getScreenCTM();
            var grpScreenCTM = item.svgGroup.getScreenCTM();
            if (svgScreenCTM && grpScreenCTM) {
                groupCTM = svgScreenCTM.inverse().multiply(grpScreenCTM);
            }
        } catch(e) {}

        item.shapePoints.forEach(function(pt) {
            var cx, cy;
            if (groupCTM) {
                // Локальна координата точки в системі групи = pt + offset
                // (саме так намальовані лінії всередині групи)
                var p = mainSvg.createSVGPoint();
                p.x = pt.x + offsetX;
                p.y = pt.y + offsetY;
                var r = p.matrixTransform(groupCTM);
                cx = r.x;
                cy = r.y;
            } else {
                // Fallback: тільки translate (без rotate)
                var tx = 0, ty = 0;
                var tmr = (item.svgGroup.getAttribute('transform') || '')
                              .match(/translate\(([^,)]+),([^)]+)\)/);
                if (tmr) { tx = parseFloat(tmr[1]) || 0; ty = parseFloat(tmr[2]) || 0; }
                cx = pt.x + offsetX + tx;
                cy = pt.y + offsetY + ty;
            }

            var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', cx);
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', '#e53935');
            circle.setAttribute('data-point-label', '1');
            circle.style.pointerEvents = 'none';
            mainSvg.appendChild(circle);

            var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', cx + 8);
            text.setAttribute('y', cy - 6);
            text.setAttribute('font-size', '13');
            text.setAttribute('fill', '#e53935');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('data-point-label', '1');
            text.style.pointerEvents = 'none';
            text.textContent = pt.num;
            mainSvg.appendChild(text);
        });
    }
};

/**
 * Визначення схем властивостей для кожного типу елемента.
 * Кожна властивість: { key, label, type, readOnly, options, group, hint }
 * type: 'string' | 'number' | 'select' | 'bool' | 'info'
 */
const PROP_SCHEMA = {
    building: [
        { group: 'Ідентифікація' },
        { key: 'type',       label: 'Тип',          type: 'select', readOnly: false,
          options: [{ v: 'room', l: 'Кімната' }, { v: 'building', l: 'Будинок' }, { v: 'contour', l: 'Контур' }] },
        { key: 'name',       label: 'Назва',         type: 'string', readOnly: false },
        { key: 'roomNumber', label: '№ приміщення',  type: 'string', readOnly: false, hint: 'Формат: 1-1' },
        { group: 'Площа' },
        { key: 'area',         label: 'Площа реальна (м²)',   type: 'number', readOnly: false, hint: 'Автоматично або вручну' },
        { key: 'customArea',   label: "Площа редагована (м²)", type: 'number', readOnly: false, hint: 'Налаштована вручну площа' },
        { key: 'useCustomArea',label: 'Використовувати редаговану', type: 'bool', readOnly: false },
        { group: 'Відображення' },
        { key: 'showRoomLabel',  label: 'Показати підпис',    type: 'bool',   readOnly: false },
        { key: 'roomLabelStyle', label: 'Вид підпису',        type: 'select', readOnly: false,
          options: [{ v: 'inline', l: 'Традиційний (всередині)' }, { v: 'leader', l: 'Виносний' }] },
        { key: 'labelFontSize',     label: 'Шрифт підпису (мм)',   type: 'number', readOnly: false, hint: 'За замовчуванням 3.5 мм (ЕСКД)' },
        { key: 'dimensionFontSize', label: 'Шрифт розмірів (мм)',  type: 'number', readOnly: false, hint: 'За замовчуванням 3.5 мм (ЕСКД)' },
        { key: 'dimensionsOutside', label: 'Розміри ззовні', type: 'bool', readOnly: false },
        { key: 'visible',    label: 'Видимий',       type: 'bool',   readOnly: false },
    ],
    room: [
        { group: 'Ідентифікація' },
        { key: 'type',       label: 'Тип',           type: 'select', readOnly: false,
          options: [{ v: 'room', l: 'Кімната' }, { v: 'building', l: 'Будинок' }, { v: 'contour', l: 'Контур' }] },
        { key: 'name',       label: 'Назва',         type: 'string', readOnly: false },
        { key: 'roomNumber', label: '№ приміщення',  type: 'string', readOnly: false, hint: 'Формат: 1-1' },
        { group: 'Площа' },
        { key: 'area',         label: 'Площа реальна (м²)',    type: 'number', readOnly: false, hint: 'Автоматично або вручну' },
        { key: 'customArea',   label: "Площа редагована (м²)", type: 'number', readOnly: false, hint: 'Налаштована вручну площа' },
        { key: 'useCustomArea',label: 'Використовувати редаговану', type: 'bool', readOnly: false },
        { group: 'Відображення' },
        { key: 'showRoomLabel',  label: 'Показати підпис',    type: 'bool',   readOnly: false },
        { key: 'roomLabelStyle', label: 'Вид підпису',        type: 'select', readOnly: false,
          options: [{ v: 'inline', l: 'Традиційний (всередині)' }, { v: 'leader', l: 'Виносний' }] },
        { key: 'labelFontSize',     label: 'Шрифт підпису (мм)',   type: 'number', readOnly: false, hint: 'За замовчуванням 3.5 мм (ЕСКД)' },
        { key: 'dimensionFontSize', label: 'Шрифт розмірів (мм)',  type: 'number', readOnly: false, hint: 'За замовчуванням 3.5 мм (ЕСКД)' },
        { key: 'dimensionsOutside', label: 'Розміри ззовні', type: 'bool', readOnly: false },
        { key: 'visible',    label: 'Видимий',       type: 'bool',   readOnly: false },
    ],
    element: [
        { group: 'Ідентифікація' },
        { key: 'name',        label: 'Назва',        type: 'string', readOnly: false },
        { group: 'Розміщення' },
        { key: '_lineDef',    label: 'Лінія',        type: 'info',   readOnly: true  },
        { key: 'elStart',     label: 'Від (м)',      type: 'number', readOnly: false },
        { key: 'elEnd',       label: 'До (м)',       type: 'number', readOnly: false },
        { key: 'windowAutoWidth', label: 'Авто-ширина (до стіни)', type: 'bool', readOnly: false },
        { key: '_thickness',  label: 'Товщина (м)',  type: 'number', readOnly: false, hint: 'За замовчуванням 0.20' },
        { key: 'elSide',      label: 'Зсередини',    type: 'bool',   readOnly: false },
        { group: 'Відображення' },
        { key: 'visible',     label: 'Видимий',      type: 'bool',   readOnly: false },
    ],
    construct: [
        { group: 'Конструктив' },
        { key: 'name',               label: 'Назва',                     type: 'string', readOnly: false },
        { key: 'constructThickness', label: 'Товщина (м)',                type: 'number', readOnly: false, hint: '0.20' },
        { key: 'constructAutoWidth', label: 'Авто-товщина (= вікно)',     type: 'bool',   readOnly: false },
        { key: 'constructSideInward',label: 'Зсередини',                  type: 'bool',   readOnly: false },
        { key: 'constructFromEnd',   label: 'Початок від кінця B',        type: 'bool',   readOnly: false },
        { key: 'constructLength',    label: 'Довжина від початку (м)',     type: 'number', readOnly: false, hint: 'Вся довжина якщо 0' },
        { group: 'Відображення' },
        { key: 'visible',            label: 'Видимий',                    type: 'bool',   readOnly: false },
    ],
};

/** Зчитує значення властивості з item (зі спеціальними ключами) */
function _propGet(item, key) {
    if (key === 'type') return item.type || 'room';
    if (key === 'customArea')    return item.customArea   ?? '';
    if (key === 'useCustomArea') return item.useCustomArea === true;
    if (key === 'showRoomLabel')  return item.showRoomLabel !== false;
    if (key === 'roomLabelStyle') return item.roomLabelStyle || 'inline';
    if (key === '_lineCount') return (item.figureLines || []).length;
    if (key === '_ptCount')   return (item.shapePoints || []).length;
    if (key === '_lineDef')   return (item.lineFrom ?? '?') + ' → ' + (item.lineTo ?? '?');
    if (key === '_offsetX')   return item._offsetX != null ? item._offsetX.toFixed(1) : '—';
    if (key === '_offsetY')   return item._offsetY != null ? item._offsetY.toFixed(1) : '—';
    if (key === 'visible')    return item.visible !== false;
    if (key === '_thickness') {
        if (item.elThickness != null) return item.elThickness;
        const parent = _findParentItemById(item.id);
        if (parent) {
            const ld = (parent.figureLines || []).find(l => l.id === item._hostLineId);
            if (ld && ld._elementThickness != null) return ld._elementThickness;
        }
        return ELEMENT_THICKNESS;
    }
    if (key === 'labelFontSize')     return item.labelFontSize     != null ? item.labelFontSize     : DEFAULT_FONT_SIZE_MM;
    if (key === 'dimensionFontSize') return item.dimensionFontSize != null ? item.dimensionFontSize : DEFAULT_FONT_SIZE_MM;
    if (key === 'dimensionsOutside') return item.dimensionsOutside === true;
    if (key === 'constructThickness') return item.constructThickness != null ? item.constructThickness : (typeof CONSTRUCT_THICKNESS_M !== 'undefined' ? CONSTRUCT_THICKNESS_M : 0.2);
    if (key === 'constructFromEnd')   return item.constructFromEnd === true;
    if (key === 'constructSideInward') return item.constructSideInward === true;
    if (key === 'constructLength')    return item.constructLength  != null ? item.constructLength  : 0;
    if (key === 'constructAutoWidth') return item.constructAutoWidth === true;
    if (key === 'windowAutoWidth')    return item.windowAutoWidth === true;
    // elSide як bool: true = зсередини (side=-1), false = ззовні (side=1)
    if (key === 'elSide') return (item.elSide != null ? item.elSide : 1) === -1;
    return item[key] ?? '';
}

/** Записує значення властивості в item і застосовує побічні ефекти */
function _propSet(item, key, value) {
    if (key === 'type') {
        item.type = value;
        renderHierarchy();
        renderProperties(item);
        return;
    }
    if (key === 'visible') {
        item.visible = value;
        if (item.svgGroup) item.svgGroup.style.display = value ? '' : 'none';
        if (item.type === 'construct' && typeof _redrawConstructItem === 'function') _redrawConstructItem(item);
        return;
    }
    if (key === 'name' || key === 'roomNumber') {
        item[key] = value;
        renderHierarchy();
        return;
    }
    if (key === 'area') {
        item.area = value;
        renderHierarchy();
        return;
    }
    if (key === 'customArea') {
        item.customArea = value;
        renderHierarchy();
        return;
    }
    if (key === 'useCustomArea') {
        item.useCustomArea = value;
        renderHierarchy();
        return;
    }
    if (key === 'showRoomLabel' || key === 'roomLabelStyle') {
        item[key] = value;
        _redrawItemSvgGroup(item);
        return;
    }
    if (key === 'labelFontSize' || key === 'dimensionFontSize') {
        const v = parseFloat(value);
        item[key] = isNaN(v) ? null : v;
        _redrawItemSvgGroup(item);
        return;
    }
    if (key === 'dimensionsOutside') {
        item.dimensionsOutside = value;
        _redrawItemSvgGroup(item);
        return;
    }
    if (key === 'elStart' || key === 'elEnd' || key === 'elSide' || key === '_thickness') {
        if (key === 'elStart') item.elStart = parseFloat(value) || 0;
        else if (key === 'elEnd') item.elEnd = parseFloat(value) || 0;
        // elSide: bool true → зсередини → side=-1; false → ззовні → side=1
        else if (key === 'elSide') item.elSide = value ? -1 : 1;
        else if (key === '_thickness') item.elThickness = parseFloat(value) || ELEMENT_THICKNESS;
        _syncElementToParentAndRedraw(item);
        return;
    }
    if (key === 'constructThickness' || key === 'constructFromEnd' || key === 'constructLength' || key === 'constructSideInward' || key === 'constructAutoWidth') {
        if (key === 'constructThickness') item.constructThickness = parseFloat(String(value).replace(',', '.')) || CONSTRUCT_THICKNESS_M;
        else if (key === 'constructFromEnd') item.constructFromEnd = value;
        else if (key === 'constructSideInward') item.constructSideInward = value;
        else if (key === 'constructLength') item.constructLength = parseFloat(String(value).replace(',', '.')) || 0;
        else if (key === 'constructAutoWidth') {
            item.constructAutoWidth = value;
            if (value) showToast('Авто-товщина: підлаштовується до вікна на тій самій лінії', 'info');
        }
        if (typeof _redrawConstructItem === 'function') _redrawConstructItem(item);
        return;
    }
    if (key === 'windowAutoWidth') {
        item.windowAutoWidth = value;
        if (value) {
            if (typeof _applyWindowAutoWidth === 'function') _applyWindowAutoWidth(item);
            _syncElementToParentAndRedraw(item);
            showToast('Авто-ширина застосована', 'success');
        }
        renderProperties(item);
        return;
    }
    item[key] = value;
}

/** Перемальовує SVG-групу item зі збереженням і відновленням G */
function _redrawItemSvgGroup(item) {
    if (!item || !item.svgGroup) return;
    const offsetX = item._anchorOnCanvas ? item._anchorOnCanvas.x - START_X : (item._offsetX || 0);
    const offsetY = item._anchorOnCanvas ? item._anchorOnCanvas.y - START_Y : (item._offsetY || 0);
    const savedLines = G.figureLines, savedPoints = G.shapePoints;
    const savedDO = G.dimensionsOutside, savedRoom = G.roomNumber, savedBuild = G.isBuilding;
    G.figureLines = JSON.parse(JSON.stringify(item.figureLines));
    G.shapePoints = JSON.parse(JSON.stringify(item.shapePoints));
    G.dimensionsOutside = item.dimensionsOutside === true;
    G.roomNumber  = item.roomNumber || '';
    G.isBuilding  = item.type === 'building';
    _rebuildSvgGroup(item.svgGroup, offsetX, offsetY, item);
    G.figureLines = savedLines;
    G.shapePoints = savedPoints;
    G.dimensionsOutside = savedDO;
    G.roomNumber  = savedRoom;
    G.isBuilding  = savedBuild;
}

/** Знаходить батьківський item за id дочірнього (по всьому дереву) */
function _findParentItemById(childId, items, parent) {
    items = items || G.hierarchyData;
    for (var i = 0; i < items.length; i++) {
        if (items[i].id === childId) return parent || null;
        var found = _findParentItemById(childId, items[i].children || [], items[i]);
        if (found !== undefined) return found;
    }
    return undefined;
}

/**
 * Перебудовує рядок lineData.code з масиву elements.
 * Формат: direction\nlineType\nval1\nval2\ncode\n...
 */
function _rebuildLineCode(elements, direction, lineType) {
    var lines = [direction || 'free', lineType || 'line'];
    (elements || []).forEach(function(el) {
        lines.push(el.type === 'number' ? String(el.value) : el.value);
    });
    return lines.join('\n');
}

/**
 * Після редагування властивостей елемента (WI1): оновлює lineData батьківської фігури
 * і перемальовує SVG-групу батька з новими значеннями.
 */
function _syncElementToParentAndRedraw(elItem) {
    const parent = _findParentItemById(elItem.id);
    if (!parent) return;

    // Знаходимо lineData
    var lineData = null;
    if (elItem._hostLineId != null)
        lineData = (parent.figureLines || []).find(function(l) { return l.id === elItem._hostLineId; });
    if (!lineData)
        lineData = (parent.figureLines || []).find(function(l) {
            return l.from === elItem.lineFrom && (l.to === elItem.lineTo || (l.isClosing && elItem.lineTo == null));
        });
    if (!lineData) return;

    // Оновлюємо тріплет у lineData.elements
    var els = lineData.elements || [];
    for (var i = 0; i < els.length; i++) {
        if (els[i]?.type === 'number' && els[i+1]?.type === 'number' && els[i+2]?.type === 'element') {
            var rawCode = els[i+2].value;
            var code    = rawCode.startsWith('-') ? rawCode.substring(1) : rawCode;
            var side    = rawCode.startsWith('-') ? -1 : 1;
            var elKey   = 'wi_' + lineData.from + '_' + (lineData.to ?? 'c') + '_' + code + '_' + els[i].value;
            if (elItem._elKey && !elItem._elKey.startsWith('wi_drag_') && elItem._elKey !== elKey) { i += 2; continue; }
            els[i].value   = elItem.elStart;
            els[i+1].value = elItem.elEnd;
            var newSide    = elItem.elSide != null ? elItem.elSide : side;
            els[i+2].value = newSide === -1 ? ('-' + code) : code;
            if (!elItem._elKey || !elItem._elKey.startsWith('wi_drag_'))
                elItem._elKey = 'wi_' + lineData.from + '_' + (lineData.to ?? 'c') + '_' + code + '_' + elItem.elStart;
            lineData.code = _rebuildLineCode(lineData.elements, lineData.direction, lineData.lineType);
            break;
        }
    }

    // Drag-WI1: перемальовуємо тільки власну <g> вікна
    if (elItem._elKey && elItem._elKey.startsWith('wi_drag_')) {
        if (typeof _redrawWindowElement === 'function') _redrawWindowElement(elItem);
        elItem.name = _buildElementName(elItem);
        renderHierarchy();
        return;
    }

    // Звичайний WI1 (через координати): перемальовуємо батьківську групу
    if (!parent.svgGroup) return;
    var offsetX = parent._anchorOnCanvas ? parent._anchorOnCanvas.x - START_X : (parent._offsetX || 0);
    var offsetY = parent._anchorOnCanvas ? parent._anchorOnCanvas.y - START_Y : (parent._offsetY || 0);
    var savedLines = G.figureLines, savedPoints = G.shapePoints;
    var savedRoom  = G.roomNumber,  savedBuild   = G.isBuilding;
    G.figureLines = JSON.parse(JSON.stringify(parent.figureLines));
    G.shapePoints = JSON.parse(JSON.stringify(parent.shapePoints));
    G.roomNumber  = parent.roomNumber || '';
    G.isBuilding  = parent.type === 'building';
    _rebuildSvgGroup(parent.svgGroup, offsetX, offsetY, parent);
    G.figureLines = savedLines;
    G.shapePoints = savedPoints;
    G.roomNumber  = savedRoom;
    G.isBuilding  = savedBuild;
    elItem.name = _buildElementName(elItem);
    renderHierarchy();
}

/**
 * Видаляє виділений елемент ієрархії (фігуру, примітив, конструктив, вікно).
 */
window.deleteSelectedHierarchyItem = function() {
    const id = G.selectedHierarchyItem;
    if (id == null) { showToast('Оберіть елемент для видалення', 'warning'); return; }
    const item = findHierarchyItemById(id);
    if (!item) return;

    // Видаляємо SVG
    if (item.type === 'construct') {
        if (item._svgPoly && item._svgPoly.parentNode)
            item._svgPoly.parentNode.removeChild(item._svgPoly);
    } else {
        if (item.svgGroup && item.svgGroup.parentNode)
            item.svgGroup.parentNode.removeChild(item.svgGroup);
        // Прибираємо мітки точок
        const canvas = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
        const mainSvg = canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;
        if (mainSvg) mainSvg.querySelectorAll('[data-point-label]').forEach(el => el.remove());
    }

    // Якщо це дочірній елемент (WI1 тощо) — видаляємо з тріплету lineData батька
    if (item.type === 'element') {
        const parent = _findParentItemById(item.id);
        if (parent && parent.figureLines) {
            var ld = parent.figureLines.find(function(l) { return l.id === item._hostLineId; });
            if (!ld) ld = parent.figureLines.find(function(l) {
                return l.from === item.lineFrom && (l.to === item.lineTo || l.isClosing);
            });
            if (ld && ld.elements) {
                var els = ld.elements;
                for (var i = 0; i < els.length; i++) {
                    if (els[i]?.type === 'number' && els[i+1]?.type === 'number' && els[i+2]?.type === 'element') {
                        var startVal = els[i].value;
                        if (Math.abs(startVal - item.elStart) < 0.001) {
                            els.splice(i, 3);
                            ld.code = _rebuildLineCode(ld.elements, ld.direction, ld.lineType);
                            break;
                        }
                        i += 2;
                    }
                }
            }
        }
    }

    // Видаляємо з дерева ієрархії
    function _removeFromTree(items) {
        for (var i = 0; i < items.length; i++) {
            if (items[i].id === id) { items.splice(i, 1); return true; }
            if (_removeFromTree(items[i].children || [])) return true;
        }
        return false;
    }
    _removeFromTree(G.hierarchyData);
    G.selectedHierarchyItem = null;
    _syncHierarchyToCanvas();
    renderHierarchy();
    renderProperties(null);
    showToast('Елемент видалено', 'info');
};

/** Рендерить панель Властивості для вибраного елемента */
window.renderProperties = function (item) {
    const body = document.getElementById('properties-body');
    if (!body) return;
    body.innerHTML = '';

    if (!item) {
        return;
    }

    const schema = PROP_SCHEMA[item.type] || PROP_SCHEMA.room;

    /* ── Заголовок панелі з кнопкою + ── */
    const titleBar = document.createElement('div');
    titleBar.style.cssText = [
        'background:#1e40af;color:#fff;font-size:11px;font-weight:700;',
        'padding:4px 8px;display:flex;align-items:center;justify-content:space-between;',
        'border-bottom:2px solid #1e3a8a;',
    ].join('');
    const typeIcon = item.type === 'building' ? '🏢' : item.type === 'element' ? '🪟' : item.type === 'contour' ? '⬡' : item.type === 'construct' ? '▬' : '🚪';
    const titleText = document.createElement('span');
    titleText.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    titleText.textContent = typeIcon + ' ' + (item.roomNumber || item.name || 'Без назви');
    titleBar.appendChild(titleText);

    const addBtn = document.createElement('button');
    addBtn.title = 'Додати користувацьку властивість';
    addBtn.textContent = '+';
    addBtn.style.cssText = [
        'background:#3b82f6;color:#fff;border:1px solid #93c5fd;border-radius:3px;',
        'font-size:13px;font-weight:700;padding:0 6px;cursor:pointer;',
        'line-height:18px;flex-shrink:0;margin-left:6px;',
    ].join('');
    addBtn.onclick = function() { _showAddCustomPropDialog(item, body); };
    titleBar.appendChild(addBtn);

    const delBtn = document.createElement('button');
    delBtn.title = 'Видалити елемент (Delete)';
    delBtn.textContent = '🗑';
    delBtn.style.cssText = [
        'background:#f44336;color:#fff;border:none;border-radius:3px;',
        'font-size:13px;padding:0 6px;cursor:pointer;',
        'line-height:18px;flex-shrink:0;margin-left:4px;',
    ].join('');
    delBtn.onclick = function() { deleteSelectedHierarchyItem(); };
    titleBar.appendChild(delBtn);

    body.appendChild(titleBar);

    /* ── Таблиця властивостей ── */
    const table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';

    schema.forEach(function(prop) {
        /* Заголовок групи */
        if (prop.group) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 2;
            td.style.cssText = [
                'background:#dbeafe;color:#1e40af;font-weight:700;',
                'padding:3px 6px;font-size:10px;letter-spacing:0.5px;',
                'text-transform:uppercase;border-top:1px solid #bfdbfe;',
                'border-bottom:1px solid #bfdbfe;user-select:none;',
            ].join('');
            td.textContent = prop.group;
            tr.appendChild(td);
            table.appendChild(tr);
            return;
        }

        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid #f0f0f0;';

        const tdLabel = document.createElement('td');
        tdLabel.style.cssText = [
            'color:#374151;padding:3px 6px;width:46%;',
            'background:#f9fafb;border-right:1px solid #e5e7eb;',
            'vertical-align:middle;white-space:nowrap;overflow:hidden;',
            'text-overflow:ellipsis;',
        ].join('');
        tdLabel.title = prop.hint || prop.label;
        tdLabel.textContent = prop.label;
        tr.appendChild(tdLabel);

        const tdVal = document.createElement('td');
        tdVal.style.cssText = 'padding:1px 2px;vertical-align:middle;';

        const val = _propGet(item, prop.key);
        const ctrl = _makeControl(prop, val, item);
        tdVal.appendChild(ctrl);
        tr.appendChild(tdVal);

        table.appendChild(tr);
    });

    body.appendChild(table);

    /* ── Користувацькі властивості ── */
    if (!item._customProps) item._customProps = [];
    if (item._customProps.length > 0) {
        body.appendChild(_makeGroupHeader('Користувацькі'));
        const tblC = document.createElement('table');
        tblC.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';
        item._customProps.forEach(function(cp, idx) {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid #f0f0f0';

            const tdL = document.createElement('td');
            tdL.style.cssText = 'color:#374151;padding:3px 6px;width:46%;background:#f9fafb;border-right:1px solid #e5e7eb;vertical-align:middle;';
            tdL.title = cp.label;
            tdL.textContent = cp.label;

            const tdV = document.createElement('td');
            tdV.style.cssText = 'padding:1px 2px;vertical-align:middle;display:flex;align-items:center;gap:2px;';

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.value = cp.value || '';
            inp.style.cssText = [
                'flex:1;min-width:0;font-size:11px;border:none;background:transparent;',
                'padding:2px 4px;color:#111827;outline:none;',
            ].join('');
            inp.onfocus = function() { inp.style.background = '#eff6ff'; inp.style.outline = '1px solid #2196F3'; };
            inp.onblur  = function() { inp.style.background = 'transparent'; inp.style.outline = 'none'; };
            inp.onchange = function() { cp.value = inp.value; };

            const delBtn = document.createElement('button');
            delBtn.textContent = '✕';
            delBtn.title = 'Видалити властивість';
            delBtn.style.cssText = [
                'background:none;border:none;color:#f44336;cursor:pointer;',
                'font-size:10px;padding:1px 3px;flex-shrink:0;',
            ].join('');
            delBtn.onclick = function() {
                item._customProps.splice(idx, 1);
                renderProperties(item);
            };

            tdV.appendChild(inp); tdV.appendChild(delBtn);
            tr.appendChild(tdL); tr.appendChild(tdV);
            tblC.appendChild(tr);
        });
        body.appendChild(tblC);
    }
};

/** Показує inline-форму для додавання користувацької властивості */
function _showAddCustomPropDialog(item, body) {
    // Видаляємо попередній діалог якщо є
    const existing = body.querySelector('[data-add-prop-dialog]');
    if (existing) { existing.remove(); return; }

    const dlg = document.createElement('div');
    dlg.setAttribute('data-add-prop-dialog', '1');
    dlg.style.cssText = [
        'background:#eff6ff;border:1px solid #93c5fd;border-radius:4px;',
        'padding:8px;margin:4px 0;',
    ].join('');

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:4px;margin-bottom:4px;';

    const nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.placeholder = 'Назва властивості';
    nameInp.style.cssText = 'flex:1;font-size:11px;padding:3px 5px;border:1px solid #93c5fd;border-radius:3px;';

    const valInp = document.createElement('input');
    valInp.type = 'text';
    valInp.placeholder = 'Значення';
    valInp.style.cssText = 'flex:1;font-size:11px;padding:3px 5px;border:1px solid #93c5fd;border-radius:3px;';

    row1.appendChild(nameInp); row1.appendChild(valInp);

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:4px;justify-content:flex-end;';

    const okBtn = document.createElement('button');
    okBtn.textContent = 'Додати';
    okBtn.style.cssText = 'background:#2196F3;color:#fff;border:none;border-radius:3px;padding:3px 10px;font-size:11px;cursor:pointer;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Скасувати';
    cancelBtn.style.cssText = 'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:3px;padding:3px 8px;font-size:11px;cursor:pointer;';

    okBtn.onclick = function() {
        const label = nameInp.value.trim();
        const value = valInp.value.trim();
        if (!label) { nameInp.style.borderColor = '#f44336'; nameInp.focus(); return; }
        if (!item._customProps) item._customProps = [];
        item._customProps.push({ label, value });
        renderProperties(item);
    };
    cancelBtn.onclick = function() { dlg.remove(); };

    nameInp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); valInp.focus(); } });
    valInp.addEventListener('keydown',  function(e) { if (e.key === 'Enter') { e.preventDefault(); okBtn.click(); } });

    row2.appendChild(cancelBtn); row2.appendChild(okBtn);
    dlg.appendChild(row1); dlg.appendChild(row2);
    body.appendChild(dlg);
    nameInp.focus();
}

/** Створює контрол для властивості */
function _makeControl(prop, val, item) {
    const BASE_STYLE = [
        'width:100%;box-sizing:border-box;font-size:11px;',
        'border:none;background:transparent;',
        'padding:2px 4px;color:#111827;',
        'outline:none;',
    ].join('');

    if (prop.type === 'info') {
        const span = document.createElement('span');
        span.style.cssText = 'font-size:11px;color:#374151;padding:2px 6px;display:block;';
        span.textContent = val !== '' && val != null ? String(val) : '—';
        return span;
    }

    if (prop.type === 'bool') {
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 4px;cursor:pointer;';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = !!val;
        chk.disabled = !!prop.readOnly;
        chk.style.cssText = 'width:13px;height:13px;cursor:pointer;accent-color:#2196F3;';
        chk.onchange = function() { _propSet(item, prop.key, chk.checked); };
        const lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:11px;color:#374151;user-select:none;';
        lbl.textContent = chk.checked ? 'Так' : 'Ні';
        chk.onchange = function() {
            lbl.textContent = chk.checked ? 'Так' : 'Ні';
            _propSet(item, prop.key, chk.checked);
        };
        wrap.appendChild(chk); wrap.appendChild(lbl);
        return wrap;
    }

    if (prop.type === 'select') {
        const sel = document.createElement('select');
        sel.style.cssText = BASE_STYLE + 'cursor:pointer;';
        sel.disabled = !!prop.readOnly;
        (prop.options || []).forEach(function(opt) {
            const o = document.createElement('option');
            o.value = opt.v;
            o.textContent = opt.l;
            if (String(val) === String(opt.v)) o.selected = true;
            sel.appendChild(o);
        });
        sel.onchange = function() { _propSet(item, prop.key, sel.value); };
        _applyFocusStyle(sel);
        return sel;
    }

    if (prop.type === 'string') {
        if (prop.readOnly) {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:11px;color:#374151;padding:2px 6px;display:block;';
            span.textContent = val || '—';
            return span;
        }
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = val || '';
        inp.placeholder = prop.hint || '';
        inp.style.cssText = BASE_STYLE;
        inp.onchange = function() { _propSet(item, prop.key, inp.value.trim()); };
        _applyFocusStyle(inp);
        return inp;
    }

    if (prop.type === 'number') {
        if (prop.readOnly) {
            const span = document.createElement('span');
            span.style.cssText = 'font-size:11px;color:#374151;padding:2px 6px;display:block;';
            span.textContent = val !== '' && val != null ? String(val) : '—';
            return span;
        }
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.inputMode = 'decimal';
        inp.value = val !== '' && val != null ? val : '';
        inp.placeholder = prop.hint || '0';
        inp.style.cssText = BASE_STYLE;
        inp.oninput = function() {
            // Нормалізуємо кому в крапку під час введення
            const pos = inp.selectionStart;
            const hadComma = inp.value.includes(',');
            if (hadComma) {
                inp.value = inp.value.replace(',', '.');
                try { inp.setSelectionRange(pos, pos); } catch(e) {}
            }
        };
        inp.onchange = function() {
            inp.value = inp.value.replace(',', '.');
            _propSet(item, prop.key, inp.value);
        };
        _applyFocusStyle(inp);
        return inp;
    }

    const span = document.createElement('span');
    span.textContent = String(val ?? '—');
    return span;
}

function _applyFocusStyle(el) {
    el.onfocus = function() {
        el.style.background = '#eff6ff';
        el.style.outline = '1px solid #2196F3';
    };
    el.onblur = function() {
        el.style.background = 'transparent';
        el.style.outline = 'none';
    };
}

function _makeGroupHeader(text) {
    const div = document.createElement('div');
    div.style.cssText = [
        'background:#dbeafe;color:#1e40af;font-weight:700;',
        'padding:3px 6px;font-size:10px;letter-spacing:0.5px;',
        'text-transform:uppercase;border-top:1px solid #bfdbfe;',
        'border-bottom:1px solid #bfdbfe;user-select:none;',
    ].join('');
    div.textContent = text;
    return div;
}

/** Будує назву елемента для панелі ієрархії: "Вікно 1-2" */
function _buildElementName(elItem) {
    const base = ELEMENT_NAMES[elItem.elCode] || elItem.elCode || 'Елемент';
    const from = elItem.lineFrom ?? '?';
    const to   = elItem.lineTo   ?? '?';
    return base + ' ' + from + '-' + to;
}

window.openShapeModalForEdit = function (item) {
    appState.viewingElementMode    = false;
    appState.viewingElementSource  = null;
    appState.viewingElementTransform = null;
    document.getElementById('shapeModal').style.display = 'block';
    G.figureLines = JSON.parse(JSON.stringify(item.figureLines));
    G.shapePoints = JSON.parse(JSON.stringify(item.shapePoints));
    G.roomNumber  = item.roomNumber || '';
    G.isBuilding  = item.type === 'building';
    appState.editingHierarchyItemId = item.id;

    // Відновлюємо лічильники щоб нові лінії/точки не конфліктували з існуючими
    const maxLineId = G.figureLines.reduce((m, l) => Math.max(m, l.id || 0), 0);
    G.lineIdCounter = maxLineId + 1;
    const maxPointNum = G.shapePoints.reduce((m, p) => Math.max(m, p.num || 0), 0);
    G.pointCounter  = maxPointNum;

    redrawEntireFigure();
};

window.createHierarchyItemElement = function (item) {
    const container = document.createElement('div');
    const itemDiv   = document.createElement('div');
    itemDiv.className = 'hierarchy-item' + (G.selectedHierarchyItem === item.id ? ' selected' : '');

    const hasChildren = (item.children || []).length > 0;

    if (hasChildren) {
        const toggle = document.createElement('span');
        toggle.className = 'hierarchy-toggle';
        toggle.textContent = item.expanded ? '▼' : '▶';
        toggle.onclick = (e) => {
            e.stopPropagation();
            item.expanded = !item.expanded;
            renderHierarchy();
        };
        itemDiv.appendChild(toggle);
    } else {
        const spacer = document.createElement('span');
        spacer.style.width = '14px';
        itemDiv.appendChild(spacer);
    }

    const icon = document.createElement('i');
    icon.className = 'fas icon ' + (item.type === 'building' ? 'fa-building' : item.type === 'element' ? 'fa-window-maximize' : item.type === 'contour' ? 'fa-draw-polygon' : item.type === 'construct' ? 'fa-grip-lines' : 'fa-door-open');
    icon.style.color = item.type === 'building' ? '#2196F3' : item.type === 'element' ? '#9C27B0' : item.type === 'contour' ? '#9E9E9E' : item.type === 'construct' ? '#0ea5e9' : '#4CAF50';
    itemDiv.appendChild(icon);

    const label = document.createElement('span');
    label.style.flex = '1';
    label.textContent = item.type === 'element'
        ? _buildElementName(item)
        : (item.roomNumber || item.name);
    itemDiv.appendChild(label);

    const displayArea = (item.useCustomArea && item.customArea) ? item.customArea : item.area;
    if (displayArea) {
        const areaLabel = document.createElement('span');
        areaLabel.style.fontSize = '10px';
        areaLabel.style.color    = item.useCustomArea && item.customArea ? '#FF9800' : '#999';
        areaLabel.title = item.useCustomArea && item.customArea ? "Редагована площа" : "Реальна площа";
        areaLabel.textContent    = `${displayArea}м²`;
        itemDiv.appendChild(areaLabel);
    }

    // Одиночний клік — виділення
    itemDiv.onclick = () => selectHierarchyItem(item);

    // Подвійний клік — відкрити редактор фігури (тільки для кімнат і будівель)
    if (item.type !== 'element') {
        itemDiv.ondblclick = (e) => {
            e.stopPropagation();
            openShapeModalForEdit(item);
        };
    }

    container.appendChild(itemDiv);

    if (item.expanded) {
        if (hasChildren) {
            const childWrap = document.createElement('div');
            childWrap.className = 'hierarchy-children';
            item.children.forEach(child => childWrap.appendChild(createHierarchyItemElement(child)));
            container.appendChild(childWrap);
        }
    }

    return container;
};
