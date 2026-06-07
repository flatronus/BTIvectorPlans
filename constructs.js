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
                best = { x1, y1, x2, y2, lineData, item, fromPt, toPt, groupCTM, offsetX, offsetY,
                         dropX: svgPt.x, dropY: svgPt.y };
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
 * Малює полоску конструктиву вздовж знайденої лінії.
 * Довжина обмежується: кутові точки фігури + точки перетину вже існуючих
 * полосок (data-construct) з цільовою лінією — нова полоска займає
 * вільний проміжок між найближчими обмежувачами навколо точки кидання.
 *
 * @param {{ x1,y1,x2,y2, clientX,clientY }} lineInfo
 * @param {number} thicknessM
 */
function _placeConstructStrip(lineInfo, thicknessM) {
    if (!_cActiveSvg) return;

    const { x1, y1, x2, y2, dropX, dropY } = lineInfo;
    const thicknessPx = thicknessM * SCALE;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;     // одиничний вектор вздовж лінії
    const nx = -uy, ny = ux;               // перпендикуляр (вліво)

    // ── Збираємо параметричні t-значення вздовж відрізка [0..1] ──
    // Завжди є кінці самого відрізка
    const tValues = [0, 1];

    // Кут кидання у параметрі t
    const tDrop = dropX !== undefined
        ? _projectToLine(dropX, dropY, x1, y1, x2, y2)
        : 0.5;

    // Знаходимо перетини існуючих полосок з лінією
    _cActiveSvg.querySelectorAll('polygon[data-construct]').forEach(function(poly) {
        const pts = _parsePolygonPoints(poly);
        if (pts.length < 4) return;

        // Перші два і останні два кути — бічні ребра полоски.
        // Ребра: 0-3 (лівий торець) і 1-2 (правий торець).
        // Шукаємо перетин кожного з 4 ребер полоски з нашою лінією.
        const edges = [
            [pts[0], pts[1]],   // основа (вздовж лінії)
            [pts[1], pts[2]],   // правий торець
            [pts[2], pts[3]],   // верхній край
            [pts[3], pts[0]],   // лівий торець
        ];

        edges.forEach(function(edge) {
            const t = _segmentIntersectT(
                x1, y1, x2, y2,
                edge[0].x, edge[0].y, edge[1].x, edge[1].y
            );
            if (t !== null) tValues.push(t);
        });
    });

    // Сортуємо і беремо проміжок навколо tDrop
    tValues.sort(function(a, b) { return a - b; });

    let tStart = 0, tEnd = 1;
    for (let i = 0; i < tValues.length - 1; i++) {
        if (tValues[i] <= tDrop && tDrop <= tValues[i + 1]) {
            tStart = tValues[i];
            tEnd   = tValues[i + 1];
            break;
        }
    }

    if (tEnd - tStart < 0.001) return; // вільного місця немає

    const sx1 = x1 + ux * tStart * len, sy1 = y1 + uy * tStart * len;
    const sx2 = x1 + ux * tEnd   * len, sy2 = y1 + uy * tEnd   * len;

    const polyPts = [
        { x: sx1,                      y: sy1                      },
        { x: sx2,                      y: sy2                      },
        { x: sx2 + nx * thicknessPx,   y: sy2 + ny * thicknessPx  },
        { x: sx1 + nx * thicknessPx,   y: sy1 + ny * thicknessPx  },
    ];

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', polyPts.map(function(p) { return p.x + ',' + p.y; }).join(' '));
    poly.setAttribute('fill', 'rgba(125,211,252,0.35)');
    poly.setAttribute('stroke', '#38bdf8');
    poly.setAttribute('stroke-width', '1');
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    poly.setAttribute('data-construct', '1');
    poly.style.cursor = 'pointer';
    poly.title = 'Подвійний клік — видалити';

    poly.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (poly.parentNode) poly.parentNode.removeChild(poly);
    });

    _cActiveSvg.appendChild(poly);

    /* ── Реєструємо в ієрархії ── */
    const stripCount = G.hierarchyData.filter(function(i) { return i.type === 'construct'; }).length + 1;
    const hierarchyItem = {
        id:                 G.hierarchyIdCounter++,
        type:               'construct',
        name:               'Полоска ' + stripCount,
        constructThickness: thicknessM,
        constructFromEnd:   false,
        constructLength:    0,
        visible:            true,
        children:           [],
        expanded:           false,
        parentId:           null,
        // Геометрія для перемалювання
        _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2,
        _tStart: tStart, _tEnd: tEnd,
        _svgPoly: poly,
    };
    G.hierarchyData.push(hierarchyItem);
    if (typeof _syncHierarchyToCanvas === 'function') _syncHierarchyToCanvas();
    if (typeof renderHierarchy === 'function') renderHierarchy();

    // Клік → виділення у панелі Елементи
    poly.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hierarchyItem);
    });
}

