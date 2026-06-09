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
    hint.textContent = 'Перетягніть елемент на лінію фігури. Вікно — сторона визначається з якого боку підносите.';
    body.appendChild(hint);

    // Полоска конструктиву 0.20 м
    const strip = _makeConstructStrip('Перекриття 0.20 м', CONSTRUCT_THICKNESS_M);
    body.appendChild(strip);

    // Вікно WI1
    const win = _makeWindowStrip('Вікно WI1', ELEMENT_THICKNESS);
    body.appendChild(win);
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

/* ═══════════════════════════════════════════════════════════════════
 * ВІКНО WI1 — drag-and-drop на лінію фігури
 * ═══════════════════════════════════════════════════════════════════ */

/** Товщина вікна за замовчуванням — рівна ELEMENT_THICKNESS */
const WIN_DEFAULT_THICKNESS_M = 0.20;
/** Ширина вікна за замовчуванням (0.9 м) */
const WIN_DEFAULT_WIDTH_M = 0.90;

/** Будує drag-джерело «Вікно WI1» */
function _makeWindowStrip(label, thicknessM) {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;gap:4px;',
        'padding:8px 4px;margin-bottom:6px;',
        'background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;',
        'cursor:grab;user-select:none;',
    ].join('');
    wrap.title = 'Перетягніть вікно на лінію фігури; сторона — з якого боку підносите';

    // Маленька візуалізація WI1
    const preview = document.createElement('div');
    preview.style.cssText = [
        'width:80px;height:10px;position:relative;',
        'background:transparent;border:1px solid #000;border-radius:1px;',
    ].join('');
    // Середня лінія
    const mid = document.createElement('div');
    mid.style.cssText = [
        'position:absolute;left:0;top:50%;width:100%;height:1px;',
        'background:#000;transform:translateY(-50%);',
    ].join('');
    preview.appendChild(mid);
    wrap.appendChild(preview);

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:#c2410c;font-weight:600;';
    lbl.textContent = label;
    wrap.appendChild(lbl);

    wrap.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        _startWindowDrag(e.clientX, e.clientY);
    });
    wrap.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        _startWindowDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    return wrap;
}

/* ── Window drag-стан ── */
let _wDragging   = false;
let _wGhost      = null;
let _wTargetLine = null;
let _wActiveSvg  = null;

function _startWindowDrag(clientX, clientY) {
    _wDragging   = true;
    _wTargetLine = null;

    const canvas = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
    _wActiveSvg  = canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;

    _wGhost = document.createElement('div');
    _wGhost.style.cssText = [
        'position:fixed;pointer-events:none;z-index:9000;',
        'width:50px;height:10px;',
        'background:rgba(251,191,36,0.3);',
        'border:1px solid #f59e0b;border-radius:2px;',
        'transform:translate(-50%,-50%);',
    ].join('');
    document.body.appendChild(_wGhost);
    _wMoveGhost(clientX, clientY);

    document.addEventListener('mousemove', _onWindowMouseMove);
    document.addEventListener('mouseup',   _onWindowMouseUp);
    document.addEventListener('touchmove', _onWindowTouchMove, { passive: false });
    document.addEventListener('touchend',  _onWindowTouchEnd);
}

function _wMoveGhost(clientX, clientY) {
    if (!_wGhost) return;
    _wGhost.style.left = clientX + 'px';
    _wGhost.style.top  = clientY + 'px';
}

function _onWindowMouseMove(e) {
    if (!_wDragging) return;
    _wMoveGhost(e.clientX, e.clientY);
    _detectWindowSnapLine(e.clientX, e.clientY);
}

function _onWindowTouchMove(e) {
    if (!_wDragging || e.touches.length !== 1) return;
    e.preventDefault();
    _wMoveGhost(e.touches[0].clientX, e.touches[0].clientY);
    _detectWindowSnapLine(e.touches[0].clientX, e.touches[0].clientY);
}

function _onWindowMouseUp(e) { _finishWindowDrop(e.clientX, e.clientY); }
function _onWindowTouchEnd(e) {
    const t = e.changedTouches[0];
    _finishWindowDrop(t ? t.clientX : 0, t ? t.clientY : 0);
}

let _wSnapEl = null;

