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
 * Шукає найближчу лінію будь-якої фігури на канві, підсвічує її.
 * Для дуг (lineType==='curve') вимірює відстань до дуги, а не до хорди.
 */
function _detectSnapLine(clientX, clientY) {
    if (!_cActiveSvg) return;

    const svgPt = _screenToSvg(clientX, clientY);
    if (!svgPt) return;

    let best = null;
    let bestDist = Infinity;
    const SNAP_THRESHOLD = 30; // SVG-пікселів

    const allItems = _flattenHierarchy(G.hierarchyData);
    allItems.forEach(function(item) {
        if (!item.figureLines || !item.shapePoints || !item.svgGroup) return;

        const offsetX = item._offsetX || 0;
        const offsetY = item._offsetY || 0;
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

            if (groupCTM) {
                const p1 = _applyMatrix(groupCTM, x1, y1);
                const p2 = _applyMatrix(groupCTM, x2, y2);
                x1 = p1.x; y1 = p1.y;
                x2 = p2.x; y2 = p2.y;
            }

            let dist;
            let sagPx = 0;
            if (lineData.lineType === 'curve') {
                const arcP = (typeof _parseArcParams === 'function') ? _parseArcParams(lineData.elements || []) : null;
                sagPx = arcP ? arcP.sagMeters * SCALE : 0;
                dist = _distToArc(svgPt.x, svgPt.y, x1, y1, x2, y2, sagPx);
            } else {
                dist = _distToSegment(svgPt.x, svgPt.y, x1, y1, x2, y2);
            }

            if (dist < SNAP_THRESHOLD && dist < bestDist) {
                bestDist = dist;
                best = { x1, y1, x2, y2, lineData, item, fromPt, toPt, groupCTM, offsetX, offsetY,
                         dropX: svgPt.x, dropY: svgPt.y, sagPx: sagPx, lineType: lineData.lineType };
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
    let el;
    if (lineInfo.lineType === 'curve' && lineInfo.sagPx) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        el.setAttribute('d', _buildArcPath(lineInfo.x1, lineInfo.y1, lineInfo.x2, lineInfo.y2, lineInfo.sagPx));
        el.setAttribute('fill', 'none');
    } else {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        el.setAttribute('x1', lineInfo.x1); el.setAttribute('y1', lineInfo.y1);
        el.setAttribute('x2', lineInfo.x2); el.setAttribute('y2', lineInfo.y2);
    }
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
    const sagPx = lineInfo.sagPx || 0;
    const isArc = lineInfo.lineType === 'curve' && sagPx !== 0;
    const thicknessPx = thicknessM * SCALE;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;     // одиничний вектор вздовж хорди
    const nx = -uy, ny = ux;               // перпендикуляр (вліво)

    // ── Збираємо параметричні t-значення вздовж хорди [0..1] ──
    const tValues = [0, 1];

    // Кут кидання у параметрі t (проекція на хорду)
    const tDrop = dropX !== undefined
        ? _projectToLine(dropX, dropY, x1, y1, x2, y2)
        : 0.5;

    // Знаходимо перетини існуючих полосок/path з хордою
    _cActiveSvg.querySelectorAll('polygon[data-construct]').forEach(function(poly) {
        const pts = _parsePolygonPoints(poly);
        if (pts.length < 4) return;
        const edges = [
            [pts[0], pts[1]],
            [pts[1], pts[2]],
            [pts[2], pts[3]],
            [pts[3], pts[0]],
        ];
        edges.forEach(function(edge) {
            const t = _segmentIntersectT(x1, y1, x2, y2, edge[0].x, edge[0].y, edge[1].x, edge[1].y);
            if (t !== null) tValues.push(t);
        });
    });
    // Також path[data-construct] (дугові полоски)
    _cActiveSvg.querySelectorAll('path[data-construct]').forEach(function(path) {
        const bb = path.getBBox();
        // Апроксимація: перетин bounding-box торців з хордою
        const corners = [
            {x: bb.x,          y: bb.y},
            {x: bb.x+bb.width, y: bb.y},
            {x: bb.x+bb.width, y: bb.y+bb.height},
            {x: bb.x,          y: bb.y+bb.height},
        ];
        for (let ci = 0; ci < corners.length; ci++) {
            const t = _segmentIntersectT(x1, y1, x2, y2,
                corners[ci].x, corners[ci].y,
                corners[(ci+1)%4].x, corners[(ci+1)%4].y);
            if (t !== null) tValues.push(t);
        }
    });

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

    // Для дуги: точки на самій дузі, а не на хорді
    let sx1, sy1, sx2, sy2;
    if (isArc) {
        const ptA = _arcPointAt(x1, y1, x2, y2, sagPx, tStart);
        const ptB = _arcPointAt(x1, y1, x2, y2, sagPx, tEnd);
        sx1 = ptA.x; sy1 = ptA.y;
        sx2 = ptB.x; sy2 = ptB.y;
    } else {
        sx1 = x1 + ux * tStart * len; sy1 = y1 + uy * tStart * len;
        sx2 = x1 + ux * tEnd   * len; sy2 = y1 + uy * tEnd   * len;
    }

    // subSagPx — висота дуги підсегмента [tStart..tEnd]
    let subSagPx = 0;
    if (isArc) {
        subSagPx = _subArcSag(x1, y1, x2, y2, sagPx, tStart, tEnd);
    }

    let poly;
    if (isArc) {
        poly = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        poly.setAttribute('d', _buildArcStripPath(sx1, sy1, sx2, sy2, subSagPx, thicknessPx, 1));
        poly.setAttribute('data-construct', '1');
        poly.setAttribute('data-arc', '1');
    } else {
        const polyPts = [
            { x: sx1,                      y: sy1                      },
            { x: sx2,                      y: sy2                      },
            { x: sx2 + nx * thicknessPx,   y: sy2 + ny * thicknessPx  },
            { x: sx1 + nx * thicknessPx,   y: sy1 + ny * thicknessPx  },
        ];
        poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        poly.setAttribute('points', polyPts.map(function(p) { return p.x + ',' + p.y; }).join(' '));
        poly.setAttribute('data-construct', '1');
    }
    poly.setAttribute('fill', 'rgba(125,211,252,0.35)');
    poly.setAttribute('stroke', '#38bdf8');
    poly.setAttribute('stroke-width', '1');
    poly.setAttribute('vector-effect', 'non-scaling-stroke');
    poly.style.cursor = 'pointer';
    poly.title = 'Подвійний клік — видалити';

    poly.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        if (poly.parentNode) poly.parentNode.removeChild(poly);
    });

    _cActiveSvg.appendChild(poly);

    // Мітка початку полоски (дотична до дуги в точці початку)
    let markerUx = ux, markerUy = uy;
    if (isArc) {
        const tan = _arcTangentAt(x1, y1, x2, y2, sagPx, tStart);
        markerUx = tan.tx; markerUy = tan.ty;
    }
    const startMarker = _createConstructStartMarker(sx1, sy1, markerUx, markerUy);
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
        _hostItemId:          lineInfo.item.id,
        _hostLineId:          lineInfo.lineData ? lineInfo.lineData.id : null,
        _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2,
        _tStart: tStart, _tEnd: tEnd,
        _sagPx:  sagPx,
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
    startMarker.addEventListener('click', function(e) {
        e.stopPropagation();
        if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hierarchyItem);
    });
}

