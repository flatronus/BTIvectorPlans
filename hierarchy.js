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
        tree.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Немає елементів</div>';
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
        mainSvg.querySelectorAll('line[data-selected], polyline[data-selected], polygon[data-selected], path[data-selected]').forEach(el => {
            el.setAttribute('stroke', el.getAttribute('data-orig-stroke') || 'black');
            el.removeAttribute('data-selected');
            el.removeAttribute('data-orig-stroke');
        });
        // Видаляємо мітки точок попереднього виділення
        mainSvg.querySelectorAll('[data-point-label]').forEach(el => el.remove());
    }
    if (!item || !item.svgGroup) return;

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
        // Обчислюємо зміщення групи (translate)
        var offsetX = item._offsetX || 0;
        var offsetY = item._offsetY || 0;
        if (item._anchorOnCanvas) {
            offsetX = item._anchorOnCanvas.x - (typeof START_X !== 'undefined' ? START_X : 400);
            offsetY = item._anchorOnCanvas.y - (typeof START_Y !== 'undefined' ? START_Y : 300);
        }
        // Додатково враховуємо transform групи (move/rotate)
        var tx = 0, ty = 0;
        var tr = item.svgGroup.getAttribute('transform') || '';
        var tm = tr.match(/translate\(([^,)]+),([^)]+)\)/);
        if (tm) { tx = parseFloat(tm[1]) || 0; ty = parseFloat(tm[2]) || 0; }

        item.shapePoints.forEach(function(pt) {
            var cx = pt.x + offsetX + tx;
            var cy = pt.y + offsetY + ty;

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
        { key: 'type',       label: 'Тип',          type: 'info',   readOnly: true  },
        { key: 'name',       label: 'Назва',         type: 'string', readOnly: false },
        { key: 'roomNumber', label: '№ приміщення',  type: 'string', readOnly: false, hint: 'Формат: 1-1' },
        { group: 'Геометрія' },
        { key: '_lineCount', label: 'Ліній',         type: 'info',   readOnly: true  },
        { key: '_ptCount',   label: 'Точок',         type: 'info',   readOnly: true  },
        { group: 'Відображення' },
        { key: 'dimensionsOutside', label: 'Розміри ззовні', type: 'bool', readOnly: false },
        { key: 'visible',    label: 'Видимий',       type: 'bool',   readOnly: false },
    ],
    room: [
        { group: 'Ідентифікація' },
        { key: 'type',       label: 'Тип',           type: 'info',   readOnly: true  },
        { key: 'name',       label: 'Назва',         type: 'string', readOnly: false },
        { key: 'roomNumber', label: '№ приміщення',  type: 'string', readOnly: false, hint: 'Формат: 1-1' },
        { group: 'Площа' },
        { key: 'area',       label: 'Площа (м²)',    type: 'number', readOnly: false, hint: 'Автоматично або вручну' },
        { group: 'Геометрія' },
        { key: '_lineCount', label: 'Ліній',         type: 'info',   readOnly: true  },
        { key: '_ptCount',   label: 'Точок',         type: 'info',   readOnly: true  },
        { group: 'Позиція' },
        { key: '_offsetX',   label: 'Зміщення X',    type: 'info',   readOnly: true  },
        { key: '_offsetY',   label: 'Зміщення Y',    type: 'info',   readOnly: true  },
        { group: 'Відображення' },
        { key: 'visible',    label: 'Видимий',       type: 'bool',   readOnly: false },
    ],
    element: [
        { group: 'Ідентифікація' },
        { key: 'type',    label: 'Тип',        type: 'info',   readOnly: true  },
        { key: 'elCode',  label: 'Код',        type: 'info',   readOnly: true  },
        { key: 'name',    label: 'Назва',      type: 'string', readOnly: false },
        { group: 'Розміщення' },
        { key: '_lineDef', label: 'Лінія',     type: 'info',   readOnly: true  },
        { key: 'elStart',  label: 'Від (м)',   type: 'number', readOnly: false },
        { key: 'elEnd',    label: 'До (м)',    type: 'number', readOnly: false },
        { key: 'elSide',   label: 'Сторона',   type: 'select', readOnly: false, options: [{ v: 1, l: 'Права (1)' }, { v: -1, l: 'Ліва (-1)' }] },
        { group: 'Відображення' },
        { key: 'visible',  label: 'Видимий',   type: 'bool',   readOnly: false },
    ],
};

/** Зчитує значення властивості з item (зі спеціальними ключами) */
function _propGet(item, key) {
    if (key === 'type') {
        const m = { building: 'Будівля', room: 'Кімната', element: 'Елемент' };
        return m[item.type] || item.type;
    }
    if (key === '_lineCount') return (item.figureLines || []).length;
    if (key === '_ptCount')   return (item.shapePoints || []).length;
    if (key === '_lineDef')   return (item.lineFrom ?? '?') + ' → ' + (item.lineTo ?? '?');
    if (key === '_offsetX')   return item._offsetX != null ? item._offsetX.toFixed(1) : '—';
    if (key === '_offsetY')   return item._offsetY != null ? item._offsetY.toFixed(1) : '—';
    if (key === 'visible')    return item.visible !== false;
    return item[key] ?? '';
}

