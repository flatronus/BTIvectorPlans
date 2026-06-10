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
    hint.textContent = 'Перетягніть елемент на лінію. Вікно прилипає з того боку, з якого підносите.';
    body.appendChild(hint);

    body.appendChild(_makeConstructStrip('Перекриття 0.20 м', CONSTRUCT_THICKNESS_M));
    body.appendChild(_makeWindowStrip('Вікно WI1'));
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

    // Знаходимо межі від вже існуючих полосок НА ТІЙ САМІЙ ЛІНІЇ
    // Порівняння напрямконезалежне (A-B або B-A — одна й та сама лінія)
    const EPS_LINE = 8; // px допуск
    function _sameLineSegment(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
        return (Math.abs(ax1-bx1)<EPS_LINE && Math.abs(ay1-by1)<EPS_LINE &&
                Math.abs(ax2-bx2)<EPS_LINE && Math.abs(ay2-by2)<EPS_LINE) ||
               (Math.abs(ax1-bx2)<EPS_LINE && Math.abs(ay1-by2)<EPS_LINE &&
                Math.abs(ax2-bx1)<EPS_LINE && Math.abs(ay2-by1)<EPS_LINE);
    }
    _flattenHierarchy(G.hierarchyData).forEach(function(existing) {
        if (existing.type !== 'construct') return;
        if (!_sameLineSegment(x1,y1,x2,y2,
                              existing._lineX1, existing._lineY1,
                              existing._lineX2, existing._lineY2)) return;

        // Полоска на тій самій лінії — беремо реальний відображений t-діапазон
        // Якщо напрямок зворотній — конвертуємо t: t_new = 1 - t_old
        const reversed = (Math.abs(existing._lineX1-x2)<EPS_LINE && Math.abs(existing._lineY1-y2)<EPS_LINE);
        let tA = existing._tStart, tB = existing._tEnd;
        const lenM = existing.constructLength || 0;
        if (lenM > 0) {
            const existLen = Math.sqrt(
                (existing._lineX2-existing._lineX1)**2 + (existing._lineY2-existing._lineY1)**2);
            const tSpan = (lenM * SCALE) / (existLen || len);
            if (existing.constructFromEnd) tA = Math.max(existing._tStart, tB - tSpan);
            else                           tB = Math.min(existing._tEnd, tA + tSpan);
        }
        if (reversed) { const tmp = 1-tB; tB = 1-tA; tA = tmp; }
        tValues.push(tA);
        tValues.push(tB);
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

    // Мітка початку полоски
    const startMarker = _createConstructStartMarker(sx1, sy1, ux, uy);
    _cActiveSvg.appendChild(startMarker);

    /* ── Реєструємо в ієрархії ── */
    const stripCount = G.hierarchyData.filter(function(i) { return i.type === 'construct'; }).length + 1;
    const hierarchyItem = {
        id:                   G.hierarchyIdCounter++,
        type:                 'construct',
        name:                 'Полоска ' + stripCount,
        constructThickness:   thicknessM,
        constructSideInward:  false,
        constructFromEnd:     false,
        constructLength:      0,
        constructAutoThickness: false,
        visible:              true,
        children:             [],
        expanded:             false,
        parentId:             null,
        _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2,
        _tStart: tStart, _tEnd: tEnd,
        _svgPoly: poly,
        _svgStartMarker: startMarker,
    };
    G.hierarchyData.push(hierarchyItem);
    if (typeof _syncHierarchyToCanvas === 'function') _syncHierarchyToCanvas();
    if (typeof renderHierarchy === 'function') renderHierarchy();

    // Клік → виділення у панелі Елементи + на канві
    poly.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hierarchyItem);
    });
    startMarker.style.pointerEvents = 'visiblePainted';
    startMarker.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hierarchyItem);
    });
}

/**
 * Створює SVG-маркер початку полоски: кружок + стрілка у напрямку лінії.
 */