/**
 * Створює SVG-маркер початку полоски: маленький кружок + ромб з пунктирною ніжкою.
 */
function _createConstructStartMarker(sx, sy, ux, uy) {
    const NS = 'http://www.w3.org/2000/svg';
    const g  = document.createElementNS(NS, 'g');
    g.setAttribute('data-construct-start', '1');
    g.style.pointerEvents = 'none';

    // Коло у точці початку
    const circ = document.createElementNS(NS, 'circle');
    circ.setAttribute('cx', sx); circ.setAttribute('cy', sy);
    circ.setAttribute('r', '5');
    circ.setAttribute('fill', 'rgba(56,189,248,0.25)');
    circ.setAttribute('stroke', '#0ea5e9');
    circ.setAttribute('stroke-width', '1.5');
    circ.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(circ);

    // Маленька стрілка вздовж напряму лінії
    const alen = 10;
    const pw = 4; // ширина хвоста стрілки
    const px = uy, py = -ux; // перпендикуляр
    const tipX  = sx + ux * alen;
    const tipY  = sy + uy * alen;
    const tailLX = sx + px * pw / 2;
    const tailLY = sy + py * pw / 2;
    const tailRX = sx - px * pw / 2;
    const tailRY = sy - py * pw / 2;
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

/**
 * Знаходить центр кола та радіус для дуги між (x1,y1)-(x2,y2) з висотою sag.
 * Повертає { cx, cy, R, angA, angB, sweep } або null.
 * R > 0 завжди. sweep=1 означає SVG sweep-flag=1 (за годинниковою).
 */
function _arcCircle(x1, y1, x2, y2, sag) {
    if (!sag || sag === 0) return null;
    const dx = x2 - x1, dy = y2 - y1;
    const chord = Math.sqrt(dx*dx + dy*dy);
    if (chord < 1) return null;
    // Одиничний перпендикуляр вліво від напрямку x1→x2
    const pxN = -dy/chord, pyN = dx/chord;
    // Радіус зі знаком (sag>0 → центр праворуч від перпендикуляра)
    const Rs = (chord*chord/4 + sag*sag) / (2*sag);
    const absR = Math.abs(Rs);
    // Середина хорди
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    // Центр кола: зміщений від середини хорди вздовж перпендикуляра на (Rs - sag)
    const cx = mx + pxN * (Rs - sag);
    const cy = my + pyN * (Rs - sag);
    const angA = Math.atan2(y1 - cy, x1 - cx);
    const angB = Math.atan2(y2 - cy, x2 - cx);
    const sweep = sag > 0 ? 1 : 0;
    return { cx, cy, R: absR, Rs, angA, angB, sweep };
}

/**
 * Точка на дузі при кутовому параметрі t ∈ [0,1]:
 * t=0 → (x1,y1), t=1 → (x2,y2), проміжне — лінійна інтерполяція кута.
 */
function _arcPointAt(x1, y1, x2, y2, sag, t) {
    const c = _arcCircle(x1, y1, x2, y2, sag);
    if (!c) {
        return { x: x1 + (x2-x1)*t, y: y1 + (y2-y1)*t };
    }
    // Кут інтерполюємо в правильному напрямку
    let angA = c.angA, angB = c.angB;
    if (c.sweep === 1) {
        // За годинниковою: angA → angB, angB може бути < angA
        if (angB < angA) angB += 2*Math.PI;
    } else {
        if (angB > angA) angB -= 2*Math.PI;
    }
    const ang = angA + (angB - angA) * t;
    return { x: c.cx + c.R * Math.cos(ang), y: c.cy + c.R * Math.sin(ang) };
}

/**
 * Нормаль до дуги в точці при параметрі t (одиничний вектор від кола назовні / всередину).
 * sag > 0: нормаль "вліво" від напрямку дуги = від центру назовні з боку дуги.
 * Повертає { nx, ny } — нормаль вліво від напрямку x1→x2.
 */
function _arcNormalAt(x1, y1, x2, y2, sag, t) {
    const c = _arcCircle(x1, y1, x2, y2, sag);
    if (!c) {
        const dx = x2-x1, dy = y2-y1;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        return { nx: -dy/len, ny: dx/len };
    }
    const pt = _arcPointAt(x1, y1, x2, y2, sag, t);
    // Вектор від центру до точки
    const vx = pt.x - c.cx, vy = pt.y - c.cy;
    const vlen = Math.sqrt(vx*vx+vy*vy) || 1;
    // Якщо sag>0 дуга опукла вліво від напрямку → нормаль вліво = від центру
    const sign = c.Rs > 0 ? 1 : -1;
    return { nx: sign*vx/vlen, ny: sign*vy/vlen };
}

/**
 * Обчислює висоту дуги (sag) підсегмента [tA..tB] повної дуги (x1,y1)→(x2,y2) sag.
 * Параметри tA, tB — кутові параметри [0..1] на повній дузі.
 * Повертає sag підсегмента зі знаком.
 */
function _subArcSag(x1, y1, x2, y2, sag, tA, tB) {
    if (!sag || sag === 0 || tA === tB) return 0;
    const c = _arcCircle(x1, y1, x2, y2, sag);
    if (!c) return 0;
    // Точки на дузі
    const ptA = _arcPointAt(x1, y1, x2, y2, sag, tA);
    const ptB = _arcPointAt(x1, y1, x2, y2, sag, tB);
    // Хорда підсегмента
    const subChord = Math.sqrt((ptB.x-ptA.x)**2+(ptB.y-ptA.y)**2);
    if (subChord < 1e-6) return 0;
    // Середина підхорди
    const mx = (ptA.x+ptB.x)/2, my = (ptA.y+ptB.y)/2;
    // Відстань від центру кола до середини підхорди
    const dCenter = Math.sqrt((mx-c.cx)**2+(my-c.cy)**2);
    // sag підсегмента = R - dCenter (зі знаком залежно від сторони)
    const subSag = c.R - dCenter;
    // Знак: перевіряємо чи середина підхорди на тому ж боці від хорди що й оригінальний sag
    const signSag = sag > 0 ? 1 : -1;
    return signSag * subSag;
}

/**
 * Дотична (одиничний вектор вздовж дуги) в точці при параметрі t.
 */
function _arcTangentAt(x1, y1, x2, y2, sag, t) {
    const c = _arcCircle(x1, y1, x2, y2, sag);
    if (!c) {
        const dx = x2-x1, dy = y2-y1;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        return { tx: dx/len, ty: dy/len };
    }
    let angA = c.angA, angB = c.angB;
    if (c.sweep === 1) { if (angB < angA) angB += 2*Math.PI; }
    else               { if (angB > angA) angB -= 2*Math.PI; }
    const ang = angA + (angB - angA) * t;
    // Дотична до кола: перпендикуляр до радіуса
    // sweep=1 → рух за год. → дотична = (sin(ang), -cos(ang))
    const tx = c.sweep === 1 ?  Math.sin(ang) : -Math.sin(ang);
    const ty = c.sweep === 1 ? -Math.cos(ang) :  Math.cos(ang);
    return { tx, ty };
}

/**
 * Будує closed SVG path полоски на дузі з рівномірною товщиною thPx.
 * Внутрішня дуга: (sx1,sy1)→(sx2,sy2) з sag sagPx, радіус R.
 * Зовнішня дуга: той самий центр кола, радіус R+thPx (або R-thPx залежно від знаку).
 * Кінцеві точки зовнішньої дуги — проекції кінцевих точок на зовнішнє коло.
 * side: +1=нормаль вліво (назовні), -1=всередину.
 */
function _buildArcStripPath(sx1, sy1, sx2, sy2, sagPx, thPx, side) {
    if (!sagPx || sagPx === 0) {
        // fallback — прямокутник
        const dx = sx2-sx1, dy = sy2-sy1;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const nx = -dy/len * side, ny = dx/len * side;
        const p1 = sx1+','+sy1, p2 = sx2+','+sy2;
        const p3 = (sx2+nx*thPx)+','+(sy2+ny*thPx), p4 = (sx1+nx*thPx)+','+(sy1+ny*thPx);
        return 'M '+p1+' L '+p2+' L '+p3+' L '+p4+' Z';
    }
    const c = _arcCircle(sx1, sy1, sx2, sy2, sagPx);
    if (!c) return 'M '+sx1+','+sy1+' Z';

    // Напрямок нормалі: вліво від дуги = від центру назовні (якщо Rs>0)
    // side=+1 → назовні (від центру), side=-1 → всередину
    const normalSign = (c.Rs > 0 ? 1 : -1) * side;
    const innerR = c.R;
    const outerR = innerR + normalSign * thPx;
    if (outerR <= 0) return 'M '+sx1+','+sy1+' Z';

    // Кути кінцевих точок (вже обчислені в _arcCircle)
    const angA = c.angA, angB = c.angB;

    // Зовнішні кінцеві точки (той самий кут, зовнішній радіус)
    const ox1 = c.cx + outerR * Math.cos(angA);
    const oy1 = c.cy + outerR * Math.sin(angA);
    const ox2 = c.cx + outerR * Math.cos(angB);
    const oy2 = c.cy + outerR * Math.sin(angB);

    const largeArc = Math.abs(sagPx) > innerR ? 1 : 0;
    const sweep = c.sweep;

    return [
        'M', sx1+','+sy1,
        'A', innerR, innerR, 0, largeArc, sweep, sx2+','+sy2,
        'L', ox2+','+oy2,
        'A', outerR, outerR, 0, largeArc, (sweep ? 0 : 1), ox1+','+oy1,
        'Z',
    ].join(' ');
}

/**
 * Відстань від точки (px,py) до дуги між (ax,ay)-(bx,by) з висотою sag.
 * Апроксимація: вимірює відстань до кола, обмеженого дугою.
 */
function _distToArc(px, py, ax, ay, bx, by, sag) {
    if (!sag || sag === 0) return _distToSegment(px, py, ax, ay, bx, by);
    const dx = bx - ax, dy = by - ay;
    const chord = Math.sqrt(dx*dx + dy*dy);
    if (chord < 1) return _distToSegment(px, py, ax, ay, bx, by);
    // Центр хорди
    const mx = (ax+bx)/2, my = (ay+by)/2;
    // Перпендикуляр вліво
    const pxN = -dy/chord, pyN = dx/chord;
    // Центр кола
    const R = (chord*chord/4 + sag*sag) / (2*sag);
    const cx = mx + pxN * (R - sag);
    const cy = my + pyN * (R - sag);
    const absR = Math.abs(R);
    // Відстань від точки до кола
    const dToCenter = Math.sqrt((px-cx)**2+(py-cy)**2);
    const dToCircle = Math.abs(dToCenter - absR);
    // Перевіряємо що точка знаходиться в кутовому діапазоні дуги
    const angA = Math.atan2(ay - cy, ax - cx);
    const angB = Math.atan2(by - cy, bx - cx);
    const angP = Math.atan2(py - cy, px - cx);
    // Нормалізуємо до [0, 2π]
    function norm(a) { return ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI); }
    const nA = norm(angA), nB = norm(angB), nP = norm(angP);
    let inArc;
    if (sag > 0) {
        inArc = nA <= nP ? nP <= nB || nB < nA : nP <= nB || nP >= nA;
    } else {
        inArc = nB <= nP ? nP <= nA || nA < nB : nP <= nA || nP >= nB;
    }
    if (!inArc) {
        // Поза дугою — відстань до найближчого кінця
        const dA = Math.sqrt((px-ax)**2+(py-ay)**2);
        const dB = Math.sqrt((px-bx)**2+(py-by)**2);
        return Math.min(dA, dB);
    }
    return dToCircle;
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

    // Якщо авто-товщина — намагаємось взяти товщину з WI1 на тій самій лінії
    if (item.constructAutoThickness) {
        const wi1Thickness = _findWI1ThicknessOnLine(item);
        if (wi1Thickness !== null) {
            item.constructThickness = wi1Thickness;
        }
    }

    const { _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2 } = item;
    const sagPx = item._sagPx || 0;
    const isArc = sagPx !== 0;
    const thicknessPx = (item.constructThickness || CONSTRUCT_THICKNESS_M) * SCALE;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    // constructSideInward: false=ззовні (нормаль вліво: nx=-uy), true=зсередини (nx=+uy)
    const sideSign = item.constructSideInward ? 1 : -1;
    const nx = uy * sideSign, ny = -ux * sideSign;

    // Межі вільного проміжку (обчислені при розміщенні)
    let tA = item._tStart;
    let tB = item._tEnd;

    // Застосовуємо constructLength (в метрах)
    const lenM = item.constructLength || 0;
    if (lenM > 0) {
        const lenPx  = lenM * SCALE;
        const tSpan  = lenPx / len;
        if (item.constructFromEnd) {
            tA = Math.max(item._tStart, tB - tSpan);
        } else {
            tB = Math.min(item._tEnd, tA + tSpan);
        }
    }

    // Базові точки на хорді (для прямої) або на дузі (для arc)
    let sx1, sy1, sx2, sy2;
    if (isArc) {
        const ptAA = _arcPointAt(x1, y1, x2, y2, sagPx, tA);
        const ptBB = _arcPointAt(x1, y1, x2, y2, sagPx, tB);
        sx1 = ptAA.x; sy1 = ptAA.y; sx2 = ptBB.x; sy2 = ptBB.y;
    } else {
        sx1 = x1 + ux * tA * len; sy1 = y1 + uy * tA * len;
        sx2 = x1 + ux * tB * len; sy2 = y1 + uy * tB * len;
    }

    if (isArc) {
        // Перебудовуємо як path (може бути polygon → треба замінити елемент)
        if (item._svgPoly.tagName === 'polygon') {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', 'rgba(125,211,252,0.35)');
            path.setAttribute('stroke', '#38bdf8');
            path.setAttribute('stroke-width', '1');
            path.setAttribute('vector-effect', 'non-scaling-stroke');
            path.setAttribute('data-construct', '1');
            path.setAttribute('data-arc', '1');
            path.style.cursor = 'pointer';
            path.title = 'Подвійний клік — видалити';
            (function(hi) {
                path.addEventListener('dblclick', function(e) { e.stopPropagation(); if (path.parentNode) path.parentNode.removeChild(path); });
                path.addEventListener('click', function(e) { e.stopPropagation(); if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hi); });
            }(item));
            if (item._svgPoly.parentNode) item._svgPoly.parentNode.replaceChild(path, item._svgPoly);
            item._svgPoly = path;
        }
        // Точки на дузі для підсегмента
        const ptRA = _arcPointAt(item._lineX1, item._lineY1, item._lineX2, item._lineY2, sagPx, tA);
        const ptRB = _arcPointAt(item._lineX1, item._lineY1, item._lineX2, item._lineY2, sagPx, tB);
        const subSagR = _subArcSag(item._lineX1, item._lineY1, item._lineX2, item._lineY2, sagPx, tA, tB);
        item._svgPoly.setAttribute('d', _buildArcStripPath(ptRA.x, ptRA.y, ptRB.x, ptRB.y, subSagR, thicknessPx, sideSign));
    } else {
        // Переконуємось що це polygon
        if (item._svgPoly.tagName === 'path') {
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('fill', 'rgba(125,211,252,0.35)');
            poly.setAttribute('stroke', '#38bdf8');
            poly.setAttribute('stroke-width', '1');
            poly.setAttribute('vector-effect', 'non-scaling-stroke');
            poly.setAttribute('data-construct', '1');
            poly.style.cursor = 'pointer';
            poly.title = 'Подвійний клік — видалити';
            (function(hi) {
                poly.addEventListener('dblclick', function(e) { e.stopPropagation(); if (poly.parentNode) poly.parentNode.removeChild(poly); });
                poly.addEventListener('click', function(e) { e.stopPropagation(); if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hi); });
            }(item));
            if (item._svgPoly.parentNode) item._svgPoly.parentNode.replaceChild(poly, item._svgPoly);
            item._svgPoly = poly;
        }
        const pts = [
            sx1 + ',' + sy1,
            sx2 + ',' + sy2,
            (sx2 + nx * thicknessPx) + ',' + (sy2 + ny * thicknessPx),
            (sx1 + nx * thicknessPx) + ',' + (sy1 + ny * thicknessPx),
        ];
        item._svgPoly.setAttribute('points', pts.join(' '));
    }

    // Оновлюємо позицію маркера початку
    if (item._svgStartMarker && item._svgStartMarker.parentNode) {
        item._svgStartMarker.parentNode.removeChild(item._svgStartMarker);
    }
    if (_cActiveSvg) {
        item._svgStartMarker = _createConstructStartMarker(sx1, sy1, ux, uy);
        item._svgStartMarker.style.display = item.visible === false ? 'none' : '';
        _cActiveSvg.appendChild(item._svgStartMarker);
        (function(hi) {
            item._svgStartMarker.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hi);
            });
        }(item));
    }

    // Видимість
    item._svgPoly.style.display = item.visible === false ? 'none' : '';

    // Після перемалювання цієї полоски — перерахувати межі всіх інших полосок
    _recalcAllStripBounds(item);
};

