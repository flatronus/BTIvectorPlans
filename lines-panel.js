/**
 * lines-panel.js — Панель списку ліній у shapeModal.
 * Залежності: state.js, g.js, shape-editor.js, toast.js
 */

window.updateLinesList = function () {
    const linesList = document.getElementById('linesList');
    linesList.innerHTML = '';

    linesList.appendChild(_makeCheckboxRow(
        'buildingTypeCheckbox', 'Будівля', G.isBuilding, toggleBuildingType
    ));

    linesList.appendChild(_makeCheckboxRow(
        'dimensionSideCheckbox', 'Розміри ззовні', G.dimensionsOutside, toggleDimensionSide
    ));

    // Збереження / відновлення поля номера приміщення між перемалюваннями
    const existingInput = document.getElementById('roomNumberInput');
    if (existingInput) {
        G.roomNumberInputValue          = existingInput.value;
        G.roomNumberInputFocused        = document.activeElement === existingInput;
        G.roomNumberInputSelectionStart = existingInput.selectionStart;
        G.roomNumberInputSelectionEnd   = existingInput.selectionEnd;
    }

    linesList.appendChild(_makeRoomNumberRow());

    setTimeout(() => {
        const inp = document.getElementById('roomNumberInput');
        if (G.roomNumberInputFocused && inp) {
            inp.focus();
            try { inp.setSelectionRange(G.roomNumberInputSelectionStart, G.roomNumberInputSelectionEnd); }
            catch { inp.setSelectionRange(inp.value.length, inp.value.length); }
        }
    }, 0);

    // Площа
    if (appState.calculatedArea) {
        const areaDisplay = document.createElement('div');
        areaDisplay.style.cssText = 'padding: 8px; background: #e8f5e9; border: 1px solid #4CAF50; border-radius: 4px; margin-bottom: 10px; font-weight: bold; font-size: 12px; text-align: center;';
        areaDisplay.textContent   = 'S = ' + appState.calculatedArea + ' м²';
        linesList.appendChild(areaDisplay);

        const areaInputWrap = document.createElement('div');
        areaInputWrap.style.cssText = 'padding: 8px; background: #fff3e0; border: 1px solid #FF9800; border-radius: 4px; margin-bottom: 10px;';

        const areaLabel = document.createElement('div');
        areaLabel.style.cssText = 'font-weight: bold; font-size: 10px; margin-bottom: 5px; text-align: center;';
        areaLabel.textContent   = "S' (редагована):";
        areaInputWrap.appendChild(areaLabel);

        const areaInput = document.createElement('input');
        areaInput.type      = 'number';
        areaInput.inputMode = 'decimal';
        areaInput.step      = '0.1';
        areaInput.value     = appState.customArea || appState.calculatedArea;
        areaInput.style.cssText = 'width: 100%; padding: 4px; font-size: 12px; text-align: center; border: 1px solid #ddd; border-radius: 4px;';
        areaInput.onchange  = function () { appState.customArea = parseFloat(this.value).toFixed(1); };
        areaInputWrap.appendChild(areaInput);
        linesList.appendChild(areaInputWrap);
    }

    // Список ліній
    G.figureLines.forEach(line => {
        const lineContainer = document.createElement('div');
        const bgColor = line.isDiagonal ? '#f5f5f5' : (line.isPending ? '#fff3e0' : '#f0f0f0');
        lineContainer.style.cssText = `padding: 6px 8px; background: ${bgColor}; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;`;

        const lineBtn = document.createElement('button');
        lineBtn.style.cssText = 'flex: 1; padding: 4px; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 12px; font-weight: bold;';
        const diagMark = line.isDiagonal ? ' ╌╌ діаг.' : '';
        const pendMark = line.isPending  ? ' (очікування)' : '';
        lineBtn.textContent = (line.from || '?') + '-' + (line.to !== undefined ? line.to : '?') + diagMark + pendMark;
        if (line.isDiagonal) lineBtn.style.color = '#888';
        lineBtn.onclick = function() { editLine(line); };
        lineContainer.appendChild(lineBtn);

        const visChk = _makeSmallCheckbox(
            line.dimensionVisible !== false,
            'Показати розмір',
            (checked) => { line.dimensionVisible = checked; redrawEntireFigure(); }
        );
        lineContainer.appendChild(visChk);

        const rotChk = _makeSmallCheckbox(
            line.dimensionRotated === true,
            'Розвернути на 180°',
            (checked) => { line.dimensionRotated = checked; redrawEntireFigure(); }
        );
        lineContainer.appendChild(rotChk);

        linesList.appendChild(lineContainer);
    });
};

function _makeCheckboxRow(id, label, checked, onChange) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'display: flex; align-items: center; cursor: pointer; font-size: 12px;';

    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.id = id; inp.checked = checked;
    inp.style.cssText = 'margin-right: 8px; width: 16px; height: 16px; cursor: pointer;';
    inp.onchange = onChange;

    const span = document.createElement('span');
    span.textContent = label;

    lbl.appendChild(inp); lbl.appendChild(span);
    wrap.appendChild(lbl);
    return wrap;
}

function _makeRoomNumberRow() {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom: 15px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';

    const lbl = document.createElement('label');
    lbl.style.cssText = 'display: block; font-size: 12px; font-weight: bold; margin-bottom: 5px;';
    lbl.textContent   = '№ приміщення:';
    wrap.appendChild(lbl);

    const inp = document.createElement('input');
    inp.type        = 'text';
    inp.id          = 'roomNumberInput';
    inp.placeholder = '1-1';
    inp.style.cssText = 'width: 100%; padding: 4px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;';
    inp.value       = G.roomNumberInputValue;
    inp.onchange    = function () { G.roomNumber = this.value.trim(); redrawEntireFigure(); };
    wrap.appendChild(inp);

    const hint = document.createElement('div');
    hint.style.cssText = 'font-size: 10px; color: #666; margin-top: 3px;';
    hint.textContent   = 'Формат: 1-1';
    wrap.appendChild(hint);

    return wrap;
}

function _makeSmallCheckbox(checked, title, onChange) {
    const inp = document.createElement('input');
    inp.type    = 'checkbox'; inp.checked = checked; inp.title = title;
    inp.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
    inp.onchange = function (e) { e.stopPropagation(); onChange(this.checked); };
    return inp;
}