function _createConstructStartMarker(sx, sy, ux, uy) {
    const NS = 'http://www.w3.org/2000/svg';
    const g  = document.createElementNS(NS, 'g');
    g.setAttribute('data-construct-start', '1');
    g.style.pointerEvents = 'none';

    const circ = document.createElementNS(NS, 'circle');
    circ.setAttribute('cx', sx); circ.setAttribute('cy', sy);
    circ.setAttribute('r', '5');
    circ.setAttribute('fill', 'rgba(56,189,248,0.25)');
    circ.setAttribute('stroke', '#0ea5e9');
    circ.setAttribute('stroke-width', '1.5');
    circ.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(circ);

    // Стрілка вздовж напряму лінії
    const alen = 10, pw = 4;
    const perpX = uy, perpY = -ux;
    const tipX    = sx + ux * alen,       tipY    = sy + uy * alen;
    const tailLX  = sx + perpX * pw / 2,  tailLY  = sy + perpY * pw / 2;
    const tailRX  = sx - perpX * pw / 2,  tailRY  = sy - perpY * pw / 2;
    const arrow = document.createElementNS(NS, 'polygon');
    arrow.setAttribute('points', `${tipX},${tipY} ${tailLX},${tailLY} ${tailRX},${tailRY}`);
    arrow.setAttribute('fill', '#0ea5e9');
    g.appendChild(arrow);

    return g;
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
 * Враховує constructFromEnd, constructLength, constructAutoThickness.
 */
window._redrawConstructItem = function (item) {
    if (!item || !item._svgPoly) return;

    // Авто-товщина: беремо товщину з WI1 на тій самій лінії
    if (item.constructAutoThickness) {
        const wi1Th = _findWI1ThicknessOnLine(item);
        if (wi1Th !== null) item.constructThickness = wi1Th;
    }

    _applyConstructGeometry(item);
};

/**
 * Малює полоску відповідно до її властивостей (без auto-thickness логіки).
 * Також оновлює маркер початку.
 */
function _applyConstructGeometry(item) {
    const { _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2 } = item;
    const thicknessPx = (item.constructThickness || CONSTRUCT_THICKNESS_M) * SCALE;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    const sideSign = item.constructSideInward ? 1 : -1;
    const nx = uy * sideSign, ny = -ux * sideSign;

    let tA = item._tStart;
    let tB = item._tEnd;

    const lenM = item.constructLength || 0;
    if (lenM > 0) {
        const tSpan = (lenM * SCALE) / len;
        if (item.constructFromEnd) {
            tA = Math.max(item._tStart, tB - tSpan);
        } else {
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
    item._svgPoly.style.display = item.visible === false ? 'none' : '';

    // Маркер початку: якщо constructFromEnd — на кінці B, стрілка назад
    const markerX  = item.constructFromEnd ? sx2 : sx1;
    const markerY  = item.constructFromEnd ? sy2 : sy1;
    const markerUx = item.constructFromEnd ? -ux : ux;
    const markerUy = item.constructFromEnd ? -uy : uy;

    const activeSvg = item._svgPoly.ownerSVGElement;
    if (item._svgStartMarker && item._svgStartMarker.parentNode)
        item._svgStartMarker.parentNode.removeChild(item._svgStartMarker);
    if (activeSvg) {
        item._svgStartMarker = _createConstructStartMarker(markerX, markerY, markerUx, markerUy);
        item._svgStartMarker.style.display = item.visible === false ? 'none' : '';
        activeSvg.appendChild(item._svgStartMarker);
        item._svgStartMarker.style.pointerEvents = 'visiblePainted';
        (function(hi) {
            item._svgStartMarker.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hi);
            });
        }(item));
    }
}

/**
 * Шукає elThickness першого WI1 на тій самій лінії що і полоска item.
 * @returns {number|null}
 */
function _findWI1ThicknessOnLine(item) {
    const EPS = 8;
    function sameSeg(ax1,ay1,ax2,ay2,bx1,by1,bx2,by2) {
        return (Math.abs(ax1-bx1)<EPS && Math.abs(ay1-by1)<EPS && Math.abs(ax2-bx2)<EPS && Math.abs(ay2-by2)<EPS) ||
               (Math.abs(ax1-bx2)<EPS && Math.abs(ay1-by2)<EPS && Math.abs(ax2-bx1)<EPS && Math.abs(ay2-by1)<EPS);
    }
    const allItems = _flattenHierarchy(G.hierarchyData);
    for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        if (it.type !== 'element' || it.elCode !== 'WI1') continue;
        if (sameSeg(it._lineX1, it._lineY1, it._lineX2, it._lineY2,
                    item._lineX1, item._lineY1, item._lineX2, item._lineY2)) {
            return it.elThickness != null ? it.elThickness : _WIN_THICKNESS_M;
        }
    }
    return null;
}