/**
 * Після зміни товщини полоски changedItem перераховує _tStart/_tEnd
 * всіх інших полосок, чий полігон перетинається з оновленим полігоном changedItem.
 * Використовує той самий tValues-механізм що і _placeConstructStrip.
 */
function _recalcAllStripBounds(changedItem) {
    if (!_cActiveSvg) return;

    const allStrips = (G.hierarchyData || []).filter(function(it) {
        return it.type === 'construct' && it !== changedItem && it._svgPoly && it._lineX1 != null;
    });

    if (allStrips.length === 0) return;

    allStrips.forEach(function(strip) {
        const x1 = strip._lineX1, y1 = strip._lineY1;
        const x2 = strip._lineX2, y2 = strip._lineY2;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;

        // Середина поточного проміжку — для визначення якого проміжку тримається полоска
        const tMid = (strip._tStart + strip._tEnd) / 2;

        // Збираємо t-значення: межі лінії + перетини з усіма фігурами + перетини з усіма полігонами полосок
        const tValues = [0, 1];

        // Перетини ліній фігур
        _flattenHierarchy(G.hierarchyData).forEach(function(it) {
            if (!it.figureLines || !it.shapePoints) return;
            const offX = it._offsetX || 0, offY = it._offsetY || 0;
            let grpCTM = null;
            try {
                const ss = _cActiveSvg.getScreenCTM(), gs = it.svgGroup && it.svgGroup.getScreenCTM();
                if (ss && gs) grpCTM = ss.inverse().multiply(gs);
            } catch(e) {}

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

                const t = _segmentIntersectT(x1, y1, x2, y2, lx1, ly1, lx2, ly2);
                if (t !== null) tValues.push(t);
            });
        });

        // Перетини з полігонами/path всіх полосок (включно зі зміненою changedItem)
        _cActiveSvg.querySelectorAll('polygon[data-construct]').forEach(function(poly) {
            const pts = _parsePolygonPoints(poly);
            if (pts.length < 4) return;
            const edges = [
                [pts[0], pts[1]],
                [pts[1], pts[2]],
                [pts[2], pts[3]],
                [pts[3], pts[0]],
            ];
            edges.forEach(function(edge) {
                const t = _segmentIntersectT(x1, y1, x2, y2, edge[0].x, edge[0].y, edge[1].x, edge[1].y);
                if (t !== null) tValues.push(t);
            });
        });
        _cActiveSvg.querySelectorAll('path[data-construct]').forEach(function(path) {
            const bb = path.getBBox();
            const corners = [
                {x: bb.x, y: bb.y}, {x: bb.x+bb.width, y: bb.y},
                {x: bb.x+bb.width, y: bb.y+bb.height}, {x: bb.x, y: bb.y+bb.height},
            ];
            for (let ci = 0; ci < corners.length; ci++) {
                const t = _segmentIntersectT(x1, y1, x2, y2, corners[ci].x, corners[ci].y, corners[(ci+1)%4].x, corners[(ci+1)%4].y);
                if (t !== null) tValues.push(t);
            }
        });

        tValues.sort(function(a, b) { return a - b; });

        // Знаходимо проміжок що містить tMid
        let tS = 0, tE = 1;
        for (let i = 0; i < tValues.length - 1; i++) {
            if (tValues[i] <= tMid && tMid <= tValues[i + 1]) {
                tS = tValues[i];
                tE = tValues[i + 1];
                break;
            }
        }

        if (tE - tS < 0.001) return;

        // Оновлюємо межі і перемальовуємо без рекурсії (без виклику _recalcAllStripBounds)
        strip._tStart = tS;
        strip._tEnd   = tE;

        const ux = dx / len, uy = dy / len;
        const sideSign = strip.constructSideInward ? 1 : -1;
        const nx = uy * sideSign, ny = -ux * sideSign;
        const thicknessPx = (strip.constructThickness || CONSTRUCT_THICKNESS_M) * SCALE;

        let tA = tS, tB = tE;
        const lenM = strip.constructLength || 0;
        if (lenM > 0) {
            const tSpan = (lenM * SCALE) / len;
            if (strip.constructFromEnd) {
                tA = Math.max(tS, tB - tSpan);
            } else {
                tB = Math.min(tE, tA + tSpan);
            }
        }

        const stripSagPx = strip._sagPx || 0;
        let sx1, sy1, sx2, sy2;
        if (stripSagPx !== 0) {
            const ptSA = _arcPointAt(x1, y1, x2, y2, stripSagPx, tA);
            const ptSB = _arcPointAt(x1, y1, x2, y2, stripSagPx, tB);
            sx1 = ptSA.x; sy1 = ptSA.y; sx2 = ptSB.x; sy2 = ptSB.y;
        } else {
            sx1 = x1 + ux * tA * len; sy1 = y1 + uy * tA * len;
            sx2 = x1 + ux * tB * len; sy2 = y1 + uy * tB * len;
        }

        if (stripSagPx !== 0) {
            if (strip._svgPoly.tagName === 'polygon') {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill', 'rgba(125,211,252,0.35)');
                path.setAttribute('stroke', '#38bdf8');
                path.setAttribute('stroke-width', '1');
                path.setAttribute('vector-effect', 'non-scaling-stroke');
                path.setAttribute('data-construct', '1');
                path.setAttribute('data-arc', '1');
                path.style.cursor = 'pointer';
                (function(hi) {
                    path.addEventListener('dblclick', function(e) { e.stopPropagation(); if (path.parentNode) path.parentNode.removeChild(path); });
                    path.addEventListener('click', function(e) { e.stopPropagation(); if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hi); });
                }(strip));
                if (strip._svgPoly.parentNode) strip._svgPoly.parentNode.replaceChild(path, strip._svgPoly);
                strip._svgPoly = path;
            }
            const subSagR2 = _subArcSag(x1, y1, x2, y2, stripSagPx, tA, tB);
            strip._svgPoly.setAttribute('d', _buildArcStripPath(sx1, sy1, sx2, sy2, subSagR2, thicknessPx, sideSign));
        } else {
            const polyPts = [
                sx1 + ',' + sy1,
                sx2 + ',' + sy2,
                (sx2 + nx * thicknessPx) + ',' + (sy2 + ny * thicknessPx),
                (sx1 + nx * thicknessPx) + ',' + (sy1 + ny * thicknessPx),
            ];
            strip._svgPoly.setAttribute('points', polyPts.join(' '));
        }
        strip._svgPoly.style.display = strip.visible === false ? 'none' : '';

        // Оновлюємо маркер початку
        if (strip._svgStartMarker && strip._svgStartMarker.parentNode) {
            strip._svgStartMarker.parentNode.removeChild(strip._svgStartMarker);
        }
        const markerTan = stripSagPx !== 0 ? _arcTangentAt(x1, y1, x2, y2, stripSagPx, tA) : null;
        strip._svgStartMarker = _createConstructStartMarker(sx1, sy1, markerTan ? markerTan.tx : ux, markerTan ? markerTan.ty : uy);
        strip._svgStartMarker.style.display = strip.visible === false ? 'none' : '';
        _cActiveSvg.appendChild(strip._svgStartMarker);
        (function(hi) {
            strip._svgStartMarker.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof selectHierarchyItem === 'function') selectHierarchyItem(hi);
            });
        }(strip));
    });
}

