/**
 * shape-transform.js — Переміщення та обертання фігур на головному полотні.
 * Залежності: constants.js, state.js, g.js, hierarchy.js, shape-transfer.js
 *
 * Стратегія transform:
 *   Кожна SVG-група має атрибут transform="translate(tx,ty) rotate(ra,cx0,cy0)"
 *   де cx0,cy0 — ФІКСОВАНИЙ центр обертання (bbox при першому rotate, не змінюється).
 *   tx,ty — абсолютне накопичене зміщення від початкового положення.
 *   ra    — накопичений кут обертання.
 *
 *   При переміщенні: змінюється тільки tx,ty. cx0,cy0 і ra не чіпаємо.
 *   При обертанні:   змінюється тільки ra. tx,ty і cx0,cy0 не чіпаємо.
 *
 *   _offsetX/_offsetY в ієрархічних даних НЕ змінюємо під час drag.
 *   Точки виділення рахуються через CTM матрицю групи.
 */

window.shapeTransform = (function () {

    let _mode       = 'pan';
    let _selectedId = null;

    let _dragging         = false;
    /* move: */
    let _anchorDx         = 0;   // cursor.x - originX групи при mousedown
    let _anchorDy         = 0;
    /* rotate: */
    let _rotateStartAngle = 0;
    let _rotateCenterX    = 0;   // фіксований центр обертання (SVG-координати)
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

    /**
     * Читає tx,ty,ra,cx0,cy0 з атрибута transform групи.
     * Формат: "translate(tx,ty) rotate(ra,cx0,cy0)"
     */
    function _parseTransform(group) {
        const tr  = group.getAttribute('transform') || '';
        const tm  = tr.match(/translate\(([^,)]+),([^)]+)\)/);
        const rm  = tr.match(/rotate\(([^,)]+),([^,)]+),([^)]+)\)/);
        return {
            tx:  tm ? parseFloat(tm[1]) : 0,
            ty:  tm ? parseFloat(tm[2]) : 0,
            ra:  rm ? parseFloat(rm[1]) : 0,
            cx0: rm ? parseFloat(rm[2]) : null,  // null = ще не було rotate
            cy0: rm ? parseFloat(rm[3]) : null,
        };
    }

    /**
     * Записує transform на групу.
     * cx0/cy0 можуть бути null якщо ra===0 — тоді rotate не пишемо.
     */
    function _setTransform(group, tx, ty, ra, cx0, cy0) {
        let s = `translate(${tx.toFixed(3)},${ty.toFixed(3)})`;
        if (ra !== 0 && cx0 !== null && cy0 !== null) {
            s += ` rotate(${ra.toFixed(4)},${cx0.toFixed(3)},${cy0.toFixed(3)})`;
        }
        group.setAttribute('transform', s);
    }

    /**
     * Повертає SVG-позицію точки (0,0) локальної системи групи через CTM.
     * m.e, m.f — це реальні SVG xy з урахуванням translate + rotate.
     */
    function _groupOriginInSvg(svg, group) {
        try {
            const svgCTM = svg.getScreenCTM();
            const grpCTM = group.getScreenCTM();
            if (svgCTM && grpCTM) {
                const m = svgCTM.inverse().multiply(grpCTM);
                return { x: m.e, y: m.f };
            }
        } catch(e) {}
        const { tx, ty } = _parseTransform(group);
        return { x: tx, y: ty };
    }

    /** Знаходить елемент ієрархії (фігуру або вікно) за кліком */
    function _findItemByTarget(target) {
        let el = target;
        while (el && el !== document) {
            if (el.tagName === 'g' && el.hasAttribute('data-hierarchy-id')) {
                const hid  = parseInt(el.getAttribute('data-hierarchy-id'));
                const item = findHierarchyItemById(hid);
                if (item) return item;
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

    /**
     * Обчислює спільний центр мас (bbox) групи + всіх окремих дочірніх груп.
     * Береться ДО будь-яких трансформацій, тому використовуємо getBBox()
     * який повертає bbox в локальній системі координат БАТЬКА (вже з трансформацією).
     */
    function _computeTreeCenter(item) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        function _collect(node) {
            if (!node || !node.svgGroup) return;
            try {
                // getBBox() повертає bbox в системі координат SVG (після всіх трансформацій)
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
     * Переміщує групу item на (dx,dy) — змінює ТІЛЬКИ tx,ty.
     * ra, cx0, cy0 не чіпаємо — центр обертання залишається фіксованим.
     * element-діти рухаються автоматично (всередині батьківської групи).
     * room/building/contour діти рухаються рекурсивно.
     */
    function _moveTree(item, dx, dy) {
        if (!item || !item.svgGroup) return;
        const { tx, ty, ra, cx0, cy0 } = _parseTransform(item.svgGroup);
        _setTransform(item.svgGroup, tx + dx, ty + dy, ra, cx0, cy0);
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _moveTree(ch, dx, dy);
        });
    }

    /**
     * Обертає групу item на angle градусів навколо ФІКСОВАНОГО центру (cx0,cy0).
     * При першому rotate — записуємо cx0,cy0 з переданого центру.
     * При наступних — cx0,cy0 вже зафіксовані, змінюємо тільки ra.
     * Центр обертання (cx0,cy0) — в локальній системі групи ПІСЛЯ translate.
     * Тобто в SVG-координатах: svgCenter = (cx0 + tx, cy0 + ty).
     * Передаємо svgCx,svgCy — SVG-координати центру.
     */
    function _rotateTree(item, angle, svgCx, svgCy) {
        if (!item || !item.svgGroup) return;
        const { tx, ty, ra, cx0, cy0 } = _parseTransform(item.svgGroup);
        // Центр у локальній системі групи після translate
        const localCx = (cx0 !== null) ? cx0 : (svgCx - tx);
        const localCy = (cy0 !== null) ? cy0 : (svgCy - ty);
        _setTransform(item.svgGroup, tx, ty, ra + angle, localCx, localCy);
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _rotateTree(ch, angle, svgCx, svgCy);
        });
    }

    function _refreshPoints(item) {
        if (window._highlightSvgItem) _highlightSvgItem(item);
        _updateRoomLabelsTree(item);
        // Оновлюємо конструктиви і вікна прив'язані до цієї фігури (і дочірніх)
        if (typeof window._updateConstructsForItem === 'function') {
            (function walk(it) {
                if (!it) return;
                if (it.type === 'room' || it.type === 'building' || it.type === 'contour') {
                    window._updateConstructsForItem(it);
                }
                (it.children || []).forEach(function(ch) {
                    if (ch.type !== 'element') walk(ch);
                });
            }(item));
        }
    }

    /**
     * Рекурсивно оновлює counter-rotate на всіх [data-room-label] в дереві.
     */
    function _updateRoomLabelsTree(item) {
        if (!item || !item.svgGroup) return;
        _applyRoomLabelCounterRotate(item);
        (item.children || []).forEach(ch => {
            if (ch.type !== 'element') _updateRoomLabelsTree(ch);
        });
    }

    /**
     * Виставляє counter-rotate на [data-room-label] всередині svgGroup:
     * підпис завжди залишається горизонтальним.
     * Для leader — оновлює центр ніжки через _updateCenter.
     */
    function _applyRoomLabelCounterRotate(item) {
        if (!item || !item.svgGroup) return;
        const { ra, tx, ty } = _parseTransform(item.svgGroup);

        const labelEl = item.svgGroup.querySelector('[data-room-label]');
        if (!labelEl) return;

        // Центр мас фігури в локальній системі групи (без transform)
        let lcx = 0, lcy = 0;
        if (item.shapePoints && item.shapePoints.length > 0) {
            const ox = item._offsetX || 0;
            const oy = item._offsetY || 0;
            const valid = item.shapePoints.filter(p => !p.isTemp);
            if (valid.length > 0) {
                valid.forEach(p => { lcx += p.x + ox; lcy += p.y + oy; });
                lcx /= valid.length;
                lcy /= valid.length;
            }
        }

        if (ra === 0) {
            // Немає обертання — знімаємо counter-rotate
            labelEl.removeAttribute('transform');
            // Оновлюємо центр якщо переміщували
            if (typeof labelEl._updateCenter === 'function') {
                labelEl._updateCenter(lcx, lcy);
            }
            return;
        }

        // Counter-rotate навколо lcx,lcy в локальній системі групи
        labelEl.setAttribute('transform',
            `rotate(${(-ra).toFixed(4)},${lcx.toFixed(3)},${lcy.toFixed(3)})`);

        // Для leader — оновлюємо центр ніжки (він має тримати lcx,lcy)
        if (typeof labelEl._updateCenter === 'function') {
            labelEl._updateCenter(lcx, lcy);
        }
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
                // Anchor = зміщення курсора відносно SVG-позиції origin групи.
                // Через CTM — враховує translate + rotate.
                const origin = _groupOriginInSvg(svg, selItem.svgGroup);
                _anchorDx = pt.x - origin.x;
                _anchorDy = pt.y - origin.y;
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
            // Читаємо поточний tx,ty з атрибута (не CTM) — щоб уникнути дрижання
            // від браузерних затримок оновлення CTM.
            // Цільовий origin = cursor - anchor
            const targetX = pt.x - _anchorDx;
            const targetY = pt.y - _anchorDy;
            // Поточний origin через CTM (враховує rotate)
            const origin = _groupOriginInSvg(svg, item.svgGroup);
            const dx = targetX - origin.x;
            const dy = targetY - origin.y;
            if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
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

    function _onMouseUp() { 
        if (_dragging && _mode === 'move' && _selectedId) {
            _snapRoomToConstruct();
        }
        _dragging = false; 
    }

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

    function _onTouchEnd() { 
        if (_dragging && _mode === 'move' && _selectedId) {
            _snapRoomToConstruct();
        }
        _dragging = false; 
    }

    /**
     * Після відпускання миші/дотику у режимі move:
     * якщо будь-яка точка кімнати знаходиться ближче ніж SNAP_DIST до точки конструктиву —
     * зміщуємо кімнату так, щоб ці точки збіглись.
     */
    const SNAP_DIST = 20; // SVG-пікселів
    function _snapRoomToConstruct() {
        if (!_selectedId) return;
        const item = findHierarchyItemById(_selectedId);
        if (!item || !item.svgGroup || !item.shapePoints) return;
        if (typeof _getConstructSnapPoints !== 'function') return;

        const snapPts = _getConstructSnapPoints();
        if (!snapPts || snapPts.length === 0) return;

        const svg = _getMainSvg();
        if (!svg) return;

        // Отримуємо CTM групи кімнати
        let groupCTM = null;
        try {
            const svgCTM = svg.getScreenCTM();
            const grpCTM = item.svgGroup.getScreenCTM();
            if (svgCTM && grpCTM) groupCTM = svgCTM.inverse().multiply(grpCTM);
        } catch(e) {}

        const offsetX = item._offsetX || 0;
        const offsetY = item._offsetY || 0;

        let bestDist = SNAP_DIST;
        let bestRoomPt = null;
        let bestSnapPt = null;

        // Перебираємо всі точки кімнати
        item.shapePoints.forEach(function(pt) {
            let svgX, svgY;
            if (groupCTM) {
                const p = svg.createSVGPoint();
                p.x = pt.x + offsetX;
                p.y = pt.y + offsetY;
                const r = p.matrixTransform(groupCTM);
                svgX = r.x; svgY = r.y;
            } else {
                const { tx, ty } = _parseTransform(item.svgGroup);
                svgX = pt.x + offsetX + tx;
                svgY = pt.y + offsetY + ty;
            }

            snapPts.forEach(function(sp) {
                const d = Math.sqrt((svgX - sp.x) ** 2 + (svgY - sp.y) ** 2);
                if (d < bestDist) {
                    bestDist = d;
                    bestRoomPt = { svgX, svgY };
                    bestSnapPt = sp;
                }
            });
        });

        if (bestRoomPt && bestSnapPt) {
            const dx = bestSnapPt.x - bestRoomPt.svgX;
            const dy = bestSnapPt.y - bestRoomPt.svgY;
            _moveTree(item, dx, dy);
            _refreshPoints(item);
        }
    }

    return api;
})();