/* ═══════════════════════════════════════════════════════════════════
 * ВІКНО WI1 — drag-and-drop на лінію фігури
 * Сторона визначається з якого боку підносять (cross-product).
 * ═══════════════════════════════════════════════════════════════════ */

const _WIN_WIDTH_M     = 0.90;   // ширина вікна за замовч.
const _WIN_THICKNESS_M = 0.20;   // товщина вікна за замовч.

/** Будує drag-джерело «Вікно WI1» */
function _makeWindowStrip(label) {
    const wrap = document.createElement('div');
    wrap.style.cssText = [
        'display:flex;flex-direction:column;align-items:center;gap:4px;',
        'padding:8px 4px;margin-bottom:6px;',
        'background:#fff7ed;border:1px solid #fed7aa;border-radius:6px;',
        'cursor:grab;user-select:none;',
    ].join('');
    wrap.title = 'Перетягніть вікно на лінію. Сторона визначається автоматично.';

    // Превʼю WI1: прямокутник + середня лінія
    const prev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    prev.setAttribute('width', '80'); prev.setAttribute('height', '14');
    prev.setAttribute('viewBox', '0 0 80 14');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x','1'); r.setAttribute('y','2'); r.setAttribute('width','78'); r.setAttribute('height','10');
    r.setAttribute('fill','none'); r.setAttribute('stroke','#c2410c'); r.setAttribute('stroke-width','1.5');
    const ml = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    ml.setAttribute('x1','1'); ml.setAttribute('y1','7'); ml.setAttribute('x2','79'); ml.setAttribute('y2','7');
    ml.setAttribute('stroke','#c2410c'); ml.setAttribute('stroke-width','1');
    prev.appendChild(r); prev.appendChild(ml);
    wrap.appendChild(prev);

    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:#c2410c;font-weight:600;';
    lbl.textContent = label;
    wrap.appendChild(lbl);

    wrap.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        _startWindowDrag(e.clientX, e.clientY);
    });
    wrap.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        _startWindowDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    return wrap;
}

/* ── Window drag-стан (окремий від полоски) ── */
let _wDrag = false, _wGhost = null, _wTargetLine = null, _wActiveSvg = null, _wSnapEl = null;

function _startWindowDrag(clientX, clientY) {
    _wDrag = true;
    _wTargetLine = null;

    const canvas = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
    _wActiveSvg  = canvas ? document.querySelector(`[data-canvas-id="${canvas.id}"] svg`) : null;

    _wGhost = document.createElement('div');
    _wGhost.style.cssText = [
        'position:fixed;pointer-events:none;z-index:9000;',
        'width:50px;height:10px;background:rgba(251,146,60,0.4);',
        'border:1px solid #ea580c;border-radius:2px;transform:translate(-50%,-50%);',
    ].join('');
    document.body.appendChild(_wGhost);
    _wGhostMove(clientX, clientY);

    document.addEventListener('mousemove', _wOnMouseMove);
    document.addEventListener('mouseup',   _wOnMouseUp);
    document.addEventListener('touchmove', _wOnTouchMove, { passive: false });
    document.addEventListener('touchend',  _wOnTouchEnd);
}

function _wGhostMove(cx, cy) { if (_wGhost) { _wGhost.style.left = cx+'px'; _wGhost.style.top = cy+'px'; } }

function _wOnMouseMove(e) { if (!_wDrag) return; _wGhostMove(e.clientX, e.clientY); _wDetectLine(e.clientX, e.clientY); }
function _wOnTouchMove(e) { if (!_wDrag || e.touches.length !== 1) return; e.preventDefault(); _wGhostMove(e.touches[0].clientX, e.touches[0].clientY); _wDetectLine(e.touches[0].clientX, e.touches[0].clientY); }
function _wOnMouseUp(e)   { _wFinish(e.clientX, e.clientY); }
function _wOnTouchEnd(e)  { const t = e.changedTouches[0]; _wFinish(t ? t.clientX : 0, t ? t.clientY : 0); }

function _wScreenToSvg(cx, cy) {
    if (!_wActiveSvg) return null;
    const pt = _wActiveSvg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    try { return pt.matrixTransform(_wActiveSvg.getScreenCTM().inverse()); } catch(e) { return null; }
}