/**
 * Шукає товщину WI1 (elThickness) серед елементів ієрархії,
 * розміщених на тій самій лінії що і полоска item.
 * Порівнює геометрію лінії (x1/y1/x2/y2) з допуском.
 * Повертає число або null.
 */
function _findWI1ThicknessOnLine(item) {
    const EPS = 2; // px
    function near(a, b) { return Math.abs(a - b) < EPS; }
    const allItems = _flattenHierarchy(G.hierarchyData);
    for (let i = 0; i < allItems.length; i++) {
        const it = allItems[i];
        if (it.type !== 'element' || it.elCode !== 'WI1') continue;
        if (near(it._lineX1, item._lineX1) && near(it._lineY1, item._lineY1) &&
            near(it._lineX2, item._lineX2) && near(it._lineY2, item._lineY2)) {
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

            let dist2;
            let sagPx2 = 0;
            if (ld.lineType === 'curve') {
                const arcP2 = (typeof _parseArcParams === 'function') ? _parseArcParams(ld.elements || []) : null;
                sagPx2 = arcP2 ? arcP2.sagMeters * SCALE : 0;
                dist2 = _distToArc(svgPt.x, svgPt.y, x1, y1, x2, y2, sagPx2);
            } else {
                dist2 = _distToSegment(svgPt.x, svgPt.y, x1, y1, x2, y2);
            }
            if (dist2 < THRESH && dist2 < bestDist) {
                bestDist = dist2;
                // Сторона: cross-product вектора лінії і вектора до курсора
                const ldx = x2 - x1, ldy = y2 - y1;
                const cross = ldx * (svgPt.y - y1) - ldy * (svgPt.x - x1);
                const side = cross >= 0 ? 1 : -1;
                best = { x1, y1, x2, y2, lineData: ld, item, offX, offY, grpCTM, dropX: svgPt.x, dropY: svgPt.y, side, sagPx: sagPx2, lineType: ld.lineType };
            }
        });
    });

    // Прибираємо старий snap-highlight
    if (_wSnapEl && _wSnapEl.parentNode) _wSnapEl.parentNode.removeChild(_wSnapEl);
    _wSnapEl = null;
    _wTargetLine = best;

    if (best) {
        let el;
        if (best.lineType === 'curve' && best.sagPx) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            el.setAttribute('d', _buildArcPath(best.x1, best.y1, best.x2, best.y2, best.sagPx));
            el.setAttribute('fill', 'none');
        } else {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            el.setAttribute('x1', best.x1); el.setAttribute('y1', best.y1);
            el.setAttribute('x2', best.x2); el.setAttribute('y2', best.y2);
        }
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
    const sagPx = li.sagPx || 0;
    const isArc = li.lineType === 'curve' && sagPx !== 0;

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1) return;

    const ux = dx / len, uy = dy / len;
    const nx = -uy * side, ny = ux * side;

    // tDrop: проекція крапки кидання на хорду (апроксимація для дуги)
    const tDrop = _projectToLine(dropX, dropY, x1, y1, x2, y2);
    const winPx = _WIN_WIDTH_M * SCALE;
    const tHalf = (winPx / 2) / len;
    let tS = Math.max(0, tDrop - tHalf);
    let tE = Math.min(1, tS + winPx / len);
    tS = Math.max(0, tE - winPx / len);

    const thPx  = _WIN_THICKNESS_M * SCALE;
    const elStartM = parseFloat((tS * len / SCALE).toFixed(3));
    const elEndM   = parseFloat((tE * len / SCALE).toFixed(3));

    // Для дуги: стартова точка і кінцева — на дузі, а не на хорді
    let sx, sy, sx2w, sy2w, wSubSag;
    if (isArc) {
        const ptWS = _arcPointAt(x1, y1, x2, y2, sagPx, tS);
        const ptWE = _arcPointAt(x1, y1, x2, y2, sagPx, tE);
        sx = ptWS.x; sy = ptWS.y;
        sx2w = ptWE.x; sy2w = ptWE.y;
        wSubSag = _subArcSag(x1, y1, x2, y2, sagPx, tS, tE);
    } else {
        sx = x1 + ux * tS * len; sy = y1 + uy * tS * len;
        sx2w = x1 + ux * tE * len; sy2w = y1 + uy * tE * len;
        wSubSag = 0;
    }
    const elen = Math.sqrt((sx2w-sx)**2+(sy2w-sy)**2);

    // Малюємо <g> з WI1
    const grp = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const newId = G.hierarchyIdCounter++;
    grp.setAttribute('data-hierarchy-id', String(newId));
    _drawWI1Svg(grp, sx, sy, sx2w, sy2w, side, thPx, wSubSag);

    // Вікно малюємо ПРЯМО в SVG (не в групу фігури), щоб воно завжди було ВИЩЕ полосок
    _wActiveSvg.appendChild(grp);

    // Реєструємо в ієрархії
    const winCount = G.hierarchyData.filter(function(i) { return i.type === 'element' && i.elCode === 'WI1'; }).length + 1;
    const hItem = {
        id:              newId,
        type:            'element',
        name:            'Вікно ' + (lineData.from || '?') + '-' + (lineData.isClosing ? '1' : (lineData.to || '?')),
        elCode:          'WI1',
        elStart:         elStartM,
        elEnd:           elEndM,
        elSide:          side,
        elThickness:     _WIN_THICKNESS_M,
        windowAutoWidth: false,
        lineFrom:        lineData.from,
        lineTo:          lineData.isClosing ? null : lineData.to,
        _hostLineId:     lineData.id,
        _elKey:          'wi_drag_' + newId,
        _hostItemId:     item.id,
        svgGroup:        grp,
        children:        [],
        expanded:        false,
        parentId:        item.id,
        // Геометрія лінії для перемалювання
        _lineX1: x1, _lineY1: y1, _lineX2: x2, _lineY2: y2,
        _side:   side,
        _sagPx:  isArc ? sagPx : 0,
    };

    // Вставляємо тріплет у lineData.elements батьківської фігури
    if (!lineData.elements) lineData.elements = [];
    const codeStr = side === -1 ? '-WI1' : 'WI1';
    lineData.elements.push({ type: 'number', value: elStartM });
    lineData.elements.push({ type: 'number', value: elEndM   });
    lineData.elements.push({ type: 'element', value: codeStr  });

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