function _detectWindowSnapLine(clientX, clientY) {
    if (!_wActiveSvg) return;
    const svgPt = _wScreenToSvg(clientX, clientY);
    if (!svgPt) return;

    let best = null;
    let bestDist = Infinity;
    const SNAP_THRESHOLD = 30;

    const allItems = _flattenHierarchy(G.hierarchyData);
    allItems.forEach(function(item) {
        if (!item.figureLines || !item.shapePoints || !item.svgGroup) return;
        const offsetX = item._offsetX || 0;
        const offsetY = item._offsetY || 0;
        let groupCTM = null;
        try {
            const svgScreen = _wActiveSvg.getScreenCTM();
            const grpScreen = item.svgGroup.getScreenCTM();
            if (svgScreen && grpScreen) groupCTM = svgScreen.inverse().multiply(grpScreen);
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
            if (groupCTM) {
                const p1 = _applyMatrix(groupCTM, x1, y1);
                const p2 = _applyMatrix(groupCTM, x2, y2);
                x1 = p1.x; y1 = p1.y; x2 = p2.x; y2 = p2.y;
            }

            const dist = _distToSegment(svgPt.x, svgPt.y, x1, y1, x2, y2);
            if (dist < SNAP_THRESHOLD && dist < bestDist) {
                bestDist = dist;
                // Визначаємо сторону: cross product (line vec) × (point - line start)
                // > 0 → точка ліворуч від вектора (nx=-uy, ny=ux), тобто side=1
                // < 0 → точка праворуч (side=-1)
                const ldx = x2 - x1, ldy = y2 - y1;
                const cross = ldx * (svgPt.y - y1) - ldy * (svgPt.x - x1);
                const side = cross >= 0 ? 1 : -1;
                best = { x1, y1, x2, y2, lineData, item, offsetX, offsetY, groupCTM,
                         dropX: svgPt.x, dropY: svgPt.y, side };
            }
        });
    });

    // Знімаємо старий snap-highlight
    if (_wSnapEl && _wSnapEl.parentNode) _wSnapEl.parentNode.removeChild(_wSnapEl);
    _wSnapEl = null;
    _wTargetLine = best;

    if (best) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', best.x1); el.setAttribute('y1', best.y1);
        el.setAttribute('x2', best.x2); el.setAttribute('y2', best.y2);
        el.setAttribute('stroke', '#f59e0b');
        el.setAttribute('stroke-width', '4');
        el.setAttribute('stroke-dasharray', '6 3');
        el.setAttribute('vector-effect', 'non-scaling-stroke');
        el.setAttribute('data-snap-highlight', '1');
        el.style.pointerEvents = 'none';
        _wActiveSvg.appendChild(el);
        _wSnapEl = el;
    }
}

function _wScreenToSvg(clientX, clientY) {
    if (!_wActiveSvg) return null;
    const pt = _wActiveSvg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    try { return pt.matrixTransform(_wActiveSvg.getScreenCTM().inverse()); }
    catch(e) { return null; }
}

function _finishWindowDrop(clientX, clientY) {
    if (!_wDragging) return;
    _wDragging = false;

    if (_wSnapEl && _wSnapEl.parentNode) _wSnapEl.parentNode.removeChild(_wSnapEl);
    _wSnapEl = null;
    if (_wGhost) { _wGhost.parentNode && _wGhost.parentNode.removeChild(_wGhost); _wGhost = null; }

    document.removeEventListener('mousemove', _onWindowMouseMove);
    document.removeEventListener('mouseup',   _onWindowMouseUp);
    document.removeEventListener('touchmove', _onWindowTouchMove);
    document.removeEventListener('touchend',  _onWindowTouchEnd);

    if (!_wTargetLine) return;
    _placeWindowOnLine(_wTargetLine);
    _wTargetLine = null;
}

/**
 * Розміщує вікно WI1 на лінії фігури.
 * Позиція вздовж лінії — в точці кидання; сторона — з якого боку підносили.
 */