function _wDetectLine(clientX, clientY) {
    if (!_wActiveSvg) return;
    const svgPt = _wScreenToSvg(clientX, clientY);
    if (!svgPt) return;

    let best = null, bestDist = Infinity;
    const THRESH = 30;

    _flattenHierarchy(G.hierarchyData).forEach(function(item) {
        if (!item.figureLines || !item.shapePoints || !item.svgGroup) return;
        const offX = item._offsetX || 0, offY = item._offsetY || 0;
        let grpCTM = null;
        try {
            const ss = _wActiveSvg.getScreenCTM(), gs = item.svgGroup.getScreenCTM();
            if (ss && gs) grpCTM = ss.inverse().multiply(gs);
        } catch(e) {}

        item.figureLines.forEach(function(ld) {
            if (ld.isDiagonal) return;
            const fp = item.shapePoints.find(function(p) { return p.num === ld.from; });
            const tp = ld.isClosing ? item.shapePoints[0] : item.shapePoints.find(function(p) { return p.num === ld.to; });
            if (!fp || !tp) return;

            let x1 = fp.x + offX, y1 = fp.y + offY, x2 = tp.x + offX, y2 = tp.y + offY;
            if (grpCTM) {
                const a = _applyMatrix(grpCTM, x1, y1), b = _applyMatrix(grpCTM, x2, y2);
                x1 = a.x; y1 = a.y; x2 = b.x; y2 = b.y;
            }

            const dist = _distToSegment(svgPt.x, svgPt.y, x1, y1, x2, y2);
            if (dist < THRESH && dist < bestDist) {
                bestDist = dist;
                // Сторона: cross-product вектора лінії і вектора до курсора
                const ldx = x2 - x1, ldy = y2 - y1;
                const cross = ldx * (svgPt.y - y1) - ldy * (svgPt.x - x1);
                const side = cross >= 0 ? 1 : -1;
                best = { x1, y1, x2, y2, lineData: ld, item, offX, offY, grpCTM, dropX: svgPt.x, dropY: svgPt.y, side };
            }
        });
    });

    // Прибираємо старий snap-highlight
    if (_wSnapEl && _wSnapEl.parentNode) _wSnapEl.parentNode.removeChild(_wSnapEl);
    _wSnapEl = null;
    _wTargetLine = best;

    if (best) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', best.x1); el.setAttribute('y1', best.y1);
        el.setAttribute('x2', best.x2); el.setAttribute('y2', best.y2);
        el.setAttribute('stroke', '#ea580c'); el.setAttribute('stroke-width', '4');
        el.setAttribute('stroke-dasharray', '6 3'); el.setAttribute('vector-effect', 'non-scaling-stroke');
        el.style.pointerEvents = 'none';
        _wActiveSvg.appendChild(el);
        _wSnapEl = el;
    }
}

function _wFinish(cx, cy) {
    if (!_wDrag) return;
    _wDrag = false;
    if (_wSnapEl && _wSnapEl.parentNode) _wSnapEl.parentNode.removeChild(_wSnapEl);
    _wSnapEl = null;
    if (_wGhost) { if (_wGhost.parentNode) _wGhost.parentNode.removeChild(_wGhost); _wGhost = null; }
    document.removeEventListener('mousemove', _wOnMouseMove);
    document.removeEventListener('mouseup',   _wOnMouseUp);
    document.removeEventListener('touchmove', _wOnTouchMove);
    document.removeEventListener('touchend',  _wOnTouchEnd);
    if (!_wTargetLine) return;
    _placeWindowOnLine(_wTargetLine);
    _wTargetLine = null;
}

/**
 * Малює WI1 на лінії в точці кидання.
 */
