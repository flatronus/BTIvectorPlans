/**
 * constructs.js — Конструктиви: перетягування полосок на канву.
 * Залежності: constants.js, g.js, canvas-manager.js, toast.js
 */

/** Товщина полоски конструктиву в метрах */
const CONSTRUCT_THICKNESS_M = 0.2;

/** Ініціалізує панель Конструктиви */
window.initConstructsPanel = function () {
    const body = document.getElementById('constructs-body');
    if (!body) return;
    body.innerHTML = '';

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:#6b7280;padding:6px 4px 8px;';
    hint.textContent = 'Перетягніть полоску на лінію фігури — вона автоматично вирівняється між двома точками.';
    body.appendChild(hint);

    // Полоска конструктиву 0.20 м
    const strip = _makeConstructStrip('Перекриття 0.20 м', CONSTRUCT_THICKNESS_M);
    body.appendChild(strip);
};

/** Будує drag-джерело полоски */
function _makeConstructStrip(label, thicknessM) {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;gap:4px;',
        'padding:8px 4px;margin-bottom:6px;',
        'background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;',
        'cursor:grab;user-select:none;',
    ].join('');
    wrap.title = 'Перетягніть на лінію фігури';

    // Маленька візуалізація полоски
    const preview = document.createElement('div');
    preview.style.cssText = [
        'width:80px;height:10px;',
        'background:rgba(125,211,252,0.55);',
        'border:1px solid #38bdf8;border-radius:2px;',
    ].join('');
    wrap.appendChild(preview);

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:#0369a1;font-weight:600;';
    lbl.textContent = label;
    wrap.appendChild(lbl);

    // Drag (миша + дотик)
    wrap.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        _startConstructDrag(e.clientX, e.clientY, thicknessM);
    });

    wrap.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        _startConstructDrag(e.touches[0].clientX, e.touches[0].clientY, thicknessM);
    }, { passive: false });

    return wrap;
}

/* ── Drag-стан ── */
let _cDragging    = false;
let _cThicknessM  = CONSTRUCT_THICKNESS_M;
let _cGhost       = null;   // SVG <rect> або <line> — візуальний привид
let _cTargetLine  = null;   // { x1,y1,x2,y2, lineData, item } — знайдена лінія
let _cActiveSvg   = null;

function _startConstructDrag(clientX, clientY, thicknessM) {
    _cDragging   = true;
    _cThicknessM = thicknessM;
    _cTargetLine = null;

    // Знаходимо активне SVG полотно
    const canvas  = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
    _cActiveSvg   = canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;

    // Створюємо привид (overlay div — не SVG, щоб слідкувати за курсором)
    _cGhost = document.createElement('div');
    _cGhost.style.cssText = [
        'position:fixed;pointer-events:none;z-index:9000;',
        'width:60px;height:8px;',
        'background:rgba(125,211,252,0.6);',
        'border:1px solid #38bdf8;border-radius:2px;',
        'transform:translate(-50%,-50%);',
    ].join('');
    document.body.appendChild(_cGhost);

    _moveGhost(clientX, clientY);

    document.addEventListener('mousemove', _onConstructMouseMove);
    document.addEventListener('mouseup',   _onConstructMouseUp);
    document.addEventListener('touchmove', _onConstructTouchMove, { passive: false });
    document.addEventListener('touchend',  _onConstructTouchEnd);
}

function _moveGhost(clientX, clientY) {
    if (!_cGhost) return;
    _cGhost.style.left = clientX + 'px';
    _cGhost.style.top  = clientY + 'px';
}

function _onConstructMouseMove(e) {
    if (!_cDragging) return;
    _moveGhost(e.clientX, e.clientY);
    _detectSnapLine(e.clientX, e.clientY);
}

function _onConstructTouchMove(e) {
    if (!_cDragging || e.touches.length !== 1) return;
    e.preventDefault();
    _moveGhost(e.touches[0].clientX, e.touches[0].clientY);
    _detectSnapLine(e.touches[0].clientX, e.touches[0].clientY);
}

function _onConstructMouseUp(e) {
    _finishConstructDrop(e.clientX, e.clientY);
}

function _onConstructTouchEnd(e) {
    const t = e.changedTouches[0];
    _finishConstructDrop(t ? t.clientX : 0, t ? t.clientY : 0);
}

/**
 * Конвертує координати екрану в SVG-координати активного полотна
 */
function _screenToSvg(clientX, clientY) {
    if (!_cActiveSvg) return null;
    const pt = _cActiveSvg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    try { return pt.matrixTransform(_cActiveSvg.getScreenCTM().inverse()); }
    catch(e) { return null; }
}

/**
 * Шукає найближчу лінію будь-якої фігури на канві, підсвічує її
 */
