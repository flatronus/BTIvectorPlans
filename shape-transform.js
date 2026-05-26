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
            _refreshHighlight();
            renderHierarchy();
        },

        /** Вибрати елемент за id ієрархії */
        select(id) {
            _selectedId = id;
            _refreshHighlight();
            // Підсвітити в ієрархії
            G.selectedHierarchyItem = id;
            renderHierarchy();
        },

        /** Підключити обробники подій до SVG головного полотна */
        attachToSvg(svg) {
            svg.addEventListener('mousedown',  _onMouseDown);
            svg.addEventListener('touchstart', _onTouchStart, { passive: false });
            document.addEventListener('mousemove',  _onMouseMove);
            document.addEventListener('mouseup',    _onMouseUp);
            document.addEventListener('touchmove',  _onTouchMove, { passive: false });
            document.addEventListener('touchend',   _onTouchEnd);
        },

        /** Оновити підсвічування (після zoom тощо) */
        refreshHighlight: _refreshHighlight,

        /** Переміщення вибраної фігури на dx,dy пікселів SVG */
        moveSelected(dx, dy) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            const { tx, ty, ra, rx, ry } = _parseGroupTransform(item.svgGroup);
            const newTx = tx + dx, newTy = ty + dy;
            item.svgGroup.setAttribute('transform', _buildTransformString(newTx, newTy, ra, rx, ry));
            // Зберігаємо зміщення
            item._offsetX = (item._offsetX || 0) + dx;
            item._offsetY = (item._offsetY || 0) + dy;
            _refreshHighlight();
        },

        /** Обертання вибраної фігури на кут (градуси) навколо її центру */
        rotateSelected(angle) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            const bbox = _groupBBox(item.svgGroup);
            const cx = bbox.x + bbox.width  / 2;
            const cy = bbox.y + bbox.height / 2;
            const { tx, ty } = _parseGroupTransform(item.svgGroup);
            const newAngle = (_currentRotation + angle);
            item.svgGroup.setAttribute('transform', _buildTransformString(tx, ty, newAngle, cx, cy));
            item._rotation = newAngle;
            _refreshHighlight();
        }
    };

    /* ── Обробники миші/дотику ── */

    function _clientToSvg(svg, clientX, clientY) {
        return _svgPoint(svg, clientX, clientY);
    }

    function _onMouseDown(e) {
        if (e.button !== 0) return;
        const svg = _getMainSvg(); if (!svg) return;

        const pt = _clientToSvg(svg, e.clientX, e.clientY);

        if (_mode === 'select') {
            const item = _findItemByTarget(e.target);
            if (item) {
                api.select(item.id);
                e.stopPropagation();
            } else {
                api.deselect();
            }
            return;
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
            const bbox = _groupBBox(item.svgGroup);
            _rotateCenterX = bbox.x + bbox.width  / 2;
            _rotateCenterY = bbox.y + bbox.height / 2;
            _rotateStartAngle = Math.atan2(pt.y - _rotateCenterY, pt.x - _rotateCenterX) * 180 / Math.PI;
            const { ra } = _parseGroupTransform(item.svgGroup);
            _currentRotation = ra;
            _dragging = true;
            e.stopPropagation();
            e.preventDefault();
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
            _currentRotation  = _currentRotation + delta;
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