/**
 * Малює WI1 у SVG-групу.
 * sx1,sy1 — початок вікна на лінії/дузі (вже на дузі якщо arc).
 * sx2,sy2 — кінець вікна.
 * side: +1=нормаль вліво, -1=вправо.
 * thPx — товщина в пікселях.
 * sagPx — висота дуги підсегмента (0=пряма).
 */
function _drawWI1Svg(target, sx1, sy1, sx2, sy2, side, thPx, sagPx) {
    const isArc = sagPx && sagPx !== 0;

    if (isArc) {
        // Контур: closed path з двох концентричних дуг + прямі торці
        const outerD = _buildArcStripPath(sx1, sy1, sx2, sy2, sagPx, thPx, side);
        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hit.setAttribute('d', outerD);
        hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none');
        target.appendChild(hit);
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        rect.setAttribute('d', outerD);
        rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', 'black');
        rect.setAttribute('stroke-width', '1'); rect.setAttribute('vector-effect', 'non-scaling-stroke');
        target.appendChild(rect);
        // Середня дуга (sag половина товщини)
        const c = _arcCircle(sx1, sy1, sx2, sy2, sagPx);
        if (c) {
            const normalSign = (c.Rs > 0 ? 1 : -1) * side;
            const midR = c.R + normalSign * thPx / 2;
            if (midR > 0) {
                const angA = c.angA, angB = c.angB;
                const m1x = c.cx + midR * Math.cos(angA), m1y = c.cy + midR * Math.sin(angA);
                const m2x = c.cx + midR * Math.cos(angB), m2y = c.cy + midR * Math.sin(angB);
                const midSag = sagPx + normalSign * thPx / 2;
                const midPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                midPath.setAttribute('d', _buildArcPath(m1x, m1y, m2x, m2y, midSag));
                midPath.setAttribute('fill', 'none'); midPath.setAttribute('stroke', 'black');
                midPath.setAttribute('stroke-width', '1'); midPath.setAttribute('vector-effect', 'non-scaling-stroke');
                target.appendChild(midPath);
            }
        }
        return;
    }

    // Пряма версія
    const dx = sx2-sx1, dy = sy2-sy1;
    const elen = Math.sqrt(dx*dx+dy*dy);
    if (elen < 1) return;
    const ux = dx/elen, uy = dy/elen;
    const nx = -uy * side, ny = ux * side;
    const c1x = sx1, c1y = sy1;
    const c2x = sx2, c2y = sy2;
    const c3x = c2x + nx * thPx, c3y = c2y + ny * thPx;
    const c4x = c1x + nx * thPx, c4y = c1y + ny * thPx;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    hit.setAttribute('points', [c1x+','+c1y, c2x+','+c2y, c3x+','+c3y, c4x+','+c4y].join(' '));
    hit.setAttribute('fill', 'transparent'); hit.setAttribute('stroke', 'none');
    target.appendChild(hit);
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    rect.setAttribute('points', [c1x+','+c1y, c2x+','+c2y, c3x+','+c3y, c4x+','+c4y].join(' '));
    rect.setAttribute('fill', 'none'); rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '1'); rect.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(rect);
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
    elItem._side = side;

    // Якщо авто-товщина — вимірюємо перпендикулярну відстань до найближчої паралельної стіни
    if (elItem.windowAutoThickness) {
        const autoTh = _computeAutoWindowThickness(elItem);
        if (autoTh !== null) {
            elItem.elThickness = autoTh;
        }
    }

    const thPx = (elItem.elThickness || _WIN_THICKNESS_M) * SCALE;
    const sagPxW = elItem._sagPx || 0;

    // Параметри t на хорді
    const tS = elItem.elFromEnd ? ((len - elItem.elEnd * SCALE) / len) : (elItem.elStart * SCALE / len);
    const tE = elItem.elFromEnd ? ((len - elItem.elStart * SCALE) / len) : (elItem.elEnd * SCALE / len);

    let wsx1, wsy1, wsx2, wsy2, wSubSag;
    if (sagPxW !== 0) {
        const ptWS = _arcPointAt(x1, y1, x2, y2, sagPxW, tS);
        const ptWE = _arcPointAt(x1, y1, x2, y2, sagPxW, tE);
        wsx1 = ptWS.x; wsy1 = ptWS.y;
        wsx2 = ptWE.x; wsy2 = ptWE.y;
        wSubSag = _subArcSag(x1, y1, x2, y2, sagPxW, tS, tE);
    } else {
        wsx1 = x1 + ux * tS * len; wsy1 = y1 + uy * tS * len;
        wsx2 = x1 + ux * tE * len; wsy2 = y1 + uy * tE * len;
        wSubSag = 0;
    }

    while (elItem.svgGroup.firstChild) elItem.svgGroup.removeChild(elItem.svgGroup.firstChild);
    _drawWI1Svg(elItem.svgGroup, wsx1, wsy1, wsx2, wsy2, side, thPx, wSubSag);
};

