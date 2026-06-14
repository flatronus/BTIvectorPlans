/**
 * elements-on-line.js — Малювання архітектурних елементів на лінії (WI1 тощо).
 * Залежності: constants.js, svg-primitives.js
 */

window.drawElementsOnLine = function (parsedData, x1, y1, x2, y2, scale, targetGroup, overrideThickness) {
    const svg       = targetGroup || document.getElementById('shapeCanvas');
    const thickness = (overrideThickness !== undefined ? overrideThickness : ELEMENT_THICKNESS) * scale;

    const dx  = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;

    const ux = dx / len, uy = dy / len;
    const px = uy,       py = -ux;

    // Дуга: визначаємо висоту дуги (sag) у пікселях, якщо лінія дугова
    let sagPx = 0;
    if (parsedData.lineType === 'curve' && typeof _parseArcParams === 'function') {
        const arcP = _parseArcParams(parsedData.elements || []);
        sagPx = arcP ? arcP.sagMeters * scale : 0;
    }

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

            const elen = end - start;

            if (code === 'WI1') {
                if (sagPx) {
                    const tStart = start / len, tEnd = end / len;
                    const ptA = _arcPointAt(x1, y1, x2, y2, sagPx, tStart);
                    const ptB = _arcPointAt(x1, y1, x2, y2, sagPx, tEnd);
                    const subSag = _subArcSag(x1, y1, x2, y2, sagPx, tStart, tEnd);
                    _drawWI1Arc(svg, ptA.x, ptA.y, ptB.x, ptB.y, side, thickness, subSag);
                } else {
                    const sx = x1 + ux * start;
                    const sy = y1 + uy * start;
                    _drawWI1(svg, sx, sy, ux, uy, px, py, elen, thickness, side);
                }
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

/**
 * Малює WI1 на дузі: контур (концентричні дуги внутр./зовн. радіусів) + середня дуга.
 * sx1,sy1 → sx2,sy2 — точки на внутрішній дузі (на лінії стіни); subSagPx — висота
 * піддуги між цими точками; side — сторона ('-' префікс коду WI1 у даних лінії);
 * thPx — товщина у пікселях.
 * Нормаль обчислюється через _arcNormalAt і узгоджена зі знаком side так само,
 * як у прямій версії _drawWI1 (px=uy, py=-ux, зміщення = (px,py)*side).
 */
function _drawWI1Arc(target, sx1, sy1, sx2, sy2, side, thPx, subSagPx) {
    if (!subSagPx || subSagPx === 0) {
        // Виродковий випадок (нульова піддуга) — пряма
        const dx = sx2-sx1, dy = sy2-sy1;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const ux = dx/len, uy = dy/len;
        const px = uy, py = -ux;
        _drawWI1(target, sx1, sy1, ux, uy, px, py, len, thPx, side);
        return;
    }
    // side_param = -side: див. узгодження знаків нормалі з _arcNormalAt
    const outerD = _buildArcStripPath(sx1, sy1, sx2, sy2, subSagPx, thPx, -side);

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rect.setAttribute('d', outerD);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '1');
    rect.setAttribute('vector-effect', 'non-scaling-stroke');
    target.appendChild(rect);

    const c = _arcCircle(sx1, sy1, sx2, sy2, subSagPx);
    if (c) {
        const normalSign = (c.Rs > 0 ? 1 : -1) * (-side);
        const midR = c.R + normalSign * thPx / 2;
        if (midR > 0) {
            const angA = c.angA, angB = c.angB;
            const m1x = c.cx + midR * Math.cos(angA), m1y = c.cy + midR * Math.sin(angA);
            const m2x = c.cx + midR * Math.cos(angB), m2y = c.cy + midR * Math.sin(angB);
            const largeArc = Math.abs(subSagPx) > c.R ? 1 : 0;
            const midPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            midPath.setAttribute('d', 'M '+m1x+','+m1y+' A '+midR+','+midR+' 0 '+largeArc+' '+c.sweep+' '+m2x+','+m2y);
            midPath.setAttribute('fill', 'none');
            midPath.setAttribute('stroke', 'black');
            midPath.setAttribute('stroke-width', '1');
            midPath.setAttribute('vector-effect', 'non-scaling-stroke');
            target.appendChild(midPath);
        }
    }
}