/**
 * Проектує точку (px,py) на відрізок (ax,ay)-(bx,by), повертає t ∈ [0,1].
 */
function _projectToLine(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return 0;
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    return Math.max(0, Math.min(1, t));
}

/**
 * Знаходить параметр t уздовж відрізка A=(ax1,ay1)-(ax2,ay2),
 * де він перетинає відрізок B=(bx1,by1)-(bx2,by2).
 * Повертає t ∈ [0,1] або null якщо перетину немає.
 */
function _segmentIntersectT(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    const dx1 = ax2 - ax1, dy1 = ay2 - ay1;
    const dx2 = bx2 - bx1, dy2 = by2 - by1;
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) return null; // паралельні

    const t = ((bx1 - ax1) * dy2 - (by1 - ay1) * dx2) / denom;
    const u = ((bx1 - ax1) * dy1 - (by1 - ay1) * dx1) / denom;

    if (t >= -1e-6 && t <= 1 + 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) {
        return Math.max(0, Math.min(1, t));
    }
    return null;
}

/**
 * Парсить атрибут points полігону у масив {x,y}
 */
function _parsePolygonPoints(poly) {
    const raw = poly.getAttribute('points') || '';
    return raw.trim().split(/\s+/).map(function(pair) {
        const p = pair.split(',');
        return { x: parseFloat(p[0]), y: parseFloat(p[1]) };
    }).filter(function(p) { return !isNaN(p.x) && !isNaN(p.y); });
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

/**
 * Перемальовує полоску на основі властивостей ієрархічного елемента.
 * Враховує constructFromEnd і constructLength для обрізки довжини.
 */
window._redrawConstructItem = function (item) {
    if (!item || !item._svgPoly) return;

    const { _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2 } = item;
    const thicknessPx = (item.constructThickness || CONSTRUCT_THICKNESS_M) * SCALE;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;

    // Межі вільного проміжку (обчислені при розміщенні)
    let tA = item._tStart;
    let tB = item._tEnd;

    // Застосовуємо constructLength (в метрах)
    const lenM = item.constructLength || 0;
    if (lenM > 0) {
        const lenPx  = lenM * SCALE;
        const tSpan  = lenPx / len;
        if (item.constructFromEnd) {
            // Відлік від кінця (tB)
            tA = Math.max(item._tStart, tB - tSpan);
        } else {
            // Відлік від початку (tA)
            tB = Math.min(item._tEnd, tA + tSpan);
        }
    }

    const sx1 = x1 + ux * tA * len, sy1 = y1 + uy * tA * len;
    const sx2 = x1 + ux * tB * len, sy2 = y1 + uy * tB * len;

    const pts = [
        sx1 + ',' + sy1,
        sx2 + ',' + sy2,
        (sx2 + nx * thicknessPx) + ',' + (sy2 + ny * thicknessPx),
        (sx1 + nx * thicknessPx) + ',' + (sy1 + ny * thicknessPx),
    ];
    item._svgPoly.setAttribute('points', pts.join(' '));

    // Видимість
    item._svgPoly.style.display = item.visible === false ? 'none' : '';
};
