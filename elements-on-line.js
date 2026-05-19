/**
 * elements-on-line.js — Малювання архітектурних елементів на лінії (WI1 тощо).
 * Залежності: constants.js, svg-primitives.js
 */

window.drawElementsOnLine = function (parsedData, x1, y1, x2, y2, scale, targetGroup) {
    const svg       = targetGroup || document.getElementById('shapeCanvas');
    const thickness = ELEMENT_THICKNESS * scale;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const ux = dx / len, uy = dy / len;
    const px = uy,       py = -ux;

    const elements = parsedData.elements || [];

    for (let i = 0; i < elements.length; i++) {
        if (elements[i].type      === 'number' &&
            elements[i + 1]?.type === 'number' &&
            elements[i + 2]?.type === 'element') {

            const start = elements[i].value     * scale;
            const end   = elements[i + 1].value * scale;
            let code    = elements[i + 2].value;

            let side = 1;
            if (code.startsWith('-')) { side = -1; code = code.substring(1); }

            const sx   = x1 + ux * start;
            const sy   = y1 + uy * start;
            const elen = end - start;

            if (code === 'WI1') {
                _drawWI1(svg, sx, sy, ux, uy, px, py, elen, thickness, side);
            }

            i += 2;
        }
    }
};

function _drawWI1(target, sx, sy, ux, uy, px, py, elen, thickness, side) {
    const c1x = sx,               c1y = sy;
    const c2x = sx + ux * elen,   c2y = sy + uy * elen;
    const c3x = c2x + px * thickness * side, c3y = c2y + py * thickness * side;
    const c4x = sx  + px * thickness * side, c4y = sy  + py * thickness * side;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    rect.setAttribute('points', `${c1x},${c1y} ${c2x},${c2y} ${c3x},${c3y} ${c4x},${c4y}`);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(rect);

    const midStartX = sx  + px * (thickness / 2) * side;
    const midStartY = sy  + py * (thickness / 2) * side;
    const midEndX   = c2x + px * (thickness / 2) * side;
    const midEndY   = c2y + py * (thickness / 2) * side;

    const midLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    midLine.setAttribute('x1', midStartX); midLine.setAttribute('y1', midStartY);
    midLine.setAttribute('x2', midEndX);   midLine.setAttribute('y2', midEndY);
    midLine.setAttribute('stroke', 'black');
    midLine.setAttribute('stroke-width', '1');
    midLine.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(midLine);
}