function _placeWindowOnLine(li) {
    if (!_wActiveSvg) return;
    const { x1, y1, x2, y2, lineData, item, dropX, dropY, side } = li;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    // side=1 → нормаль вліво від вектора (cross>0): nx=-uy, ny=ux
    // side=-1 → нормаль вправо: nx=uy, ny=-ux
    const nx = -uy * side, ny = ux * side;

    const tDrop = _projectToLine(dropX, dropY, x1, y1, x2, y2);
    const winPx = _WIN_WIDTH_M * SCALE;
    const tHalf = (winPx / 2) / len;
    let tS = Math.max(0, tDrop - tHalf);
    let tE = Math.min(1, tS + winPx / len);
    tS = Math.max(0, tE - winPx / len);

    const thPx  = _WIN_THICKNESS_M * SCALE;
    const elStartM = parseFloat((tS * len / SCALE).toFixed(3));
    const elEndM   = parseFloat((tE * len / SCALE).toFixed(3));
    const sx   = x1 + ux * tS * len, sy   = y1 + uy * tS * len;
    const elen = (tE - tS) * len;

    // Малюємо <g> з WI1
    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const newId = G.hierarchyIdCounter++;
    grp.setAttribute('data-hierarchy-id', String(newId));
    _drawWI1Svg(grp, sx, sy, ux, uy, nx, ny, elen, thPx);

    // Вікно малюємо ПРЯМО в SVG (не в групу фігури), щоб воно завжди було ВИЩЕ полосок
    _wActiveSvg.appendChild(grp);

    // Реєструємо в ієрархії
    const winCount = G.hierarchyData.filter(function(i) { return i.type === 'element' && i.elCode === 'WI1'; }).length + 1;
    const hItem = {
        id:                  newId,
        type:                'element',
        name:                'Вікно ' + (lineData.from || '?') + '-' + (lineData.isClosing ? '1' : (lineData.to || '?')),
        elCode:              'WI1',
        elStart:             elStartM,
        elEnd:               elEndM,
        elSide:              side,
        elThickness:         _WIN_THICKNESS_M,
        windowAutoThickness: false,
        _origElStart:        elStartM,
        lineFrom:            lineData.from,
        lineTo:              lineData.isClosing ? null : lineData.to,
        _hostLineId:         lineData.id,
        _elKey:              'wi_drag_' + newId,
        svgGroup:            grp,
        children:            [],
        expanded:            false,
        parentId:            item.id,
        _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2,
        _side:   side,
    };

    // Вставляємо тріплет у lineData.elements батьківської фігури
    if (!lineData.elements) lineData.elements = [];
    const codeStr = side === -1 ? '-WI1' : 'WI1';
    const dragId  = String(newId);
    lineData.elements.push({ type: 'number',  value: elStartM });
    lineData.elements.push({ type: 'number',  value: elEndM   });
    lineData.elements.push({ type: 'element', value: codeStr, _dragId: dragId });

    if (!item.children) item.children = [];
    item.children.push(hItem);

    grp.style.cursor = 'pointer';
    grp.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hItem);
    });

    if (typeof _syncHierarchyToCanvas === 'function') _syncHierarchyToCanvas();
    if (typeof renderHierarchy         === 'function') renderHierarchy();
    if (typeof renderProperties        === 'function') renderProperties(hItem);
    showToast('Вікно розміщено. Редагуйте у Властивостях.', 'success');
}

/** Малює WI1 у SVG-групу */
function _drawWI1Svg(target, sx, sy, ux, uy, nx, ny, elen, thPx) {
    const c1x = sx, c1y = sy;
    const c2x = sx + ux * elen, c2y = sy + uy * elen;
    const c3x = c2x + nx * thPx, c3y = c2y + ny * thPx;
    const c4x = c1x + nx * thPx, c4y = c1y + ny * thPx;

    // Прозора підкладка (hit-area)
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hit.setAttribute('points', [c1x+','+c1y, c2x+','+c2y, c3x+','+c3y, c4x+','+c4y].join(' '));
    hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none');
    target.appendChild(hit);

    // Контур
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    rect.setAttribute('points', [c1x+','+c1y, c2x+','+c2y, c3x+','+c3y, c4x+','+c4y].join(' '));
    rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '1'); rect.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(rect);

    // Середня лінія
    const mid = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    mid.setAttribute('x1', c1x + nx * thPx / 2); mid.setAttribute('y1', c1y + ny * thPx / 2);
    mid.setAttribute('x2', c2x + nx * thPx / 2); mid.setAttribute('y2', c2y + ny * thPx / 2);
    mid.setAttribute('stroke', 'black'); mid.setAttribute('stroke-width', '1');
    mid.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(mid);
}

/**
 * Перемальовує SVG-групу вікна WI1 після редагування elStart/elEnd/elSide у Властивостях.
 */
