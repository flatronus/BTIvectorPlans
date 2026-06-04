/**
 * shape-transform.js — Переміщення та обертання фігур на головному полотні.
 * Залежності: constants.js, state.js, g.js, hierarchy.js, shape-transfer.js
 *
 * Режими:
 *   'select'  — вибір фігури кліком (підсвічування)
 *   'move'    — переміщення вибраної фігури drag-ом
 *   'rotate'  — обертання вибраної фігури drag-ом
 */

window.shapeTransform = (function () {

    /* ── Стан ── */
    let _mode       = 'pan';      // 'pan' | 'select' | 'move' | 'rotate'
    let _selectedId = null;       // id ієрархічного елемента
    let _highlight  = null;       // SVG-rect підсвічування

    let _dragging   = false;
    let _dragStartX = 0;
    let _dragStartY = 0;
    let _dragOffsetX = 0;
    let _dragOffsetY = 0;
    let _rotateStartAngle = 0;
    let _rotateCenterX    = 0;
    let _rotateCenterY    = 0;
    let _currentRotation  = 0;   // накопичений кут обертання елемента (градуси)

    /* ── Допоміжні ── */

    function _getMainSvg() {
        const canvas = window.canvasManager?.canvases.find(
            c => c.id === window.canvasManager?.activeCanvasId
        );
        return canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;
    }

    function _svgPoint(svg, clientX, clientY) {
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    /** Повертає bbox групи у SVG-координатах */
    function _groupBBox(group) {
        try {
            const bbox = group.getBBox();
            return bbox;
        } catch (e) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }
    }

    /** Знаходить ієрархічний елемент за SVG-групою або дочірнім елементом */
    function _findItemByTarget(target) {
        // Знайти найближчий <g data-hierarchy-id>
        let el = target;
        while (el && el !== document) {
            if (el.tagName === 'g' && el.hasAttribute('data-hierarchy-id')) {
                const hid = parseInt(el.getAttribute('data-hierarchy-id'));
                return findHierarchyItemById(hid);
            }
            el = el.parentElement;
        }
        return null;
    }

    /** Малює прямокутник підсвічування навколо вибраної групи */
    function _drawHighlight(svg, group) {
        _removeHighlight(svg);
        const bbox = _groupBBox(group);
        if (!bbox || bbox.width === 0 && bbox.height === 0) return;

        const pad = 5;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', bbox.x - pad);
        rect.setAttribute('y', bbox.y - pad);
        rect.setAttribute('width',  bbox.width  + pad * 2);
        rect.setAttribute('height', bbox.height + pad * 2);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#2196F3');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '6 3');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        rect.setAttribute('data-highlight', '1');
        rect.style.pointerEvents = 'none';
        svg.appendChild(rect);
        _highlight = rect;
    }

    function _removeHighlight(svg) {
        if (_highlight && _highlight.parentNode) {
            _highlight.parentNode.removeChild(_highlight);
        }
        _highlight = null;
        if (svg) {
            svg.querySelectorAll('[data-highlight]').forEach(el => el.remove());
        }
    }

    /** Оновлює підсвічування для поточно вибраного елемента */
    function _refreshHighlight() {
        const svg = _getMainSvg();
        if (!svg) return;
        if (!_selectedId) { _removeHighlight(svg); return; }
        const item = findHierarchyItemById(_selectedId);
        if (!item || !item.svgGroup) { _removeHighlight(svg); return; }
        _drawHighlight(svg, item.svgGroup);
    }

    /** Отримує поточний transform групи або розбирає з attribute */
    function _parseGroupTransform(group) {
        const tr = group.getAttribute('transform') || '';
        const translateMatch = tr.match(/translate\(([^,)]+),([^)]+)\)/);
        const rotateMatch    = tr.match(/rotate\(([^,)]+),([^,)]+),([^)]+)\)/);
        const tx = translateMatch ? parseFloat(translateMatch[1]) : 0;
        const ty = translateMatch ? parseFloat(translateMatch[2]) : 0;
        const ra = rotateMatch    ? parseFloat(rotateMatch[1])    : 0;
        const rx = rotateMatch    ? parseFloat(rotateMatch[2])    : 0;
        const ry = rotateMatch    ? parseFloat(rotateMatch[3])    : 0;
        return { tx, ty, ra, rx, ry };
    }

    function _buildTransformString(tx, ty, ra, rx, ry) {
        let s = `translate(${tx.toFixed(2)},${ty.toFixed(2)})`;
        if (ra !== 0) s += ` rotate(${ra.toFixed(2)},${rx.toFixed(2)},${ry.toFixed(2)})`;
        return s;
    }

    /* ── Публічний API ── */

    const api = {

        /** Поточний режим */
        getMode() { return _mode; },

        /** Встановити режим ('pan' | 'select' | 'move' | 'rotate') */
        setMode(mode) {
            _mode = mode;
            const svg = _getMainSvg();
            if (svg) {
                if (mode === 'move')        svg.style.cursor = 'move';
                else if (mode === 'rotate') svg.style.cursor = 'crosshair';
                else if (mode === 'select') svg.style.cursor = 'pointer';
                else                        svg.style.cursor = 'grab';
            }
            // Оновити кнопки тулбара
            ['btn-mode-pan','btn-mode-select','btn-mode-move','btn-mode-rotate'].forEach(id => {
                const btn = document.getElementById(id);
                if (btn) btn.classList.remove('active-tool');
            });
            const activeId = mode === 'move'   ? 'btn-mode-move'
                           : mode === 'rotate' ? 'btn-mode-rotate'
                           : mode === 'select' ? 'btn-mode-select'
                           : 'btn-mode-pan';
            const activeBtn = document.getElementById(activeId);
            if (activeBtn) activeBtn.classList.add('active-tool');
        },

        /** Скасувати вибір */
        deselect() {
            _selectedId = null;
            if (window._highlightSvgItem) _highlightSvgItem(null);
            G.selectedHierarchyItem = null;
            renderHierarchy();
            if (window.renderProperties) renderProperties(null);
        },

        /** Вибрати елемент за id ієрархії */
        select(id) {
            _selectedId = id;
            // Підсвічуємо на канві (червоний контур) через hierarchy.js
            const item = findHierarchyItemById(id);
            if (window._highlightSvgItem) _highlightSvgItem(item);
            // Підсвічуємо в ієрархії (синій)
            G.selectedHierarchyItem = id;
            renderHierarchy();
            if (window.renderProperties) renderProperties(item);
        },

        /** Підключити обробники подій до SVG головного полотна */
        attachToSvg(svg) {
            svg.addEventListener('mousedown',  _onMouseDown);
            svg.addEventListener('touchstart', _onTouchStart, { passive: false });
            document.addEventListener('mousemove',  _onMouseMove);
            document.addEventListener('mouseup',    _onMouseUp);
            document.addEventListener('touchmove',  _onTouchMove, { passive: false });
            document.addEventListener('touchend',   _onTouchEnd);
            // Подвійний клік — відкрити редактор фігури
            svg.addEventListener('dblclick', _onDblClick);
        },

        /** Оновити підсвічування (після zoom тощо) */
        refreshHighlight: _refreshHighlight,

        /** Переміщення вибраної фігури на dx,dy пікселів SVG разом з усіма дочірніми */
        moveSelected(dx, dy) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            _moveItemAndChildren(item, dx, dy);
        },

        /** Обертання вибраної фігури навколо спільного центру мас разом з усіма дочірніми */
        rotateSelected(angle) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            // Обчислюємо спільний центр мас (bbox всіх груп)
            const { cx, cy } = _getGroupTreeCenter(item);
            _rotateItemAndChildren(item, angle, cx, cy);
            _currentRotation = (_currentRotation + angle);
        }
    };

    /* ── Рекурсивне переміщення/обертання дерева ── */

    /**
     * Переміщує item.svgGroup і всі дочірні svgGroup на (dx, dy).
     * Оновлює _offsetX/_offsetY та _anchorOnCanvas.
     */
    function _moveItemAndChildren(item, dx, dy) {
        if (!item || !item.svgGroup) return;
        const { tx, ty, ra, rx, ry } = _parseGroupTransform(item.svgGroup);
        item.svgGroup.setAttribute('transform', _buildTransformString(tx + dx, ty + dy, ra, rx, ry));
        // Оновлюємо збережену позицію
        if (item._anchorOnCanvas) {
            item._anchorOnCanvas = { x: item._anchorOnCanvas.x + dx, y: item._anchorOnCanvas.y + dy };
        } else {
            item._offsetX = (item._offsetX || 0) + dx;
            item._offsetY = (item._offsetY || 0) + dy;
        }
        // Рекурсивно переміщуємо дочірні елементи
        (item.children || []).forEach(child => _moveItemAndChildren(child, dx, dy));
    }

    /**
     * Обертає item.svgGroup і всі дочірні svgGroup на angle градусів навколо (cx, cy).
     * Оновлює _offsetX/_offsetY та _anchorOnCanvas з урахуванням нових позицій.
     */
    function _rotateItemAndChildren(item, angle, cx, cy) {
        if (!item || !item.svgGroup) return;
        const rad = angle * Math.PI / 180;
        const cosA = Math.cos(rad), sinA = Math.sin(rad);

        const { tx, ty, ra, rx, ry } = _parseGroupTransform(item.svgGroup);
        const newAngle = ra + angle;

        // Новий center обертання — трансформований відносно поточного translate
        // Для compose: спочатку translate(tx,ty) потім rotate навколо (cx,cy)
        item.svgGroup.setAttribute('transform', _buildTransformString(tx, ty, newAngle, cx - tx, cy - ty));

        // Оновлюємо збережену позицію: повертаємо точку (offsetX+START_X, offsetY+START_Y) навколо (cx, cy)
        if (item._anchorOnCanvas) {
            const nx = cx + (item._anchorOnCanvas.x - cx) * cosA - (item._anchorOnCanvas.y - cy) * sinA;
            const ny = cy + (item._anchorOnCanvas.x - cx) * sinA + (item._anchorOnCanvas.y - cy) * cosA;
            item._anchorOnCanvas = { x: nx, y: ny };
        } else {
            const px = (item._offsetX || 0) + (typeof START_X !== 'undefined' ? START_X : 400);
            const py = (item._offsetY || 0) + (typeof START_Y !== 'undefined' ? START_Y : 300);
            const nx = cx + (px - cx) * cosA - (py - cy) * sinA;
            const ny = cy + (px - cy) * sinA + (py - cy) * cosA;
            item._offsetX = nx - (typeof START_X !== 'undefined' ? START_X : 400);
            item._offsetY = ny - (typeof START_Y !== 'undefined' ? START_Y : 300);
        }

        // Рекурсивно обертаємо дочірні елементи навколо того ж центру
        (item.children || []).forEach(child => _rotateItemAndChildren(child, angle, cx, cy));
    }

    /**
     * Обчислює спільний центр мас (центр bbox) усіх svgGroup в дереві item.
     */
    function _getGroupTreeCenter(item) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function _collect(node) {
            if (!node || !node.svgGroup) return;
            try {
                const b = node.svgGroup.getBBox();
                if (b.width > 0 || b.height > 0) {
                    if (b.x           < minX) minX = b.x;
                    if (b.y           < minY) minY = b.y;
                    if (b.x + b.width  > maxX) maxX = b.x + b.width;
                    if (b.y + b.height > maxY) maxY = b.y + b.height;
                }
            } catch(e) {}
            (node.children || []).forEach(_collect);
        }
        _collect(item);
        if (!isFinite(minX)) {
            const b = _groupBBox(item.svgGroup);
            return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
        }
        return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }

    /* ── Обробники миші/дотику ── */

    function _clientToSvg(svg, clientX, clientY) {
        return _svgPoint(svg, clientX, clientY);
    }

    function _onMouseDown(e) {
        if (e.button !== 0) return;
        const svg = _getMainSvg(); if (!svg) return;

        const pt = _clientToSvg(svg, e.clientX, e.clientY);

        // Виділення працює в будь-якому режимі
        const item = _findItemByTarget(e.target);
        if (item) {
            api.select(item.id);
        } else if (_mode === 'select') {
            api.deselect();
        }

        if (_mode === 'move' && _selectedId) {
            _dragging    = true;
            _dragStartX  = pt.x;
            _dragStartY  = pt.y;
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        if (_mode === 'rotate' && _selectedId) {
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            const { cx, cy } = _getGroupTreeCenter(item);
            _rotateCenterX = cx;
            _rotateCenterY = cy;
            _rotateStartAngle = Math.atan2(pt.y - _rotateCenterY, pt.x - _rotateCenterX) * 180 / Math.PI;
            const { ra } = _parseGroupTransform(item.svgGroup);
            _currentRotation = ra;
            _dragging = true;
            e.stopPropagation();
            e.preventDefault();
        }
    }

    function _onDblClick(e) {
        const item = _findItemByTarget(e.target);
        if (item && window.openShapeModalForEdit) {
            e.stopPropagation();
            api.select(item.id);
            openShapeModalForEdit(item);
        }
    }

    function _onMouseMove(e) {
        if (!_dragging) return;
        const svg = _getMainSvg(); if (!svg) return;
        const pt = _clientToSvg(svg, e.clientX, e.clientY);

        if (_mode === 'move') {
            const dx = pt.x - _dragStartX;
            const dy = pt.y - _dragStartY;
            api.moveSelected(dx, dy);
            _dragStartX = pt.x;
            _dragStartY = pt.y;
        } else if (_mode === 'rotate') {
            const angle = Math.atan2(pt.y - _rotateCenterY, pt.x - _rotateCenterX) * 180 / Math.PI;
            const delta = angle - _rotateStartAngle;
            api.rotateSelected(delta);
            _rotateStartAngle = angle;
        }
    }

    function _onMouseUp() {
        _dragging = false;
    }

    /* ── Touch ── */
    function _onTouchStart(e) {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        _onMouseDown({ button: 0, clientX: t.clientX, clientY: t.clientY,
            target: e.target, stopPropagation: () => e.stopPropagation(), preventDefault: () => e.preventDefault() });
    }

    function _onTouchMove(e) {
        if (!_dragging || e.touches.length !== 1) return;
        e.preventDefault();
        const t = e.touches[0];
        _onMouseMove({ clientX: t.clientX, clientY: t.clientY });
    }

    function _onTouchEnd() { _dragging = false; }

    return api;
})();
