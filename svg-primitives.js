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

window._makeSvgText = function (x, y, content, rotateAngle) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x); text.setAttribute('y', y);
    text.setAttribute('font-size', '12');
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

window.buildRoomNumberText = function (cx, cy, number) {
    const parts = number.split('-');
    const text  = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('id', 'room-number');
    text.setAttribute('x', cx); text.setAttribute('y', cy);
    text.setAttribute('font-size', '12');
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
window.buildRoomLabel = function (cx, cy, number, area, style, leaderDx, leaderDy) {
    const NS = 'http://www.w3.org/2000/svg';
    const g  = document.createElementNS(NS, 'g');
    g.setAttribute('data-room-label', '1');

    const fontSize  = 12;
    const lineH     = fontSize + 2;   // висота рядка
    const lineLen   = 28;             // довжина розділової риски (px)

    // Якщо немає площі — просто номер кімнати по центру
    if (!area) {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', cx); t.setAttribute('y', cy);
        t.setAttribute('font-size', fontSize);
        t.setAttribute('font-weight', 'bold');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('fill', '#e53935');
        t.textContent = number;
        g.appendChild(t);
        return g;
    }

    // Позиція підпису: при виносному стилі — зміщення
    let lx = cx, ly = cy;
    if (style === 'leader') {
        lx = cx + (leaderDx || 40);
        ly = cy + (leaderDy || -30);
        // Виносна лінія від центру кімнати до підпису
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', cx); line.setAttribute('y1', cy);
        line.setAttribute('x2', lx); line.setAttribute('y2', ly);
        line.setAttribute('stroke', '#333');
        line.setAttribute('stroke-width', '0.8');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        g.appendChild(line);
        // Кружок у центрі кімнати
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', cx); dot.setAttribute('cy', cy);
        dot.setAttribute('r', '2');
        dot.setAttribute('fill', '#333');
        g.appendChild(dot);
    }

    // Номер кімнати (зверху)
    const numText = document.createElementNS(NS, 'text');
    numText.setAttribute('x', lx);
    numText.setAttribute('y', ly - lineH / 2 - 1);
    numText.setAttribute('font-size', fontSize);
    numText.setAttribute('font-weight', 'bold');
    numText.setAttribute('text-anchor', 'middle');
    numText.setAttribute('dominant-baseline', 'auto');
    numText.setAttribute('fill', '#e53935');
    numText.textContent = number;
    g.appendChild(numText);

    // Розділова риска
    const ruler = document.createElementNS(NS, 'line');
    ruler.setAttribute('x1', lx - lineLen / 2); ruler.setAttribute('y1', ly);
    ruler.setAttribute('x2', lx + lineLen / 2); ruler.setAttribute('y2', ly);
    ruler.setAttribute('stroke', 'black');
    ruler.setAttribute('stroke-width', '0.8');
    ruler.setAttribute('vector-effect', 'non-scaling-stroke');
    g.appendChild(ruler);

    // Площа (знизу)
    const areaText = document.createElementNS(NS, 'text');
    areaText.setAttribute('x', lx);
    areaText.setAttribute('y', ly + lineH / 2 + 1);
    areaText.setAttribute('font-size', fontSize);
    areaText.setAttribute('font-weight', 'bold');
    areaText.setAttribute('text-anchor', 'middle');
    areaText.setAttribute('dominant-baseline', 'hanging');
    areaText.setAttribute('fill', 'black');
    areaText.textContent = String(area);
    g.appendChild(areaText);

    return g;
};