window._redrawWindowElement = function(elItem) {
    if (!elItem || !elItem.svgGroup) return;

    const x1 = elItem._lineX1, y1 = elItem._lineY1;
    const x2 = elItem._lineX2, y2 = elItem._lineY2;
    if (x1 == null) return;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    const side = elItem.elSide != null ? elItem.elSide : 1;
    const nx = -uy * side, ny = ux * side;
    elItem._side = side;

    // Авто-товщина: знаходимо відстань до найближчої паралельної стіни
    if (elItem.windowAutoThickness) {
        const autoTh = _computeAutoWindowThickness(elItem);
        if (autoTh !== null) elItem.elThickness = autoTh;
    }

    const thPx    = (elItem.elThickness || _WIN_THICKNESS_M) * SCALE;
    const startPx = elItem.elStart * SCALE;
    const elen    = (elItem.elEnd - elItem.elStart) * SCALE;
    const sx = x1 + ux * startPx, sy = y1 + uy * startPx;

    while (elItem.svgGroup.firstChild) elItem.svgGroup.removeChild(elItem.svgGroup.firstChild);
    _drawWI1Svg(elItem.svgGroup, sx, sy, ux, uy, nx, ny, elen, thPx);
};

/**
 * Обчислює авто-товщину вікна: знаходить відстань від хост-лінії
 * до найближчої лінії ІНШОЇ фігури, яка паралельна їй (кут < 15°).
 * Середня точка вікна служить початком пошуку по нормалі.
 * @returns {number|null} товщина в метрах або null
 */
function _computeAutoWindowThickness(elItem) {
    const x1 = elItem._lineX1, y1 = elItem._lineY1;
    const x2 = elItem._lineX2, y2 = elItem._lineY2;
    const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    if (len < 1) return null;

    const ux = (x2-x1)/len, uy = (y2-y1)/len;
    const side = elItem.elSide != null ? elItem.elSide : 1;
    // Нормаль з урахуванням сторони вікна
    const nx = -uy * side, ny = ux * side;

    // Центр вікна на хост-лінії
    const tMid = ((elItem.elStart + elItem.elEnd) / 2) * SCALE / len;
    const midX = x1 + ux * tMid * len;
    const midY = y1 + uy * tMid * len;

    const parentId = elItem.parentId != null ? elItem.parentId : -1;

    let bestDist = Infinity;

    const activeSvg = _wActiveSvg || _cActiveSvg ||
        (function(){ const c = window.canvasManager?.canvases.find(c2 => c2.id === window.canvasManager?.activeCanvasId);
                      return c ? document.querySelector(`[data-canvas-id="${c.id}"] svg`) : null; })();

    _flattenHierarchy(G.hierarchyData).forEach(function(it) {
        if (!it.figureLines || !it.shapePoints) return;
        if (it.id === parentId) return;
        const offX = it._offsetX || 0, offY = it._offsetY || 0;

        let grpCTM = null;
        if (activeSvg && it.svgGroup) {
            try {
                const ss = activeSvg.getScreenCTM(), gs = it.svgGroup.getScreenCTM();
                if (ss && gs) grpCTM = ss.inverse().multiply(gs);
            } catch(e) {}
        }

        it.figureLines.forEach(function(ld) {
            if (ld.isDiagonal) return;
            const fp = it.shapePoints.find(function(p) { return p.num === ld.from; });
            const tp = ld.isClosing ? it.shapePoints[0] : it.shapePoints.find(function(p) { return p.num === ld.to; });
            if (!fp || !tp) return;

            let lx1 = fp.x + offX, ly1 = fp.y + offY;
            let lx2 = tp.x + offX, ly2 = tp.y + offY;
            if (grpCTM) {
                const a = _applyMatrix(grpCTM, lx1, ly1), b = _applyMatrix(grpCTM, lx2, ly2);
                lx1 = a.x; ly1 = a.y; lx2 = b.x; ly2 = b.y;
            }

            const ldx = lx2 - lx1, ldy = ly2 - ly1;
            const llen = Math.sqrt(ldx*ldx + ldy*ldy);
            if (llen < 1) return;

            // Перевіряємо паралельність: |dot(u_host, u_other)| > cos(15°)
            const dot = Math.abs(ux * (ldx/llen) + uy * (ldy/llen));
            if (dot < 0.966) return; // не паралельна

            // Відстань від midX,midY до цієї лінії (по нормалі хост-лінії)
            // = проекція (lx1 - mid) на нормаль
            const dist = (lx1 - midX) * nx + (ly1 - midY) * ny;
            if (dist > 0.5 && dist < bestDist) bestDist = dist;
        });
    });

    if (bestDist === Infinity || bestDist < 0.5) return null;
    return parseFloat((bestDist / SCALE).toFixed(3));
}

/**
 * Повертає кутові точки всіх полосок (для snap кімнат).
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
