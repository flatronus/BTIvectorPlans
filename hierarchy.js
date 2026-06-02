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
    }
    if (!item || !item.svgGroup) return;

    item.svgGroup.querySelectorAll('line, polyline, polygon, path').forEach(el => {
        const orig = el.getAttribute('stroke') || 'black';
        el.setAttribute('data-orig-stroke', orig);
        el.setAttribute('data-selected', '1');
        el.setAttribute('stroke', '#ef4444');
    });
};

/** Рендерить панель Властивості для вибраного елемента */
window.renderProperties = function (item) {
    const body = document.getElementById('properties-body');
    if (!body) return;
    body.innerHTML = '';

    if (!item) {
        body.innerHTML = '<div style="color:#999;text-align:center;padding:16px;font-size:11px;">Оберіть елемент</div>';
        return;
    }

    function row(label, value) {
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;gap:4px;padding:4px 2px;border-bottom:1px solid #f0f0f0;font-size:11px;';
        const l = document.createElement('span');
        l.style.cssText = 'color:#6b7280;flex-shrink:0;width:80px;';
        l.textContent = label;
        const v = document.createElement('span');
        v.style.cssText = 'color:#111827;word-break:break-all;';
        v.textContent = value ?? '—';
        d.appendChild(l); d.appendChild(v);
        return d;
    }

    body.appendChild(row('Тип', item.type === 'building' ? 'Будівля' : 'Кімната'));
    body.appendChild(row('Назва', item.name));
    if (item.roomNumber) body.appendChild(row('№ приміщ.', item.roomNumber));
    if (item.area)       body.appendChild(row('Площа', item.area + ' м²'));
    body.appendChild(row('Ліній', (item.figureLines || []).length));
    body.appendChild(row('Точок', (item.shapePoints || []).length));

    const elems = (item.figureLines || []).flatMap(l => extractLineElements(l.elements || []));
    if (elems.length > 0) {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:700;color:#374151;';
        hdr.textContent = 'Елементи на лініях:';
        body.appendChild(hdr);
        elems.forEach(el => {
            const name = ELEMENT_NAMES[el.code] || el.code;
            body.appendChild(row(el.code, `${name} · ${el.start.toFixed(2)}–${el.end.toFixed(2)} м`));
        });
    }

    if ((item.children || []).length > 0) {
        const hdr = document.createElement('div');
        hdr.style.cssText = 'margin-top:8px;margin-bottom:4px;font-size:11px;font-weight:700;color:#374151;';
        hdr.textContent = `Дочірні (${item.children.length}):`;
        body.appendChild(hdr);
        item.children.forEach(ch => {
            body.appendChild(row('↳', ch.roomNumber || ch.name));
        });
    }
};

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

    const linesWithElements = (item.figureLines || []).filter(l =>
        extractLineElements(l.elements || []).length > 0
    );
    const hasChildren = item.children.length > 0;
    const hasDetails  = linesWithElements.length > 0;

    if (hasChildren || hasDetails) {
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
    icon.className = 'fas icon ' + (item.type === 'building' ? 'fa-building' : 'fa-door-open');
    icon.style.color = item.type === 'building' ? '#2196F3' : '#4CAF50';
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

    // Подвійний клік — відкрити редактор фігури
    itemDiv.ondblclick = (e) => {
        e.stopPropagation();
        openShapeModalForEdit(item);
    };

    container.appendChild(itemDiv);

    if (item.expanded) {
        if (hasDetails) {
            const detailsWrap = document.createElement('div');
            detailsWrap.style.cssText = 'margin-left: 20px; padding: 4px 0 4px 8px; border-left: 1px solid #ddd;';

            linesWithElements.forEach(line => {
                extractLineElements(line.elements || []).forEach(el => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display: flex; align-items: center; gap: 5px; padding: 2px 4px; font-size: 11px; color: #555; cursor: pointer; border-radius: 3px;';
                    row.onmouseenter = () => { row.style.background = '#f3e5f5'; };
                    row.onmouseleave = () => { row.style.background = ''; };

                    const elIcon = document.createElement('i');
                    elIcon.className = 'fas fa-window-maximize';
                    elIcon.style.cssText = 'font-size: 10px; color: #9C27B0; flex-shrink: 0;';
                    row.appendChild(elIcon);

                    const elLabel = document.createElement('span');
                    const name    = ELEMENT_NAMES[el.code] || el.code;
                    const lineNum = `Л${line.from}-${line.to ?? '?'}`;
                    elLabel.textContent = `${el.code} (${name}) · ${lineNum} · ${el.start.toFixed(2)}–${el.end.toFixed(2)}м`;
                    row.appendChild(elLabel);

                    row.onclick = (e) => {
                        e.stopPropagation();
                        showToast('Редагування елементів через панель ієрархії вимкнено', 'info');
                    };

                    detailsWrap.appendChild(row);
                });
            });

            container.appendChild(detailsWrap);
        }

        if (hasChildren) {
            const childWrap = document.createElement('div');
            childWrap.className = 'hierarchy-children';
            item.children.forEach(child => childWrap.appendChild(createHierarchyItemElement(child)));
            container.appendChild(childWrap);
        }
    }

    return container;
};