/** Записує значення властивості в item і застосовує побічні ефекти */
function _propSet(item, key, value) {
    if (key === 'visible') {
        item.visible = value;
        if (item.svgGroup) item.svgGroup.style.display = value ? '' : 'none';
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
    if (key === 'elStart' || key === 'elEnd') {
        item[key] = parseFloat(value) || 0;
        return;
    }
    if (key === 'elSide') {
        item.elSide = parseInt(value);
        return;
    }
    if (key === 'dimensionsOutside') {
        item.dimensionsOutside = value;
        return;
    }
    item[key] = value;
}

/** Рендерить панель Властивості для вибраного елемента */
window.renderProperties = function (item) {
    const body = document.getElementById('properties-body');
    if (!body) return;
    body.innerHTML = '';

    if (!item) {
        body.innerHTML =
            '<div style="color:#aaa;text-align:center;padding:20px 8px;font-size:11px;line-height:1.6;">' +
            '<div style="font-size:18px;margin-bottom:6px;">📋</div>' +
            'Оберіть елемент<br>у панелі вище</div>';
        return;
    }

    const schema = PROP_SCHEMA[item.type] || PROP_SCHEMA.room;

    /* ── Заголовок панелі (як у VB: назва об'єкта) ── */
    const titleBar = document.createElement('div');
    titleBar.style.cssText = [
        'background:#1e40af;color:#fff;font-size:11px;font-weight:700;',
        'padding:4px 8px;margin-bottom:0;letter-spacing:0.3px;',
        'border-bottom:2px solid #1e3a8a;',
    ].join('');
    const typeIcon = item.type === 'building' ? '🏢' : item.type === 'element' ? '🪟' : '🚪';
    titleBar.textContent = typeIcon + ' ' + (item.roomNumber || item.name || 'Без назви');
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

        /* Ліва колонка — назва властивості */
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

        /* Права колонка — значення / контрол */
        const tdVal = document.createElement('td');
        tdVal.style.cssText = 'padding:1px 2px;vertical-align:middle;';

        const val = _propGet(item, prop.key);
        const ctrl = _makeControl(prop, val, item);
        tdVal.appendChild(ctrl);
        tr.appendChild(tdVal);

        table.appendChild(tr);
    });

    body.appendChild(table);

    /* ── Додаткові секції: елементи на лініях ── */
    if (item.type !== 'element') {
        const elems = (item.figureLines || []).flatMap(function(l) {
            return extractLineElements(l.elements || []);
        });
        if (elems.length > 0) {
            const hdr = _makeGroupHeader('Елементи на лініях (' + elems.length + ')');
            body.appendChild(hdr);
            const tbl2 = document.createElement('table');
            tbl2.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';
            elems.forEach(function(el) {
                const name = ELEMENT_NAMES[el.code] || el.code;
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #f0f0f0';
                const td1 = document.createElement('td');
                td1.style.cssText = 'color:#9C27B0;font-weight:700;padding:3px 6px;width:46%;background:#f9fafb;border-right:1px solid #e5e7eb;';
                td1.textContent = el.code;
                const td2 = document.createElement('td');
                td2.style.cssText = 'color:#374151;padding:3px 6px;';
                td2.textContent = name + '  ' + el.start.toFixed(2) + '–' + el.end.toFixed(2) + ' м';
                tr.appendChild(td1); tr.appendChild(td2);
                tbl2.appendChild(tr);
            });
            body.appendChild(tbl2);
        }

        const kids = item.children || [];
        if (kids.length > 0) {
            body.appendChild(_makeGroupHeader('Дочірні (' + kids.length + ')'));
            const tbl3 = document.createElement('table');
            tbl3.style.cssText = 'width:100%;border-collapse:collapse;font-size:11px;';
            kids.forEach(function(ch) {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #f0f0f0';
                const td1 = document.createElement('td');
                td1.style.cssText = 'color:#6b7280;padding:3px 6px;width:46%;background:#f9fafb;border-right:1px solid #e5e7eb;';
                td1.textContent = '↳ ' + (ch.roomNumber || ch.name);
                const td2 = document.createElement('td');
                td2.style.cssText = 'color:#374151;padding:3px 6px;';
                td2.textContent = ch.type === 'element' ? (ELEMENT_NAMES[ch.elCode] || ch.elCode || '—') : (ch.area ? ch.area + ' м²' : '—');
                tr.appendChild(td1); tr.appendChild(td2);
                tbl3.appendChild(tr);
            });
            body.appendChild(tbl3);
        }
    }
};

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
        inp.type = 'number';
        inp.inputMode = 'decimal';
        inp.step = '0.01';
        inp.value = val !== '' && val != null ? val : '';
        inp.placeholder = prop.hint || '0';
        inp.style.cssText = BASE_STYLE;
        inp.onchange = function() { _propSet(item, prop.key, inp.value); };
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
    icon.className = 'fas icon ' + (item.type === 'building' ? 'fa-building' : item.type === 'element' ? 'fa-window-maximize' : 'fa-door-open');
    icon.style.color = item.type === 'building' ? '#2196F3' : item.type === 'element' ? '#9C27B0' : '#4CAF50';
    itemDiv.appendChild(icon);

    const label = document.createElement('span');
    label.style.flex = '1';
    label.textContent = item.roomNumber || item.name;
    itemDiv.appendChild(label);

    if (item.area) {
        const areaLabel = document.createElement('span');
        areaLabel.style.fontSize = '10px';
        areaLabel.style.color    = '#999';
        areaLabel.textContent    = `${item.area}м²`;
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
