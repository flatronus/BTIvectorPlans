/**
 * svg-primitives.js — Низькорівневі SVG-хелпери.
 * Залежності: constants.js, g.js
 */

window._renderSvgLine = function (svg, x1, y1, x2, y2, id) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', 'black');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    if (id !== undefined) line.setAttribute('id', `line-${id}`);
    svg.appendChild(line);
};

window._renderSvgDashedLine = function (svg, x1, y1, x2, y2, id) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#888');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '6 4');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    if (id !== undefined) line.setAttribute('id', 'diag-' + id);
    svg.appendChild(line);
};

/**
 * Будує рядок SVG-шляху дуги між (x1,y1)→(x2,y2) з висотою sag (опуклість).
 * sag > 0 — дуга відхиляється ліворуч від напрямку руху (відносно лінії start→end),
 * sag < 0 — праворуч.
 * Повертає рядок 'd' для <path>.
 */
window._buildArcPath = function (x1, y1, x2, y2, sag) {
    if (!sag || sag === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return `M ${x1} ${y1} L ${x2} ${y2}`;
    // Перпендикуляр (ліворуч від напрямку)
    const px = -dy / len, py = dx / len;
    // Радіус кола за формулою: R = (chord²/4 + sag²) / (2*sag)
    const chord = len;
    const R = (chord * chord / 4 + sag * sag) / (2 * sag);
    // large-arc-flag: 0 якщо |sag| < |R| (менша дуга)
    const largeArc = Math.abs(sag) > Math.abs(R) ? 1 : 0;
    const sweep = sag > 0 ? 1 : 0;
    return `M ${x1} ${y1} A ${Math.abs(R)} ${Math.abs(R)} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
};

/**
 * Малює SVG дугу між (x1,y1)→(x2,y2) з висотою sag (у пікселях).
 */
window._renderSvgArc = function (svg, x1, y1, x2, y2, sag, id) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', _buildArcPath(x1, y1, x2, y2, sag));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'black');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    if (id !== undefined) path.setAttribute('id', `line-${id}`);
    svg.appendChild(path);
};

/**
 * Витягує параметри дуги з parsedData.elements для lineType === 'curve'.
 * Формат elements: [ширина_хорди(число), ...елементи..., висота_дуги(число)]
 * Повертає { chordWidth, sagMeters } або null якщо недостатньо даних.
 * chordWidth = перше число в elements (в метрах).
 * sagMeters  = останнє число в elements (в метрах), зі знаком (+ ліворуч, - праворуч).
 */
window._parseArcParams = function (elements) {
    const nums = [];
    const numIdx = [];
    elements.forEach(function(el, i) {
        if (el.type === 'number') { nums.push(el.value); numIdx.push(i); }
    });
    if (nums.length < 2) return null;
    return { chordWidth: nums[0], sagMeters: nums[nums.length - 1] };
};

window._renderSvgPoint = function (svg, x, y, num) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x); circle.setAttribute('cy', y);
    circle.setAttribute('r', '5'); circle.setAttribute('fill', '#e53935');
    svg.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + 10); text.setAttribute('y', y - 5);
    text.setAttribute('font-size', '16'); text.setAttribute('fill', '#e53935');
    text.setAttribute('font-weight', 'bold');
    text.textContent = num;
    svg.appendChild(text);
};

window._makeSvgText = function (x, y, content, rotateAngle, fontSize) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', y);
    text.setAttribute('font-size', fontSize != null ? String(fontSize) : String(DEFAULT_FONT_SIZE_MM * FONT_MM_TO_PX));
    text.setAttribute('fill', 'black');
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    if (rotateAngle !== undefined) {
        text.setAttribute('transform', `rotate(${rotateAngle}, ${x}, ${y})`);
    }
    text.textContent = content;
    return text;
};

window.renderStartPoint = function (svg) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', START_X); circle.setAttribute('cy', START_Y);
    circle.setAttribute('r', '5'); circle.setAttribute('fill', '#e53935');
    svg.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', START_X + 10); text.setAttribute('y', START_Y - 5);
    text.setAttribute('font-size', '16'); text.setAttribute('fill', '#e53935');
    text.setAttribute('font-weight', 'bold');
    text.textContent = '1';
    svg.appendChild(text);
};

window.resetSvgCanvas = function (svg) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', '0 0 800 600');
    G.shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
    renderStartPoint(svg);
};

window.buildRoomNumberText = function (cx, cy, number, fontSize) {
    const parts = number.split('-');
    const text  = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('id', 'room-number');
    text.setAttribute('x', cx); text.setAttribute('y', cy);
    text.setAttribute('font-size', fontSize != null ? String(fontSize) : String(DEFAULT_FONT_SIZE_MM * FONT_MM_TO_PX));
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');

    if (parts.length >= 2 && parts[0] && parts[1]) {
        const s1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        s1.setAttribute('fill', '#e53935'); s1.textContent = parts[0]; text.appendChild(s1);
        const s2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        s2.setAttribute('fill', 'black');   s2.textContent = '-';      text.appendChild(s2);
        const s3 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        s3.setAttribute('fill', 'black');   s3.textContent = parts[1]; text.appendChild(s3);
    } else {
        text.setAttribute('fill', 'black');
        text.textContent = number;
    }

    return text;
};

/**
 * Будує конструкцію-дріб: номер кімнати / площа.
 * @param {number} cx, cy — центр кімнати (SVG-координати)
 * @param {string} number  — номер кімнати (напр. "1-1")
 * @param {string|number} area — площа кімнати (напр. "12.3")
 * @param {'inline'|'leader'} style — 'inline' (всередині кімнати) або 'leader' (виносна)
 * @param {number} leaderDx, leaderDy — зміщення виносної точки від центру (px), лише для 'leader'
 * @returns {SVGElement} — <g> з усіма елементами конструкції
 */
/**
 * buildRoomLabel — конструкція-дріб: номер/площа.
 * @param {number} cx, cy        — центр кімнати (SVG px)
 * @param {string} number        — номер кімнати
 * @param {string|number} area   — площа
 * @param {'inline'|'leader'} style
 * @param {number} leaderDx, leaderDy — поточне зміщення підпису від центру (для 'leader')
 * @param {function} onMove(dx,dy) — callback при drag; отримує АБСОЛЮТНЕ зміщення від cx,cy
 * @returns {SVGGElement}
 */
window.buildRoomLabel = function (cx, cy, number, area, style, leaderDx, leaderDy, onMove, fontSize) {
    const NS = 'http://www.w3.org/2000/svg';
    const g  = document.createElementNS(NS, 'g');
    g.setAttribute('data-room-label', '1');
    // Зберігаємо початковий центр фігури для counter-rotate при обертанні
    g.setAttribute('data-label-cx', cx);
    g.setAttribute('data-label-cy', cy);
    g.style.cursor = 'move';

    const _fs  = fontSize != null ? fontSize : DEFAULT_FONT_SIZE_MM * FONT_MM_TO_PX;
    const lineH    = _fs + 2;
    const lineLen  = Math.max(20, _fs * 2.3 | 0);

    // Поточне зміщення підпису (може змінюватись drag-ом)
    let _curDx = leaderDx || 0;
    let _curDy = leaderDy || 0;
    // Поточний центр фігури (може оновлюватись після rotate через _updateCenter)
    let _cx = cx;
    let _cy = cy;

    // Якщо немає площі — просто номер кімнати
    if (!area) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', cx); t.setAttribute('y', cy);
        t.setAttribute('font-size', _fs);
        t.setAttribute('font-weight', 'bold');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('fill', '#e53935');
        t.textContent = number;
        g.appendChild(t);
        _attachRoomLabelDrag(g, cx, cy, leaderDx || 0, leaderDy || 0, onMove);
        return g;
    }

    function _rebuild(dx, dy) {
        _curDx = dx;
        _curDy = dy;
        // Очищаємо групу і перебудовуємо з новими координатами
        while (g.firstChild) g.removeChild(g.firstChild);

        const lx = _cx + dx;
        const ly = _cy + dy;

        if (style === 'leader') {
            // Кружок у центрі кімнати
            const dot = document.createElementNS(NS, 'circle');
            dot.setAttribute('cx', _cx); dot.setAttribute('cy', _cy);
            dot.setAttribute('r', '2');
            dot.setAttribute('fill', '#555');
            dot.style.pointerEvents = 'none';
            g.appendChild(dot);

            // Виносна лінія: від центру кімнати до ЛІВОГО кінця риски
            const rulerLeft = lx - lineLen / 2;
            const leaderLine = document.createElementNS(NS, 'line');
            leaderLine.setAttribute('x1', _cx);       leaderLine.setAttribute('y1', _cy);
            leaderLine.setAttribute('x2', rulerLeft); leaderLine.setAttribute('y2', ly);
            leaderLine.setAttribute('stroke', '#555');
            leaderLine.setAttribute('stroke-width', '0.8');
            leaderLine.setAttribute('vector-effect', 'non-scaling-stroke');
            leaderLine.style.pointerEvents = 'none';
            g.appendChild(leaderLine);
        }

        // Номер кімнати (зверху від риски)
        const numText = document.createElementNS(NS, 'text');
        numText.setAttribute('x', lx);
        numText.setAttribute('y', ly - lineH / 2 - 1);
        numText.setAttribute('font-size', _fs);
        numText.setAttribute('font-weight', 'bold');
        numText.setAttribute('text-anchor', 'middle');
        numText.setAttribute('dominant-baseline', 'auto');
        numText.setAttribute('fill', '#e53935');
        numText.textContent = number;
        numText.style.pointerEvents = 'none';
        g.appendChild(numText);

        // Розділова риска
        const ruler = document.createElementNS(NS, 'line');
        ruler.setAttribute('x1', lx - lineLen / 2); ruler.setAttribute('y1', ly);
        ruler.setAttribute('x2', lx + lineLen / 2); ruler.setAttribute('y2', ly);
        ruler.setAttribute('stroke', 'black');
        ruler.setAttribute('stroke-width', '1');
        ruler.setAttribute('vector-effect', 'non-scaling-stroke');
        ruler.style.pointerEvents = 'none';
        g.appendChild(ruler);

        // Площа (знизу від риски)
        const areaText = document.createElementNS(NS, 'text');
        areaText.setAttribute('x', lx);
        areaText.setAttribute('y', ly + lineH / 2 + 1);
        areaText.setAttribute('font-size', _fs);
        areaText.setAttribute('font-weight', 'bold');
        areaText.setAttribute('text-anchor', 'middle');
        areaText.setAttribute('dominant-baseline', 'hanging');
        areaText.setAttribute('fill', 'black');
        areaText.textContent = String(area);
        areaText.style.pointerEvents = 'none';
        g.appendChild(areaText);

        // Прозора підкладка для зручного кліку/drag
        const hit = document.createElementNS(NS, 'rect');
        hit.setAttribute('x', lx - lineLen / 2 - 4);
        hit.setAttribute('y', ly - lineH - 4);
        hit.setAttribute('width',  lineLen + 8);
        hit.setAttribute('height', lineH * 2 + 8);
        hit.setAttribute('fill', 'transparent');
        hit.setAttribute('stroke', 'none');
        g.appendChild(hit);
    }

    /**
     * Оновлює центр фігури (при обертанні/переміщенні) і перебудовує вміст.
     * newCx, newCy — новий центр в локальній системі групи.
     */
    g._updateCenter = function(newCx, newCy) {
        _cx = newCx;
        _cy = newCy;
        g.setAttribute('data-label-cx', newCx);
        g.setAttribute('data-label-cy', newCy);
        _rebuild(_curDx, _curDy);
    };

    _rebuild(leaderDx || 0, leaderDy || 0);
    _attachRoomLabelDrag(g, cx, cy, leaderDx || 0, leaderDy || 0, onMove, _rebuild);
    return g;
};

/**
 * Прив'язує drag-обробники (миша + дотик) до групи підпису кімнати.
 * При перетягуванні викликає onMove(newDx, newDy) і rebuild(newDx, newDy).
 */
function _attachRoomLabelDrag(g, cx, cy, initDx, initDy, onMove, rebuild) {
    if (!onMove && !rebuild) return;

    let dragging  = false;
    let startX    = 0, startY    = 0;
    let baseDx    = initDx, baseDy = initDy;

    function _getSvgPoint(clientX, clientY) {
        const svg = g.ownerSVGElement;
        if (!svg) return { x: clientX, y: clientY };
        const pt = svg.createSVGPoint();
        pt.x = clientX; pt.y = clientY;
        try { return pt.matrixTransform(svg.getScreenCTM().inverse()); }
        catch(e) { return { x: clientX, y: clientY }; }
    }

    function onPointerDown(clientX, clientY, e) {
        e.stopPropagation();
        e.preventDefault();
        dragging = true;
        const sp = _getSvgPoint(clientX, clientY);
        startX = sp.x; startY = sp.y;
        baseDx = initDx; baseDy = initDy;
    }

    function onPointerMove(clientX, clientY) {
        if (!dragging) return;
        const sp  = _getSvgPoint(clientX, clientY);
        const ndx = baseDx + (sp.x - startX);
        const ndy = baseDy + (sp.y - startY);
        initDx = ndx; initDy = ndy;
        startX = sp.x; startY = sp.y;
        baseDx = ndx;  baseDy = ndy;
        if (rebuild) rebuild(ndx, ndy);
        if (onMove)  onMove(ndx, ndy);
    }

    function onPointerUp() { dragging = false; }

    // Миша
    g.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;
        onPointerDown(e.clientX, e.clientY, e);
    });
    document.addEventListener('mousemove', function(e) { if (dragging) onPointerMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup',   onPointerUp);

    // Дотик
    g.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;
        onPointerDown(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });
    document.addEventListener('touchmove', function(e) {
        if (!dragging || e.touches.length !== 1) return;
        e.preventDefault();
        onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    document.addEventListener('touchend', onPointerUp);
}