/**
 * Обчислює автоматичну товщину вікна WI1 як перпендикулярну відстань від
 * хост-лінії до найближчої паралельної (або майже паралельної) лінії ІНШОЇ фігури
 * в напрямку нормалі з урахуванням сторони elSide.
 * Повертає товщину в метрах або null.
 */
function _computeAutoWindowThickness(elItem) {
    const x1 = elItem._lineX1, y1 = elItem._lineY1;
    const x2 = elItem._lineX2, y2 = elItem._lineY2;
    const len = Math.sqrt((x2-x1)**2 + (y2-y1)**2);
    if (len < 1) return null;

    const ux = (x2-x1)/len, uy = (y2-y1)/len;
    // Нормаль залежно від сторони вікна
    const side = elItem.elSide != null ? elItem.elSide : 1;
    // side=1 → нормаль вліво: nx=-uy,ny=ux; side=-1 → вправо: nx=uy,ny=-ux
    const nx = -uy * side, ny = ux * side;

    // Середина вікна на хост-лінії — звідси стріляємо промінь по нормалі
    const tMid = ((elItem.elStart + elItem.elEnd) / 2) * SCALE / len;
    const midX = x1 + ux * tMid * len;
    const midY = y1 + uy * tMid * len;

    const parentId = elItem.parentId != null ? elItem.parentId : null;
    const COS15 = Math.cos(15 * Math.PI / 180); // cos(15°) — допуск паралельності
    const RAY_LEN = 5000; // довжина променя в px

    let minDist = Infinity;

    const activeSvg = _wActiveSvg || _cActiveSvg;
    const allItems = _flattenHierarchy(G.hierarchyData);

    allItems.forEach(function(it) {
        if (!it.figureLines || !it.shapePoints) return;
        if (it.id === parentId) return; // пропускаємо власну фігуру

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

            const llen = Math.sqrt((lx2-lx1)**2 + (ly2-ly1)**2);
            if (llen < 1) return;
            const lux = (lx2-lx1)/llen, luy = (ly2-ly1)/llen;

            // Перевіряємо паралельність: |dot| > cos15°
            const dot = Math.abs(ux * lux + uy * luy);
            if (dot < COS15) return;

            // Перетин променя [midX,midY] → [midX+nx*RAY_LEN, midY+ny*RAY_LEN]
            // з відрізком іншої лінії
            const t = _segmentIntersectT(
                midX, midY, midX + nx * RAY_LEN, midY + ny * RAY_LEN,
                lx1, ly1, lx2, ly2
            );
            if (t === null) return;

            const dist = t * RAY_LEN;
            if (dist > 0.5 && dist < minDist) minDist = dist;
        });
    });

    if (!isFinite(minDist) || minDist < 0.5) return null;
    return parseFloat((minDist / SCALE).toFixed(4));
}

