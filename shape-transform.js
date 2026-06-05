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

    let _dragging   = false;
    let _dragStartX = 0;
    let _dragStartY = 0;
    let _rotateStartAngle = 0;
    let _rotateCenterX    = 0;
    let _rotateCenterY    = 0;

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

    function _groupBBox(group) {
        try { return group.getBBox(); }
        catch (e) { return { x: 0, y: 0, width: 0, height: 0 }; }
    }

    /** Знаходить ієрархічний елемент за SVG-групою або дочірнім елементом.
     *  Повертає КОРЕНЕВУ фігуру (room/building/contour), не element. */
    function _findItemByTarget(target) {
        let el = target;
        while (el && el !== document) {
            if (el.tagName === 'g' && el.hasAttribute('data-hierarchy-id')) {
                const hid  = parseInt(el.getAttribute('data-hierarchy-id'));
                const item = findHierarchyItemById(hid);
                if (item) {
                    // Якщо це element (вікно) — повертаємо батьківську фігуру
                    if (item.type === 'element') {
                        const parent = _findParentRoomOf(item.id);
                        return parent || item;
                    }
                    return item;
                }
            }
            el = el.parentElement;
        }
        return null;
    }

    /** Знаходить батьківський room/building для елемента */
    function _findParentRoomOf(childId, items, parent) {
        items = items || G.hierarchyData;
        for (const it of items) {
            if (it.id === childId) return parent || null;
            const found = _findParentRoomOf(childId, it.children || [], it);
            if (found !== undefined) return found;
        }
        return undefined;
    }

    /** Парсить translate з атрибута transform */
    function _getTranslate(group) {
        const tr = group.getAttribute('transform') || '';
        const m  = tr.match(/translate\(([^,)]+),([^)]+)\)/);
        return m ? { tx: parseFloat(m[1]), ty: parseFloat(m[2]) } : { tx: 0, ty: 0 };
    }

    /** Парсить rotate(angle,cx,cy) з атрибута transform */
    function _getRotate(group) {
        const tr = group.getAttribute('transform') || '';
        const m  = tr.match(/rotate\(([^,)]+),([^,)]+),([^)]+)\)/);
        return m ? { ra: parseFloat(m[1]), rx: parseFloat(m[2]), ry: parseFloat(m[3]) } : { ra: 0, rx: 0, ry: 0 };
    }

    /**
     * Застосовує translate(tx,ty) rotate(ra,rx,ry) до групи.
     * translate йде першим — це найпростіша форма без compose-помилок.
     */
    function _applyTransform(group, tx, ty, ra, rx, ry) {
        let s = `translate(${tx.toFixed(3)},${ty.toFixed(3)})`;
        if (ra !== 0) s += ` rotate(${ra.toFixed(4)},${rx.toFixed(3)},${ry.toFixed(3)})`;
        group.setAttribute('transform', s);
    }

    /**
     * Обчислює спільний центр мас (bbox) батьківської групи + всіх окремих
     * дочірніх svgGroup що є room/contour/building (не element — вони всередині батька).
     */
    function _computeTreeCenter(item) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        function _expand(b) {
            if (!b || (b.width === 0 && b.height === 0)) return;
            if (b.x            < minX) minX = b.x;
            if (b.y            < minY) minY = b.y;
            if (b.x + b.width  > maxX) maxX = b.x + b.width;
            if (b.y + b.height > maxY) maxY = b.y + b.height;
        }

        function _collect(node) {
            if (!node || !node.svgGroup) return;
            _expand(_groupBBox(node.svgGroup));
            // Заходимо тільки в дочірні що є окремими групами (room/building/contour)
            (node.children || []).forEach(ch => {
                if (ch.type !== 'element') _collect(ch);
            });
        }

        _collect(item);
        if (!isFinite(minX)) {
            const b = _groupBBox(item.svgGroup);
            return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
        }
        return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }

    /**
     * Переміщує SVG-групу item на (dx, dy) і рекурсивно робить те саме
     * для всіх дочірніх room/building/contour (element-и всередині батька рухаються автоматично).
     * Оновлює _offsetX/_offsetY та _anchorOnCanvas в ієрархічних даних.
     */
    function _moveTree(item, dx, dy) {
        if (!item || !item.svgGroup) return;

        // Читаємо поточний translate і rotate окремо
        const { tx, ty } = _getTranslate(item.svgGroup);
        const { ra, rx, ry } = _getRotate(item.svgGroup);

        // Переміщуємо тільки translate; rotate (center) теж зсуваємо
        const newRx = ra !== 0 ? rx + dx : rx;
        const newRy = ra !== 0 ? ry + dy : ry;
        _applyTransform(item.svgGroup, tx + dx, ty + dy, ra, newRx, newRy);

        // Оновлюємо збережену позицію в ієрархії
        if (item._anchorOnCanvas) {
            item._anchorOnCanvas = { x: item._anchorOnCanvas.x + dx, y: item._anchorOnCanvas.y + dy };
        } else {
            item._offsetX = (item._offsetX || 0) + dx;
            item._offsetY = (item._offsetY || 0) + dy;
        }

        // Рекурсивно рухаємо лише окремі групи (не element — вони вже всередині батьківської <g>)
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _moveTree(ch, dx, dy);
        });
    }

    /**
     * Обертає SVG-групу item навколо (cx, cy) на angle градусів і рекурсивно
     * робить те саме для дочірніх room/building/contour.
     * Оновлює _offsetX/_offsetY та _anchorOnCanvas.
     */
    function _rotateTree(item, angle, cx, cy) {
        if (!item || !item.svgGroup) return;

        const rad  = angle * Math.PI / 180;
        const cosA = Math.cos(rad), sinA = Math.sin(rad);

        const { tx, ty } = _getTranslate(item.svgGroup);
        const { ra }     = _getRotate(item.svgGroup);

        const newAngle = ra + angle;

        // rotate(angle, cx, cy) в системі ПІСЛЯ translate(tx,ty) —
        // точка (cx,cy) є в глобальних SVG-координатах, тому для rotate треба:
        // rotate center у локальній системі після translate = (cx-tx, cy-ty)
        _applyTransform(item.svgGroup, tx, ty, newAngle, cx - tx, cy - ty);

        // Оновлюємо збережену позицію — обертаємо відповідну опорну точку навколо (cx,cy)
        if (item._anchorOnCanvas) {
            const ox = item._anchorOnCanvas.x - cx;
            const oy = item._anchorOnCanvas.y - cy;
            item._anchorOnCanvas = {
                x: cx + ox * cosA - oy * sinA,
                y: cy + ox * sinA + oy * cosA
            };
        } else {
            // Опорна точка — там де фактично лежить START_X/Y після offsetX/Y
            const px = (item._offsetX || 0) + START_X;
            const py = (item._offsetY || 0) + START_Y;
            const ox = px - cx, oy = py - cy;
            const nx = cx + ox * cosA - oy * sinA;
            const ny = cy + ox * sinA + oy * cosA;
            item._offsetX = nx - START_X;
            item._offsetY = ny - START_Y;
        }

        // Рекурсивно обертаємо лише окремі групи
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _rotateTree(ch, angle, cx, cy);
        });
    }

    /** Перемальовує точки виділення після переміщення/обертання */
    function _refreshPointLabels(item) {
        if (window._highlightSvgItem) {
            _highlightSvgItem(item);
        }
    }

    /* ── Публічний API ── */

    const api = {

        getMode() { return _mode; },

        setMode(mode) {
            _mode = mode;
            const svg = _getMainSvg();
            if (svg) {
                if (mode === 'move')        svg.style.cursor = 'move';
                else if (mode === 'rotate') svg.style.cursor = 'crosshair';
                else if (mode === 'select') svg.style.cursor = 'pointer';
                else                        svg.style.cursor = 'grab';
            }
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

        deselect() {
            _selectedId = null;
            if (window._highlightSvgItem) _highlightSvgItem(null);
            G.selectedHierarchyItem = null;
            renderHierarchy();
            if (window.renderProperties) renderProperties(null);
        },

        select(id) {
            _selectedId = id;
            const item = findHierarchyItemById(id);
            if (window._highlightSvgItem) _highlightSvgItem(item);
            G.selectedHierarchyItem = id;
            renderHierarchy();
            if (window.renderProperties) renderProperties(item);
        },

        attachToSvg(svg) {
            svg.addEventListener('mousedown',  _onMouseDown);
            svg.addEventListener('touchstart', _onTouchStart, { passive: false });
            document.addEventListener('mousemove',  _onMouseMove);
            document.addEventListener('mouseup',    _onMouseUp);
            document.addEventListener('touchmove',  _onTouchMove, { passive: false });
            document.addEventListener('touchend',   _onTouchEnd);
            svg.addEventListener('dblclick', _onDblClick);
        },

        /** Переміщення вибраної фігури на dx,dy разом з усіма дочірніми */
        moveSelected(dx, dy) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            _moveTree(item, dx, dy);
            // Перемальовуємо точки виділення щоб іти за фігурою
            _refreshPointLabels(item);
        },

        /** Обертання вибраної фігури навколо спільного центру мас разом з усіма дочірніми */
        rotateSelected(angle) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            _rotateTree(item, angle, _rotateCenterX, _rotateCenterY);
            _refreshPointLabels(item);
        }
    };

    /* ── Обробники миші/дотику ── */

    function _onMouseDown(e) {
        if (e.button !== 0) return;
        const svg = _getMainSvg(); if (!svg) return;

        const pt = _svgPoint(svg, e.clientX, e.clientY);

        // Виділення працює в будь-якому режимі
        const item = _findItemByTarget(e.target);
        if (item) {
            api.select(item.id);
        } else if (_mode === 'select') {
            api.deselect();
        }

        if (_mode === 'move' && _selectedId) {
            _dragging   = true;
            _dragStartX = pt.x;
            _dragStartY = pt.y;
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        if (_mode === 'rotate' && _selectedId) {
            const selItem = findHierarchyItemById(_selectedId);
            if (!selItem || !selItem.svgGroup) return;
            // Центр обертання — спільний центр мас дерева фігур
            const { cx, cy } = _computeTreeCenter(selItem);
            _rotateCenterX    = cx;
            _rotateCenterY    = cy;
            _rotateStartAngle = Math.atan2(pt.y - cy, pt.x - cx) * 180 / Math.PI;
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
        const pt  = _svgPoint(svg, e.clientX, e.clientY);

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

    function _onMouseUp() { _dragging = false; }

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