function _detectSnapLine(clientX, clientY) {
    if (!_cActiveSvg) return;

    const svgPt = _screenToSvg(clientX, clientY);
    if (!svgPt) return;

    let best = null;
    let bestDist = Infinity;
    const SNAP_THRESHOLD = 30; // SVG-пікселів

    // Перебираємо всі елементи ієрархії на поточній канві
    const allItems = _flattenHierarchy(G.hierarchyData);
    allItems.forEach(function(item) {
        if (!item.figureLines || !item.shapePoints || !item.svgGroup) return;

        const offsetX = item._offsetX || 0;
        const offsetY = item._offsetY || 0;
        // Отримуємо CTM групи → SVG
        let groupCTM = null;
        try {
            const svgScreen = _cActiveSvg.getScreenCTM();
            const grpScreen = item.svgGroup.getScreenCTM();
            if (svgScreen && grpScreen)
                groupCTM = svgScreen.inverse().multiply(grpScreen);
        } catch(e) {}

        item.figureLines.forEach(function(lineData) {
            if (lineData.isDiagonal) return;
            const fromPt = item.shapePoints.find(function(p) { return p.num === lineData.from; });
            const toPt   = lineData.isClosing
                ? item.shapePoints[0]
                : item.shapePoints.find(function(p) { return p.num === lineData.to; });
            if (!fromPt || !toPt) return;

            let x1 = fromPt.x + offsetX, y1 = fromPt.y + offsetY;
            let x2 = toPt.x   + offsetX, y2 = toPt.y   + offsetY;

            // Трансформуємо у SVG-координати через CTM групи
            if (groupCTM) {
                const p1 = _applyMatrix(groupCTM, x1, y1);
                const p2 = _applyMatrix(groupCTM, x2, y2);
                x1 = p1.x; y1 = p1.y;
                x2 = p2.x; y2 = p2.y;
            }

            const dist = _distToSegment(svgPt.x, svgPt.y, x1, y1, x2, y2);
            if (dist < SNAP_THRESHOLD && dist < bestDist) {
                bestDist = dist;
                best = { x1, y1, x2, y2, lineData, item, fromPt, toPt, groupCTM, offsetX, offsetY };
            }
        });
    });

    _removeSvgSnapHighlight();
    _cTargetLine = best;
    if (best) _drawSvgSnapHighlight(best);
}

let _cSnapEl = null;
function _drawSvgSnapHighlight(lineInfo) {
    if (!_cActiveSvg) return;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    el.setAttribute('x1', lineInfo.x1); el.setAttribute('y1', lineInfo.y1);
    el.setAttribute('x2', lineInfo.x2); el.setAttribute('y2', lineInfo.y2);
    el.setAttribute('stroke', '#38bdf8');
    el.setAttribute('stroke-width', '4');
    el.setAttribute('stroke-dasharray', '6 3');
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    el.setAttribute('data-snap-highlight', '1');
    el.style.pointerEvents = 'none';
    _cActiveSvg.appendChild(el);
    _cSnapEl = el;
}

function _removeSvgSnapHighlight() {
    if (_cSnapEl && _cSnapEl.parentNode) _cSnapEl.parentNode.removeChild(_cSnapEl);
    _cSnapEl = null;
}

/**
 * Завершує перетягування і малює полоску
 */
function _finishConstructDrop(clientX, clientY) {
    if (!_cDragging) return;
    _cDragging = false;

    _removeSvgSnapHighlight();
    if (_cGhost) { _cGhost.parentNode && _cGhost.parentNode.removeChild(_cGhost); _cGhost = null; }

    document.removeEventListener('mousemove', _onConstructMouseMove);
    document.removeEventListener('mouseup',   _onConstructMouseUp);
    document.removeEventListener('touchmove', _onConstructTouchMove);
    document.removeEventListener('touchend',  _onConstructTouchEnd);

    if (!_cTargetLine) return;  // Не потрапили на лінію — скасовуємо

    _placeConstructStrip(_cTargetLine, _cThicknessM);
    _cTargetLine = null;
}

/**
 * Малює полоску конструктиву вздовж знайденої лінії між двома точками
 */
function _placeConstructStrip(lineInfo, thicknessM) {
    if (!_cActiveSvg) return;

    const { x1, y1, x2, y2 } = lineInfo;
    const thicknessPx = thicknessM * SCALE;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    // Перпендикуляр (назовні — з вибором сторони, завжди «назовні» відносно полігону)
    // Використовуємо один бік: нормаль повернута вліво від напрямку лінії
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux; // Перпендикуляр вліво від напрямку

    // 4 кути полоски
    const pts = [
        { x: x1,              y: y1              },
        { x: x2,              y: y2              },
        { x: x2 + nx * thicknessPx, y: y2 + ny * thicknessPx },
        { x: x1 + nx * thicknessPx, y: y1 + ny * thicknessPx },
    ];

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', pts.map(function(p) { return p.x + ',' + p.y; }).join(' '));
    poly.setAttribute('fill', 'rgba(125,211,252,0.35)');
    poly.setAttribute('stroke', '#38bdf8');
    poly.setAttribute('stroke-width', '1');
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    poly.setAttribute('data-construct', '1');

    // Клік по полоску — виділення / видалення за подвійним кліком
    poly.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (poly.parentNode) poly.parentNode.removeChild(poly);
    });
    poly.style.cursor = 'pointer';
    poly.title = 'Подвійний клік — видалити';

    _cActiveSvg.appendChild(poly);
}

/* ── Допоміжні функції ── */

function _flattenHierarchy(items, result) {
    result = result || [];
    (items || []).forEach(function(item) {
        result.push(item);
        _flattenHierarchy(item.children, result);
    });
    return result;
}

function _applyMatrix(m, x, y) {
    return {
        x: m.a * x + m.c * y + m.e,
        y: m.b * x + m.d * y + m.f,
    };
}

/** Відстань від точки (px,py) до відрізка (ax,ay)-(bx,by) */
function _distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
}