/**
 * Перераховує абсолютну SVG-геометрію (_lineX1/Y1/X2/Y2) і перемальовує
 * всі конструктиви та drag-вікна прив'язані до фігури hostItem.
 * Викликається після переміщення або обертання фігури.
 */
window._updateConstructsForItem = function(hostItem) {
    if (!hostItem) return;
    const activeSvg = _cActiveSvg ||
        (function() {
            const canvas = window.canvasManager?.canvases.find(c => c.id === window.canvasManager?.activeCanvasId);
            return canvas ? document.querySelector('[data-canvas-id="' + canvas.id + '"] svg') : null;
        })();
    if (!activeSvg) return;

    // Тимчасово встановлюємо _cActiveSvg щоб _redrawConstructItem міг додавати маркери
    const prevCActiveSvg = _cActiveSvg;
    _cActiveSvg = activeSvg;

    let grpCTM = null;
    try {
        const ss = activeSvg.getScreenCTM(), gs = hostItem.svgGroup && hostItem.svgGroup.getScreenCTM();
        if (ss && gs) grpCTM = ss.inverse().multiply(gs);
    } catch(e) {}

    const offX = hostItem._offsetX || 0;
    const offY = hostItem._offsetY || 0;

    function toSvg(lx, ly) {
        if (grpCTM) return _applyMatrix(grpCTM, lx, ly);
        return { x: lx, y: ly };
    }

    const allFlat = _flattenHierarchy(G.hierarchyData);
    allFlat.forEach(function(it) {
        if (it._hostItemId !== hostItem.id) return;
        const lineData = (hostItem.figureLines || []).find(function(l) { return l.id === it._hostLineId; });
        if (!lineData) return;
        const fp = hostItem.shapePoints.find(function(p) { return p.num === lineData.from; });
        const tp = lineData.isClosing ? hostItem.shapePoints[0] : hostItem.shapePoints.find(function(p) { return p.num === lineData.to; });
        if (!fp || !tp) return;
        const svgP1 = toSvg(fp.x + offX, fp.y + offY);
        const svgP2 = toSvg(tp.x + offX, tp.y + offY);
        it._lineX1 = svgP1.x; it._lineY1 = svgP1.y;
        it._lineX2 = svgP2.x; it._lineY2 = svgP2.y;
        if (it.type === 'construct') {
            if (typeof _redrawConstructItem === 'function') _redrawConstructItem(it);
        } else if (it.type === 'element' && it.elCode === 'WI1') {
            if (typeof _redrawWindowElement === 'function') _redrawWindowElement(it);
        }
    });

    _cActiveSvg = prevCActiveSvg;
};

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
