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
            if (code.startsWith('-')) code = code.substring(1);
            result.push({ start: elements[i].value, end: elements[i + 1].value, code });
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
        return;
    }
    G.hierarchyData.forEach(item => tree.appendChild(createHierarchyItemElement(item)));
};

window.selectHierarchyItem = function (item) {
    G.selectedHierarchyItem = item.id;
    renderHierarchy();
    openShapeModalForEdit(item);
};

window.openShapeModalForEdit = function (item) {
    document.getElementById('shapeModal').style.display = 'block';
    G.figureLines = JSON.parse(JSON.stringify(item.figureLines));
    G.shapePoints = JSON.parse(JSON.stringify(item.shapePoints));
    G.roomNumber  = item.roomNumber || '';
    G.isBuilding  = item.type === 'building';
    appState.editingHierarchyItemId = item.id;
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

    itemDiv.onclick = () => selectHierarchyItem(item);
    container.appendChild(itemDiv);

    if (item.expanded) {
        if (hasDetails) {
            const detailsWrap = document.createElement('div');
            detailsWrap.style.cssText = 'margin-left: 20px; padding: 4px 0 4px 8px; border-left: 1px solid #ddd;';

            linesWithElements.forEach(line => {
                extractLineElements(line.elements || []).forEach(el => {
                    const row = document.createElement('div');
                    row.style.cssText = 'display: flex; align-items: center; gap: 5px; padding: 2px 4px; font-size: 11px; color: #555; cursor: pointer; border-radius: 3px;';
                    row.title = 'Відкрити елемент у редакторі';
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
                        openElementInShapeEditor(item, line, el);
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
