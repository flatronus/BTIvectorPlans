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
    if (id !== undefined) line.setAttribute('id', `line-${id}`);
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
