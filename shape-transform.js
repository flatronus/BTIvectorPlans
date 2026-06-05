/**
 * shape-transform.js — Переміщення та обертання фігур на головному полотні.
 * Залежності: constants.js, state.js, g.js, hierarchy.js, shape-transfer.js
 *
 * Стратегія transform:
 *   Кожна SVG-група накопичує transform="translate(tx,ty) rotate(ra,rcx,rcy)".
 *   _offsetX/_offsetY — початковий offset при малюванні, НЕ змінюється при drag.
 *   Translate і rotate накопичуються в атрибуті transform групи.
 *   Точки виділення рахуються через CTM матрицю групи — враховує всі трансформації.
 */

window.shapeTransform = (function () {

    let _mode       = 'pan';
    let _selectedId = null;

    let _dragging         = false;
    let _dragStartX       = 0;
    let _dragStartY       = 0;
    let _anchorDx         = 0;   // зміщення курсора відносно поточного translate.x групи при mousedown
    let _anchorDy         = 0;   // зміщення курсора відносно поточного translate.y групи при mousedown
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

    /** Знаходить кореневу фігуру (room/building/contour) за кліком */
    function _findItemByTarget(target) {
        let el = target;
        while (el && el !== document) {
            if (el.tagName === 'g' && el.hasAttribute('data-hierarchy-id')) {
                const hid  = parseInt(el.getAttribute('data-hierarchy-id'));
                const item = findHierarchyItemById(hid);
                if (item) {
                    if (item.type === 'element') {
                        return _findParentRoomOf(item.id) || item;
                    }
                    return item;
                }
            }
            el = el.parentElement;
        }
        return null;
    }

    function _findParentRoomOf(childId, items, parent) {
        items = items || G.hierarchyData;
        for (const it of items) {
            if (it.id === childId) return parent || null;
            const found = _findParentRoomOf(childId, it.children || [], it);
            if (found !== undefined) return found;
        }
        return undefined;
    }

    function _parseTransform(group) {
        const tr  = group.getAttribute('transform') || '';
        const tm  = tr.match(/translate\(([^,)]+),([^)]+)\)/);
        const rm  = tr.match(/rotate\(([^,)]+),([^,)]+),([^)]+)\)/);
        return {
            tx:  tm ? parseFloat(tm[1]) : 0,
            ty:  tm ? parseFloat(tm[2]) : 0,
            ra:  rm ? parseFloat(rm[1]) : 0,
            rcx: rm ? parseFloat(rm[2]) : 0,
            rcy: rm ? parseFloat(rm[3]) : 0,
        };
    }

    function _setTransform(group, tx, ty, ra, rcx, rcy) {
        let s = `translate(${tx.toFixed(3)},${ty.toFixed(3)})`;
        if (ra !== 0) s += ` rotate(${ra.toFixed(4)},${rcx.toFixed(3)},${rcy.toFixed(3)})`;
        group.setAttribute('transform', s);
    }

    /**
     * Обчислює спільний центр мас (bbox) групи + всіх окремих дочірніх груп
     * (element-и всередині батьківської групи не рахуємо окремо).
     */
    function _computeTreeCenter(item) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function _collect(node) {
            if (!node || !node.svgGroup) return;
            try {
                const b = node.svgGroup.getBBox();
                if (b.width > 0 || b.height > 0) {
                    if (b.x            < minX) minX = b.x;
                    if (b.y            < minY) minY = b.y;
                    if (b.x + b.width  > maxX) maxX = b.x + b.width;
                    if (b.y + b.height > maxY) maxY = b.y + b.height;
                }
            } catch(e) {}
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
     * Переміщує SVG-групу item і всіх окремих дочірніх (room/building/contour) на (dx,dy).
     * element-и всередині батьківської групи рухаються автоматично через SVG.
     * _offsetX/_offsetY НЕ змінюємо — translate накопичується в атрибуті transform.
     */
    function _moveTree(item, dx, dy) {
        if (!item || !item.svgGroup) return;
        const { tx, ty, ra, rcx, rcy } = _parseTransform(item.svgGroup);
        _setTransform(item.svgGroup, tx + dx, ty + dy, ra,
            ra !== 0 ? rcx + dx : rcx,
            ra !== 0 ? rcy + dy : rcy);
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _moveTree(ch, dx, dy);
        });
    }

    /**
     * Обертає SVG-групу item і всіх окремих дочірніх навколо (cx,cy) на angle градусів.
     */
    function _rotateTree(item, angle, cx, cy) {
        if (!item || !item.svgGroup) return;
        const { tx, ty, ra } = _parseTransform(item.svgGroup);
        _setTransform(item.svgGroup, tx, ty, ra + angle, cx - tx, cy - ty);
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _rotateTree(ch, angle, cx, cy);
        });
    }

    /**
     * Перемальовує точки виділення через _highlightSvgItem.
     * CTM матриця групи автоматично враховує translate + rotate.
     */
    function _refreshPoints(item) {
        if (window._highlightSvgItem) _highlightSvgItem(item);
    }

    /* ── Публічний API ── */

    const api = {

        getMode() { return _mode; },

        setMode(mode) {
            _mode = mode;
            const svg = _getMainSvg();
            if (svg) {
                if      (mode === 'move')   svg.style.cursor = 'move';
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

        moveSelected(dx, dy) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            _moveTree(item, dx, dy);
            _refreshPoints(item);
        },

        rotateSelected(angle) {
            if (!_selectedId) return;
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            _rotateTree(item, angle, _rotateCenterX, _rotateCenterY);
            _refreshPoints(item);
        }
    };

    /* ── Обробники миші/дотику ── */

    function _onMouseDown(e) {
        if (e.button !== 0) return;
        const svg = _getMainSvg(); if (!svg) return;
        const pt = _svgPoint(svg, e.clientX, e.clientY);

        const item = _findItemByTarget(e.target);
        if (item) {
            api.select(item.id);
        } else if (_mode === 'select') {
            api.deselect();
        }

        if (_mode === 'move' && _selectedId) {
            const selItem = findHierarchyItemById(_selectedId);
            if (selItem && selItem.svgGroup) {
                // Отримуємо фактичну SVG-позицію початку координат групи через CTM.
                // Це правильно навіть після rotate, бо CTM враховує всі трансформації.
                const svg = _getMainSvg();
                try {
                    const svgCTM = svg.getScreenCTM();
                    const grpCTM = selItem.svgGroup.getScreenCTM();
                    if (svgCTM && grpCTM) {
                        const m = svgCTM.inverse().multiply(grpCTM);
                        // m.e, m.f — це SVG-координати точки (0,0) локальної системи групи
                        _anchorDx = pt.x - m.e;
                        _anchorDy = pt.y - m.f;
                    } else {
                        const { tx, ty } = _parseTransform(selItem.svgGroup);
                        _anchorDx = pt.x - tx;
                        _anchorDy = pt.y - ty;
                    }
                } catch(e) {
                    const { tx, ty } = _parseTransform(selItem.svgGroup);
                    _anchorDx = pt.x - tx;
                    _anchorDy = pt.y - ty;
                }
            }
            _dragging = true;
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        if (_mode === 'rotate' && _selectedId) {
            const selItem = findHierarchyItemById(_selectedId);
            if (!selItem || !selItem.svgGroup) return;
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
            const item = findHierarchyItemById(_selectedId);
            if (!item || !item.svgGroup) return;
            // Фактична SVG-позиція (0,0) локальної системи групи через CTM
            let originX = 0, originY = 0;
            try {
                const svgCTM = svg.getScreenCTM();
                const grpCTM = item.svgGroup.getScreenCTM();
                if (svgCTM && grpCTM) {
                    const m = svgCTM.inverse().multiply(grpCTM);
                    originX = m.e;
                    originY = m.f;
                } else {
                    const { tx, ty } = _parseTransform(item.svgGroup);
                    originX = tx; originY = ty;
                }
            } catch(e) {
                const { tx, ty } = _parseTransform(item.svgGroup);
                originX = tx; originY = ty;
            }
            // Нова позиція origin = cursor - anchor
            const targetX = pt.x - _anchorDx;
            const targetY = pt.y - _anchorDy;
            const dx = targetX - originX;
            const dy = targetY - originY;
            if (dx !== 0 || dy !== 0) {
                _moveTree(item, dx, dy);
                _refreshPoints(item);
            }
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
            target: e.target,
            stopPropagation: () => e.stopPropagation(),
            preventDefault:  () => e.preventDefault() });
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