function _placeWindowOnLine(lineInfo) {
    if (!_wActiveSvg) return;

    const { x1, y1, x2, y2, lineData, item, offsetX, offsetY, groupCTM, dropX, dropY, side } = lineInfo;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    // Нормаль: side=1 → ліворуч (nx=-uy), side=-1 → праворуч
    const nx = -uy * side, ny = ux * side;

    // Параметр t точки кидання вздовж відрізка [0..1]
    const tDrop = _projectToLine(dropX, dropY, x1, y1, x2, y2);

    // Ширина вікна в параметрі t
    const winPx   = WIN_DEFAULT_WIDTH_M * SCALE;
    const tHalfW  = (winPx / 2) / len;
    let tStart = Math.max(0, tDrop - tHalfW);
    let tEnd   = Math.min(1, tStart + winPx / len);
    tStart = Math.max(0, tEnd - winPx / len);   // коригуємо якщо впирається в кінець

    const thicknessPx = WIN_DEFAULT_THICKNESS_M * SCALE;

    // Обчислюємо elStart / elEnd у метрах відносно початку ЛІНІЇ ФІГУРИ (до offset)
    // Лінія фігури — в SVG-координатах через groupCTM; нам потрібен параметр t
    // вздовж неї в пікселях, а потім у метрах.
    const elStartM = (tStart * len) / SCALE;
    const elEndM   = (tEnd   * len) / SCALE;

    // ── Малюємо WI1 у SVG ──
    const sx1 = x1 + ux * tStart * len, sy1 = y1 + uy * tStart * len;
    const sx2 = x1 + ux * tEnd   * len, sy2 = y1 + uy * tEnd   * len;
    const elen = tEnd * len - tStart * len;

    const elGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const newId   = G.hierarchyIdCounter++;
    elGroup.setAttribute('data-hierarchy-id', newId);

    // Малюємо WI1: прямокутник + середня лінія
    _drawConstructWI1(elGroup, sx1, sy1, ux, uy, nx, ny, elen, thicknessPx, side);

    // Додаємо в SVG-дерево — усередині svgGroup батьківської фігури (щоб трансформації збігались)
    if (item.svgGroup) {
        item.svgGroup.appendChild(elGroup);
    } else {
        _wActiveSvg.appendChild(elGroup);
    }

    // ── Реєструємо в ієрархії як дочірній WI1 батьківської фігури ──
    const winCount = (item.children || []).filter(function(c) { return c.elCode === 'WI1'; }).length + 1;
    const hierarchyEl = {
        id:        newId,
        type:      'element',
        name:      'Вікно ' + (lineData.from || '?') + '-' + (lineData.to || lineData.isClosing ? (lineData.to || '1') : '?'),
        _elKey:    'wi_drag_' + newId,
        elCode:    'WI1',
        elStart:   parseFloat(elStartM.toFixed(3)),
        elEnd:     parseFloat(elEndM.toFixed(3)),
        elSide:    side,
        elThickness: WIN_DEFAULT_THICKNESS_M,
        lineFrom:  lineData.from,
        lineTo:    lineData.to,
        _hostLineId: lineData.id,
        svgGroup:  elGroup,
        children:  [],
        expanded:  false,
        parentId:  item.id,
        // Зберігаємо геометрію лінії для перемалювання
        _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2,
        _side: side,
    };

    if (!item.children) item.children = [];
    item.children.push(hierarchyEl);

    // Синхронізуємо lineData батьківської фігури — додаємо елемент у elements
    if (lineData.elements == null) lineData.elements = [];
    // Вставляємо triple: start, end, WI1 (з урахуванням сторони)
    const codeStr = side === -1 ? '-WI1' : 'WI1';
    lineData.elements.push({ type: 'number', value: hierarchyEl.elStart });
    lineData.elements.push({ type: 'number', value: hierarchyEl.elEnd });
    lineData.elements.push({ type: 'element', value: codeStr });

    // Клік на групу → виділення
    elGroup.style.cursor = 'pointer';
    elGroup.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hierarchyEl);
    });

    if (typeof _syncHierarchyToCanvas === 'function') _syncHierarchyToCanvas();
    if (typeof renderHierarchy         === 'function') renderHierarchy();
    if (typeof renderProperties        === 'function') renderProperties(hierarchyEl);

    showToast('Вікно розміщено. Відредагуйте у Властивостях.', 'success');
}

/**
 * Малює WI1 у вказану SVG-групу за допомогою вже обчислених векторів.
 */
function _drawConstructWI1(target, sx, sy, ux, uy, nx, ny, elen, thicknessPx, side) {
    const c1x = sx,             c1y = sy;
    const c2x = sx + ux * elen, c2y = sy + uy * elen;
    const c3x = c2x + nx * thicknessPx, c3y = c2y + ny * thicknessPx;
    const c4x = sx  + nx * thicknessPx, c4y = sy  + ny * thicknessPx;

    // Прозорий hit-area
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hit.setAttribute('points', c1x+','+c1y+' '+c2x+','+c2y+' '+c3x+','+c3y+' '+c4x+','+c4y);
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('stroke', 'none');
    hit.setAttribute('data-hit-area', '1');
    target.appendChild(hit);

    // Контур
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    rect.setAttribute('points', c1x+','+c1y+' '+c2x+','+c2y+' '+c3x+','+c3y+' '+c4x+','+c4y);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(rect);

    // Середня лінія
    const msx = sx  + nx * (thicknessPx / 2);
    const msy = sy  + ny * (thicknessPx / 2);
    const mex = c2x + nx * (thicknessPx / 2);
    const mey = c2y + ny * (thicknessPx / 2);
    const midLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    midLine.setAttribute('x1', msx); midLine.setAttribute('y1', msy);
    midLine.setAttribute('x2', mex); midLine.setAttribute('y2', mey);
    midLine.setAttribute('stroke', 'black');
    midLine.setAttribute('stroke-width', '1');
    midLine.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(midLine);
}

/**
 * Перемальовує SVG-групу вікна (WI1) після редагування elStart/elEnd/elSide.
 * Викликається з _syncElementToParentAndRedraw у hierarchy.js.
 */
window._redrawWindowElement = function(elItem) {
    if (!elItem || !elItem.svgGroup) return;

    // Знаходимо батьківську фігуру
    const parent = (function findParent(items) {
        for (var i = 0; i < items.length; i++) {
            if (items[i].id === elItem.parentId) return items[i];
            var f = findParent(items[i].children || []);
            if (f) return f;
        }
        return null;
    })(G.hierarchyData);
    if (!parent || !parent.svgGroup) return;

    // Знаходимо lineData в батьківській фігурі
    var lineData = (parent.figureLines || []).find(function(l) { return l.id === elItem._hostLineId; });
    if (!lineData) {
        lineData = (parent.figureLines || []).find(function(l) {
            return l.from === elItem.lineFrom && (l.to === elItem.lineTo || l.isClosing);
        });
    }
    if (!lineData) return;

    // Отримуємо координати лінії з кешу в елементі ієрархії
    var x1 = elItem._lineX1, y1 = elItem._lineY1, x2 = elItem._lineX2, y2 = elItem._lineY2;
    if (x1 == null) return;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    const side = elItem.elSide != null ? elItem.elSide : 1;
    const nx = -uy * side, ny = ux * side;

    const thicknessPx = (elItem.elThickness || WIN_DEFAULT_THICKNESS_M) * SCALE;
    const startPx = elItem.elStart * SCALE;
    const elen    = (elItem.elEnd - elItem.elStart) * SCALE;
    const sx = x1 + ux * startPx, sy = y1 + uy * startPx;

    // Очищаємо і перемальовуємо
    while (elItem.svgGroup.firstChild) elItem.svgGroup.removeChild(elItem.svgGroup.firstChild);
    _drawConstructWI1(elItem.svgGroup, sx, sy, ux, uy, nx, ny, elen, thicknessPx, side);
};

/**
 * Повертає всі характерні точки конструктивів на активній канві
 * (кути полосок — 4 точки кожної) у SVG-координатах.
 */
window._getConstructSnapPoints = function() {
    const pts = [];
    (G.hierarchyData || []).forEach(function(item) {
        if (item.type !== 'construct' || !item._svgPoly) return;
        const raw = item._svgPoly.getAttribute('points') || '';
        raw.trim().split(/\s+/).forEach(function(pair) {
            const p = pair.split(',');
            const x = parseFloat(p[0]), y = parseFloat(p[1]);
            if (!isNaN(x) && !isNaN(y)) pts.push({ x, y });
        });
    });
    return pts;
};
