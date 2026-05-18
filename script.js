document.addEventListener('DOMContentLoaded', function () {

    /* ───────────────────────────────────────────
       Середовище
    ─────────────────────────────────────────── */
    const isWebCodeApp = navigator.userAgent.toLowerCase().includes('web code');
    const isAndroid    = /Android/i.test(navigator.userAgent);
    const isLocalFile  = window.location.protocol === 'file:';

    /* ───────────────────────────────────────────
       Стан редактора фігур
    ─────────────────────────────────────────── */
    let dimensionsOutside = false;
    let isBuilding        = false;
    let roomNumber        = '';

    // Збереження стану поля номера приміщення між перемалюваннями
    let roomNumberInputValue         = '';
    let roomNumberInputFocused       = false;
    let roomNumberInputSelectionStart = 0;
    let roomNumberInputSelectionEnd   = 0;

    // Масив ліній фігури та лічильники
    let figureLines    = [];
    let lineIdCounter  = 1;
    let pointCounter   = 1;

    // Free-лінії (з невідомим кутом)
    let pendingFreeLines = [];
    let freeLineQuadrant = null;

    // Ієрархія елементів — активна (поточна канва)
    // Справжні дані зберігаються в canvas.hierarchyData / canvas.hierarchyIdCounter
    let hierarchyData         = [];
    let hierarchyIdCounter    = 1;
    let selectedHierarchyItem = null;

    // Поточні налаштування модалки координат
    let currentAngle    = 'up';
    let currentLineType = 'line';
    let selectedElement = null;

    // Точки фігури
    let shapePoints = [{ x: START_X, y: START_Y, num: 1 }];

    /* ───────────────────────────────────────────
       Допоміжна: ініціалізація початкової точки SVG
    ─────────────────────────────────────────── */
    function renderStartPoint(svg) {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', START_X);
        circle.setAttribute('cy', START_Y);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', '#e53935');
        svg.appendChild(circle);

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', START_X + 10);
        text.setAttribute('y', START_Y - 5);
        text.setAttribute('font-size', '16');
        text.setAttribute('fill', '#e53935');
        text.setAttribute('font-weight', 'bold');
        text.textContent = '1';
        svg.appendChild(text);
    }

    /* ───────────────────────────────────────────
       Допоміжна: очистити SVG і відновити початкову точку
    ─────────────────────────────────────────── */
    function resetSvgCanvas(svg) {
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
        renderStartPoint(svg);
    }

    /* ───────────────────────────────────────────
       Перемикачі (будівля / розміри ззовні)
    ─────────────────────────────────────────── */
    window.toggleDimensionSide = function () {
        dimensionsOutside = document.getElementById('dimensionSideCheckbox').checked;
        if (figureLines.length > 0) redrawEntireFigure();
    };

    window.toggleBuildingType = function () {
        isBuilding = document.getElementById('buildingTypeCheckbox').checked;
        if (figureLines.length > 0) redrawEntireFigure();
    };

    /* ═══════════════════════════════════════════
       CANVAS MANAGER
    ═══════════════════════════════════════════ */
    const canvasManager = {
        canvases:      [],
        activeCanvasId: null,
        nextId:         1,

        createCanvas() {
            const id = this.nextId++;
            const canvas = {
                id,
                name: `Canvas ${id}`,
                viewBox: { x: 0, y: 0, width: 900, height: 1200 },
                savedPath: null,
                hierarchyData:      [],
                hierarchyIdCounter: 1
            };
            this.canvases.push(canvas);
            this.renderCanvas(canvas);
            this.renderTab(canvas);
            this.setActiveCanvas(id);
            return canvas;
        },

        renderCanvas(canvas) {
            const container  = document.getElementById('canvas-container');
            const wrapper    = document.createElement('div');
            wrapper.className = 'w-full h-full';
            wrapper.style.display = 'none';
            wrapper.setAttribute('data-canvas-id', canvas.id);

            wrapper.innerHTML = `
                <svg class="w-full h-full bg-[#e6f2ff]"
                     viewBox="${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}"
                     preserveAspectRatio="xMidYMid meet">
                    <rect
                        x="${A4_OFFSET}" y="${A4_OFFSET}"
                        width="${A4_WIDTH}" height="${A4_HEIGHT}"
                        fill="none" stroke="#1e88e5" stroke-width="2"
                        vector-effect="non-scaling-stroke"
                        class="paper-frame"
                    />
                </svg>`;

            container.appendChild(wrapper);
            this.attachCanvasEvents(wrapper.querySelector('svg'), canvas);
        },

        renderTab(canvas) {
            const tabsContainer = document.getElementById('tabs-container');
            const tab = document.createElement('button');
            tab.className = 'px-4 py-2 text-sm rounded-t hover:bg-white transition bg-gray-50 flex items-center';
            tab.setAttribute('data-tab-id', canvas.id);
            tab.innerHTML = `
                <span>${canvas.name}</span>
                <i class="fas fa-times ml-2 text-gray-400 hover:text-red-600 cursor-pointer"
                   onclick="event.stopPropagation(); window.canvasManager.closeCanvas(${canvas.id})"
                   style="min-width: 16px;"></i>`;
            tab.onclick = () => this.setActiveCanvas(canvas.id);
            tabsContainer.appendChild(tab);
        },

        setActiveCanvas(id) {
            // Зберігаємо ієрархію поточної (старої) канви перед перемиканням
            if (this.activeCanvasId !== null) {
                const prev = this.canvases.find(c => c.id === this.activeCanvasId);
                if (prev) {
                    prev.hierarchyData      = hierarchyData;
                    prev.hierarchyIdCounter = hierarchyIdCounter;
                }
            }

            this.activeCanvasId = id;

            // Завантажуємо ієрархію нової канви
            const next = this.canvases.find(c => c.id === id);
            if (next) {
                hierarchyData      = next.hierarchyData      || [];
                hierarchyIdCounter = next.hierarchyIdCounter || 1;
            }

            document.querySelectorAll('[data-canvas-id]').forEach(el => {
                el.style.display = 'none';
            });

            const activeEl = document.querySelector(`[data-canvas-id="${id}"]`);
            if (activeEl) activeEl.style.display = 'block';

            document.querySelectorAll('[data-tab-id]').forEach(tab => {
                const isActive = parseInt(tab.getAttribute('data-tab-id')) === id;
                tab.classList.toggle('bg-white',        isActive);
                tab.classList.toggle('border-t-2',      isActive);
                tab.classList.toggle('border-blue-600', isActive);
                tab.classList.toggle('bg-gray-50',      !isActive);
            });

            window.svg = activeEl ? activeEl.querySelector('svg') : null;

            // Оновлюємо панель ієрархії для нової канви
            selectedHierarchyItem = null;
            renderHierarchy();
        },

        openCanvas() {
            if ('showOpenFilePicker' in window) {
                window.showOpenFilePicker({
                    types: [{ description: 'SVG Files', accept: { 'image/svg+xml': ['.svg'] } }]
                }).then(async ([handle]) => {
                    const file   = await handle.getFile();
                    const reader = new FileReader();
                    reader.onload = (e) => this.loadSvgFromContent(e.target.result, file.name.replace('.svg', ''));
                    reader.readAsText(file);
                }).catch(err => {
                    if (err.name !== 'AbortError') showToast('Помилка відкриття: ' + err.message, 'error');
                });
            } else {
                const input    = document.createElement('input');
                input.type     = 'file';
                input.accept   = '.svg';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (e) => this.loadSvgFromContent(e.target.result, file.name.replace('.svg', ''));
                    reader.readAsText(file);
                };
                input.click();
            }
        },

        loadSvgFromContent(svgContent, name) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = svgContent;
            const svg = tempDiv.querySelector('svg');
            if (!svg) {
                showToast('Невірний SVG-файл', 'error');
                return;
            }
            const id = this.nextId++;
            const viewBox = svg.getAttribute('viewBox');
            const [x, y, width, height] = viewBox
                ? viewBox.split(/\s+/).map(Number)
                : [0, 0, 900, 1200];

            const canvas = {
                id,
                name: `C${id}`,
                fullName: name || `Canvas ${id}`,
                viewBox: { x, y, width, height },
                savedPath: `${name || 'imported'}.svg`,
                hierarchyData:      [],
                hierarchyIdCounter: 1
            };
            this.canvases.push(canvas);
            this.renderImportedCanvas(canvas, svg.outerHTML);
            this.renderTab(canvas);
            this.setActiveCanvas(id);
        },

        renderImportedCanvas(canvas, svgContent) {
            const container = document.getElementById('canvas-container');
            const wrapper   = document.createElement('div');
            wrapper.className = 'w-full h-full';
            wrapper.style.display = 'none';
            wrapper.setAttribute('data-canvas-id', canvas.id);
            wrapper.innerHTML = svgContent;
            container.appendChild(wrapper);
            this.attachCanvasEvents(wrapper.querySelector('svg'), canvas);
        },

        closeCanvas(id) {
            if (this.canvases.length <= 1) {
                showToast('Не можна закрити єдине полотно', 'warning');
                return;
            }
            this.canvases = this.canvases.filter(c => c.id !== id);
            document.querySelector(`[data-canvas-id="${id}"]`)?.remove();
            document.querySelector(`[data-tab-id="${id}"]`)?.remove();
            if (this.activeCanvasId === id) {
                this.setActiveCanvas(this.canvases[0].id);
            }
        },

        saveCanvas(id) {
            const canvas    = this.canvases.find(c => c.id === id);
            if (!canvas) return;

            const canvasEl  = document.querySelector(`[data-canvas-id="${id}"]`);
            const svgEl     = canvasEl.querySelector('svg');
            const svgData   = svgEl.outerHTML;
            const blob      = new Blob([svgData], { type: 'image/svg+xml' });

            const isMobile  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const isDesktop = !isMobile && 'showSaveFilePicker' in window;

            if (isDesktop) {
                this.saveWithFilePicker(canvas, blob);
            } else if (isMobile || isWebCodeApp) {
                this.showCopyModal(svgData, canvas.savedPath || `${canvas.name}.svg`);
            } else {
                this.saveWithDownload(canvas, blob);
            }
        },

        async saveWithFilePicker(canvas, blob) {
            try {
                const fileName = canvas.savedPath || `${canvas.name}.svg`;
                const handle   = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'SVG Files', accept: { 'image/svg+xml': ['.svg'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                canvas.savedPath  = handle.name;
                canvas.fileHandle = handle;
                showToast(`Збережено: ${canvas.savedPath}`, 'success');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    showToast('Помилка збереження', 'error');
                }
            }
        },

        showCopyModal(svgContent, fileName) {
            document.getElementById('svgCode').value         = svgContent;
            document.getElementById('modalTitle').textContent = `Скопіювати код для "${fileName}"`;
            document.getElementById('copyModal').style.display = 'block';
        },

        saveWithDownload(canvas, blob) {
            try {
                let fileName = canvas.savedPath || `${canvas.name}.svg`;
                if (!canvas.savedPath) {
                    const inputName = window.prompt('Введіть назву файлу:', fileName);
                    if (!inputName) return;
                    fileName = inputName.endsWith('.svg') ? inputName : `${inputName}.svg`;
                    canvas.savedPath = fileName;
                }
                const url  = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href      = url;
                link.download  = fileName;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);
                showToast(`Файл збережено: ${fileName}`, 'success');
            } catch (err) {
                showToast('Помилка збереження: ' + err.message, 'error');
            }
        },

        attachCanvasEvents(svgElement, canvas) {
            let isDragging      = false;
            let startX, startY;
            let initialDistance = 0;
            let initialViewBox  = null;

            svgElement.addEventListener('mousedown', (e) => {
                if (e.button === 0) {
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    svgElement.style.cursor = 'grabbing';
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                const dx = (startX - e.clientX) * (canvas.viewBox.width  / svgElement.clientWidth);
                const dy = (startY - e.clientY) * (canvas.viewBox.height / svgElement.clientHeight);
                canvas.viewBox.x += dx;
                canvas.viewBox.y += dy;
                svgElement.setAttribute('viewBox',
                    `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
                startX = e.clientX;
                startY = e.clientY;
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                svgElement.style.cursor = 'grab';
            });

            svgElement.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    isDragging = false;
                    initialDistance = Math.hypot(
                        e.touches[1].clientX - e.touches[0].clientX,
                        e.touches[1].clientY - e.touches[0].clientY
                    );
                    initialViewBox = { ...canvas.viewBox };
                }
            });

            svgElement.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (e.touches.length === 1 && isDragging) {
                    const dx = (startX - e.touches[0].clientX) * (canvas.viewBox.width  / svgElement.clientWidth);
                    const dy = (startY - e.touches[0].clientY) * (canvas.viewBox.height / svgElement.clientHeight);
                    canvas.viewBox.x += dx;
                    canvas.viewBox.y += dy;
                    svgElement.setAttribute('viewBox',
                        `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else if (e.touches.length === 2 && initialDistance > 0) {
                    const currentDist = Math.hypot(
                        e.touches[1].clientX - e.touches[0].clientX,
                        e.touches[1].clientY - e.touches[0].clientY
                    );
                    const scale = initialDistance / currentDist;
                    canvas.viewBox.width  = Math.max(200, Math.min(5000, initialViewBox.width  * scale));
                    canvas.viewBox.height = Math.max(200, Math.min(5000, initialViewBox.height * scale));
                    svgElement.setAttribute('viewBox',
                        `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
                }
            });

            svgElement.addEventListener('touchend', () => {
                isDragging = false;
                initialDistance = 0;
            });

            svgElement.style.cursor = 'grab';
            if (/Android|iPhone|iPad/.test(navigator.userAgent)) {
                svgElement.style.touchAction = 'none';
            }
        }
    };

    window.canvasManager = canvasManager;
    canvasManager.createCanvas(); // setActiveCanvas всередині вже викликає renderHierarchy()

    /* ───────────────────────────────────────────
       Масштаб
    ─────────────────────────────────────────── */
    window.zoomIn = function () {
        const canvas = _getActiveCanvas();
        if (!canvas) return;
        const svgEl = _getActiveSvg(canvas);
        if (!svgEl) return;
        canvas.viewBox.width  *= 0.9;
        canvas.viewBox.height *= 0.9;
        canvas.viewBox.x += canvas.viewBox.width  * 0.05;
        canvas.viewBox.y += canvas.viewBox.height * 0.05;
        svgEl.setAttribute('viewBox',
            `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
    };

    window.zoomOut = function () {
        const canvas = _getActiveCanvas();
        if (!canvas) return;
        const svgEl = _getActiveSvg(canvas);
        if (!svgEl) return;
        canvas.viewBox.width  *= 1.1;
        canvas.viewBox.height *= 1.1;
        canvas.viewBox.x -= canvas.viewBox.width  * 0.045;
        canvas.viewBox.y -= canvas.viewBox.height * 0.045;
        svgEl.setAttribute('viewBox',
            `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
    };

    function _getActiveCanvas() {
        if (!window.canvasManager || !window.canvasManager.activeCanvasId) return null;
        return window.canvasManager.canvases.find(c => c.id === window.canvasManager.activeCanvasId) || null;
    }

    function _getActiveSvg(canvas) {
        return document.querySelector(`[data-canvas-id="${canvas.id}"] svg`);
    }

    /* ───────────────────────────────────────────
       Збереження
    ─────────────────────────────────────────── */
    window.saveActiveCanvas = function () {
        const canvas = _getActiveCanvas();
        if (canvas) window.canvasManager.saveCanvas(canvas.id);
    };

    /* ───────────────────────────────────────────
       Клавіатурні скорочення
    ─────────────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n': e.preventDefault(); canvasManager.createCanvas();    break;
                case 'o': e.preventDefault(); canvasManager.openCanvas();      break;
                case 's': e.preventDefault(); saveActiveCanvas();               break;
                case '=':
                case '+': e.preventDefault(); zoomIn();                         break;
                case '-': e.preventDefault(); zoomOut();                        break;
            }
        }
    });

    /* ───────────────────────────────────────────
       Модалка копіювання SVG
    ─────────────────────────────────────────── */
    window.copySvgCode = function () {
        const textarea = document.getElementById('svgCode');
        textarea.select();
        textarea.setSelectionRange(0, 99999);
        navigator.clipboard.writeText(textarea.value)
            .then(() => showToast('Скопійовано в буфер обміну!', 'success'))
            .catch(() => {
                document.execCommand('copy');
                showToast('Скопійовано (резервний метод)!', 'success');
            });
    };

    window.closeModal = function () {
        document.getElementById('copyModal').style.display = 'none';
    };

    // Закриття модалок кліком на тлі
    document.addEventListener('click', (event) => {
        const copyModal  = document.getElementById('copyModal');
        const quickModal = document.getElementById('quickShapeModal');
        if (event.target === copyModal)  copyModal.style.display  = 'none';
        if (event.target === quickModal) closeQuickShapeModal();
    });

    /* ───────────────────────────────────────────
       Модалка фігур
    ─────────────────────────────────────────── */
    window.openShapeModal = function () {
        // Відкриваємо як новий (не редагування)
        appState.editingHierarchyItemId = null;
        document.getElementById('shapeModal').style.display = 'block';
    };

    window.closeShapeModal = function () {
        if (figureLines.length === 0) {
            showToast('Спочатку створіть фігуру', 'warning');
            return;
        }
        transferFigureToMainCanvas();
        document.getElementById('shapeModal').style.display = 'none';
        resetShapeData();
    };

    /* ───────────────────────────────────────────
       Перенос / оновлення фігури на головному полотні
    ─────────────────────────────────────────── */
    function transferFigureToMainCanvas() {
        const canvas = _getActiveCanvas();
        if (!canvas) {
            showToast('Немає активного полотна', 'error');
            return;
        }
        const mainSvg = _getActiveSvg(canvas);
        if (!mainSvg) return;

        // Межі фігури для центрування
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shapePoints.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
        });

        const frameCenterX  = A4_OFFSET + A4_WIDTH  / 2;
        const frameCenterY  = A4_OFFSET + A4_HEIGHT / 2;
        const figureCenterX = minX + (maxX - minX) / 2;
        const figureCenterY = minY + (maxY - minY) / 2;
        const offsetX = frameCenterX - figureCenterX;
        const offsetY = frameCenterY - figureCenterY;

        // --- Режим редагування: оновлюємо існуючу групу ---
        const editId = appState.editingHierarchyItemId;
        if (editId !== null) {
            const existingItem = findHierarchyItemById(editId);
            if (existingItem && existingItem.svgGroup) {
                // Перебудовуємо SVG-групу на місці (без видалення з DOM)
                _rebuildSvgGroup(existingItem.svgGroup, offsetX, offsetY);

                // Оновлюємо дані в ієрархії
                existingItem.figureLines = JSON.parse(JSON.stringify(figureLines));
                existingItem.shapePoints = JSON.parse(JSON.stringify(shapePoints));
                existingItem.roomNumber  = roomNumber;
                existingItem.type        = isBuilding ? 'building' : 'room';
                existingItem.area        = appState.customArea || appState.calculatedArea;

                appState.editingHierarchyItemId = null;
                renderHierarchy();
                showToast('Фігуру оновлено', 'success');
                return;
            }
        }

        // --- Режим створення: додаємо нову групу ---
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('data-hierarchy-id', hierarchyIdCounter);
        _fillSvgGroup(group, offsetX, offsetY);
        mainSvg.appendChild(group);

        addToHierarchy({
            isBuilding,
            name:       isBuilding ? 'Будівля' : 'Кімната',
            roomNumber,
            area:       appState.customArea || appState.calculatedArea,
            figureLines,
            shapePoints,
            svgGroup:   group,
            parentId:   selectedHierarchyItem
        });

        showToast('Фігуру перенесено на головне полотно', 'success');
    }

    /** Заповнює SVG-групу лініями, розмірами та елементами поточної фігури */
    function _fillSvgGroup(group, offsetX, offsetY) {
        figureLines.forEach(lineData => {
            const fromPoint = shapePoints.find(p => p.num === lineData.from);
            const toPoint   = lineData.isClosing ? shapePoints[0] : shapePoints.find(p => p.num === lineData.to);
            if (!fromPoint || !toPoint) return;

            const x1 = fromPoint.x + offsetX, y1 = fromPoint.y + offsetY;
            const x2 = toPoint.x   + offsetX, y2 = toPoint.y   + offsetY;

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            line.setAttribute('stroke', 'black');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('vector-effect', 'non-scaling-stroke');
            group.appendChild(line);

            drawMainCanvasDimension(group, x1, y1, x2, y2, lineData.length, lineData);

            if (lineData.elements && lineData.elements.length > 0) {
                drawElementsOnLine(lineData, x1, y1, x2, y2, SCALE, group);
            }
        });

        // Номер приміщення
        if (roomNumber && shapePoints.length >= 3) {
            const validPoints = shapePoints.filter(p => !p.isTemp);
            let cx = 0, cy = 0;
            validPoints.forEach(p => { cx += p.x + offsetX; cy += p.y + offsetY; });
            cx /= validPoints.length;
            cy /= validPoints.length;
            group.appendChild(buildRoomNumberText(cx, cy, roomNumber));
        }
    }

    /** Очищає групу і перебудовує її вміст (для режиму редагування) */
    function _rebuildSvgGroup(group, offsetX, offsetY) {
        while (group.firstChild) group.removeChild(group.firstChild);
        _fillSvgGroup(group, offsetX, offsetY);
    }

    /* ───────────────────────────────────────────
       Розміри на головному полотні
    ─────────────────────────────────────────── */
    function drawMainCanvasDimension(group, x1, y1, x2, y2, lengthInMeters, lineData) {
        if (lineData && lineData.dimensionVisible === false) return;

        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const ux = dx / len, uy = dy / len;
        const px = uy, py = -ux;
        const offset    = 7.5;
        const dir       = dimensionsOutside ? 1 : -1;
        const cx        = (x1 + x2) / 2;
        const cy        = (y1 + y2) / 2;
        const textX     = cx + px * offset * dir;
        const textY     = cy + py * offset * dir;

        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle > 90)  angle -= 180;
        if (angle < -90) angle += 180;
        if (lineData && lineData.dimensionRotated) angle += 180;

        const numLen = typeof lengthInMeters === 'number' ? lengthInMeters : parseFloat(lengthInMeters);
        const text   = _makeSvgText(textX, textY, numLen.toFixed(2), angle);
        group.appendChild(text);
    }

    /* ───────────────────────────────────────────
       Малювання елементів (WI1 тощо)
       Єдина функція — використовується і для shapeCanvas, і для mainCanvas
    ─────────────────────────────────────────── */
    function drawElementsOnLine(parsedData, x1, y1, x2, y2, scale, targetGroup) {
        const svg       = targetGroup || document.getElementById('shapeCanvas');
        const thickness = ELEMENT_THICKNESS * scale;

        const dx  = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const ux = dx / len, uy = dy / len;
        const px = uy,       py = -ux;

        const elements = parsedData.elements || [];

        for (let i = 0; i < elements.length; i++) {
            if (elements[i].type     === 'number' &&
                elements[i + 1]?.type === 'number' &&
                elements[i + 2]?.type === 'element') {

                const start = elements[i].value     * scale;
                const end   = elements[i + 1].value * scale;
                let code    = elements[i + 2].value;

                let side = 1;
                if (code.startsWith('-')) { side = -1; code = code.substring(1); }

                const sx  = x1 + ux * start;
                const sy  = y1 + uy * start;
                const elen = end - start;

                if (code === 'WI1') {
                    _drawWI1(svg, sx, sy, ux, uy, px, py, elen, thickness, side);
                }

                i += 2;
            }
        }
    }

    function _drawWI1(target, sx, sy, ux, uy, px, py, elen, thickness, side) {
        const isGroup = target instanceof SVGGElement;
        const parent  = isGroup ? target : target;

        const c1x = sx, c1y = sy;
        const c2x = sx + ux * elen, c2y = sy + uy * elen;
        const c3x = c2x + px * thickness * side, c3y = c2y + py * thickness * side;
        const c4x = sx  + px * thickness * side, c4y = sy  + py * thickness * side;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        rect.setAttribute('points', `${c1x},${c1y} ${c2x},${c2y} ${c3x},${c3y} ${c4x},${c4y}`);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', 'black');
        rect.setAttribute('stroke-width', '1');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        parent.appendChild(rect);

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
        parent.appendChild(midLine);
    }

    /* ───────────────────────────────────────────
       Скидання даних фігури
    ─────────────────────────────────────────── */
    function resetShapeData() {
        figureLines    = [];
        pendingFreeLines = [];
        lineIdCounter  = 1;
        pointCounter   = 1;
        appState.calculatedArea        = null;
        appState.customArea            = null;
        appState.editingHierarchyItemId = null;
        roomNumber         = '';
        roomNumberInputValue = '';

        const svg = document.getElementById('shapeCanvas');
        resetSvgCanvas(svg);
        updateLinesList();
    }

    /* ═══════════════════════════════════════════
       ІЄРАРХІЯ
    ═══════════════════════════════════════════ */
    function addToHierarchy(shapeData) {
        const item = {
            id:         hierarchyIdCounter++,
            type:       shapeData.isBuilding ? 'building' : 'room',
            name:       shapeData.name || (shapeData.isBuilding ? `Будівля ${hierarchyIdCounter}` : `Кімната ${hierarchyIdCounter}`),
            roomNumber: shapeData.roomNumber || '',
            area:       shapeData.area || '',
            figureLines: JSON.parse(JSON.stringify(shapeData.figureLines)),
            shapePoints: JSON.parse(JSON.stringify(shapeData.shapePoints)),
            svgGroup:   shapeData.svgGroup,
            children:   [],
            expanded:   true,
            parentId:   shapeData.parentId || null
        };

        if (shapeData.parentId) {
            const parent = findHierarchyItemById(shapeData.parentId);
            if (parent) parent.children.push(item);
        } else {
            hierarchyData.push(item);
        }

        // Синхронізуємо оновлений лічильник назад у canvas-об'єкт
        _syncHierarchyToCanvas();

        renderHierarchy();
        return item;
    }

    /** Зберігає поточні hierarchyData/hierarchyIdCounter в активний canvas-об'єкт */
    function _syncHierarchyToCanvas() {
        const canvas = _getActiveCanvas();
        if (canvas) {
            canvas.hierarchyData      = hierarchyData;
            canvas.hierarchyIdCounter = hierarchyIdCounter;
        }
    }

    function findHierarchyItemById(id, items = hierarchyData) {
        for (const item of items) {
            if (item.id === id) return item;
            const found = findHierarchyItemById(id, item.children);
            if (found) return found;
        }
        return null;
    }

    function renderHierarchy() {
        const tree = document.getElementById('hierarchy-tree');
        tree.innerHTML = '';
        if (hierarchyData.length === 0) {
            tree.innerHTML = '<div style="color: #999; text-align: center; padding: 20px;">Немає елементів</div>';
            return;
        }
        hierarchyData.forEach(item => tree.appendChild(createHierarchyItemElement(item)));
    }

    function selectHierarchyItem(item) {
        selectedHierarchyItem = item.id;
        renderHierarchy();
        openShapeModalForEdit(item);
    }

    function openShapeModalForEdit(item) {
        document.getElementById('shapeModal').style.display = 'block';
        figureLines = JSON.parse(JSON.stringify(item.figureLines));
        shapePoints = JSON.parse(JSON.stringify(item.shapePoints));
        roomNumber  = item.roomNumber || '';
        isBuilding  = item.type === 'building';
        appState.editingHierarchyItemId = item.id;
        redrawEntireFigure();
    }

    /**
     * Витягує з масиву elements лінії всі присутні елементи у форматі:
     * [ { start, end, code } ]
     * де start/end — відстані в метрах, code — 'WI1', 'DV1' тощо.
     */
    function extractLineElements(elements) {
        const result = [];
        for (let i = 0; i < elements.length; i++) {
            if (elements[i]?.type     === 'number' &&
                elements[i + 1]?.type === 'number' &&
                elements[i + 2]?.type === 'element') {
                let code = elements[i + 2].value;
                if (code.startsWith('-')) code = code.substring(1);
                result.push({
                    start: elements[i].value,
                    end:   elements[i + 1].value,
                    code
                });
                i += 2;
            }
        }
        return result;
    }

    /** Зручна назва для коду елемента */
    const ELEMENT_NAMES = {
        WI1: 'Вікно',  DV1: 'Двері',   OT1: 'Отвір',
        KO1: 'Комин 1', KO2: 'Комин 2',
        PI1: 'Піч 1',   PI2: 'Піч 2',
        KU1: 'Кухня 1', KU2: 'Кухня 2', KU3: 'Кухня 3',
        KL1: 'Колона 1', KL2: 'Колона 2',
        NI1: 'Ніша'
    };

    function createHierarchyItemElement(item) {
        const container = document.createElement('div');
        const itemDiv   = document.createElement('div');
        itemDiv.className = 'hierarchy-item' + (selectedHierarchyItem === item.id ? ' selected' : '');

        // Кнопка розгортання (діти або лінії з елементами)
        const linesWithElements = (item.figureLines || []).filter(l =>
            extractLineElements(l.elements || []).length > 0
        );
        const hasChildren = item.children.length > 0;
        const hasDetails  = linesWithElements.length > 0;

        if (hasChildren || hasDetails) {
            const toggle = document.createElement('span');
            toggle.className = 'hierarchy-toggle';
            toggle.textContent = item.expanded ? '▼' : '▶';
            toggle.onclick = (e) => {
                e.stopPropagation();
                item.expanded = !item.expanded;
                renderHierarchy();
            };
            itemDiv.appendChild(toggle);
        } else {
            const spacer = document.createElement('span');
            spacer.style.width = '14px';
            itemDiv.appendChild(spacer);
        }

        const icon = document.createElement('i');
        icon.className = 'fas icon ' + (item.type === 'building' ? 'fa-building' : 'fa-door-open');
        icon.style.color = item.type === 'building' ? '#2196F3' : '#4CAF50';
        itemDiv.appendChild(icon);

        const label = document.createElement('span');
        label.style.flex = '1';
        label.textContent = item.roomNumber || item.name;
        itemDiv.appendChild(label);

        if (item.area) {
            const areaLabel = document.createElement('span');
            areaLabel.style.fontSize = '10px';
            areaLabel.style.color    = '#999';
            areaLabel.textContent    = `${item.area}м²`;
            itemDiv.appendChild(areaLabel);
        }

        itemDiv.onclick = () => selectHierarchyItem(item);
        container.appendChild(itemDiv);

        if (item.expanded) {
            // --- Підрозділ: елементи ліній (вікна тощо) ---
            if (hasDetails) {
                const detailsWrap = document.createElement('div');
                detailsWrap.style.cssText = 'margin-left: 20px; padding: 4px 0 4px 8px; border-left: 1px solid #ddd;';

                linesWithElements.forEach((line, idx) => {
                    const lineElems = extractLineElements(line.elements || []);
                    lineElems.forEach(el => {
                        const row = document.createElement('div');
                        row.style.cssText = 'display: flex; align-items: center; gap: 5px; padding: 2px 0; font-size: 11px; color: #555;';

                        const elIcon = document.createElement('i');
                        elIcon.className = 'fas fa-window-maximize';
                        elIcon.style.cssText = 'font-size: 10px; color: #9C27B0; flex-shrink: 0;';
                        row.appendChild(elIcon);

                        const elLabel = document.createElement('span');
                        const name  = ELEMENT_NAMES[el.code] || el.code;
                        const lineNum = `Л${line.from}-${line.to ?? '?'}`;
                        elLabel.textContent = `${el.code} (${name}) · ${lineNum} · ${el.start.toFixed(2)}–${el.end.toFixed(2)}м`;
                        row.appendChild(elLabel);

                        detailsWrap.appendChild(row);
                    });
                });

                container.appendChild(detailsWrap);
            }

            // --- Дочірні елементи ієрархії ---
            if (hasChildren) {
                const childWrap = document.createElement('div');
                childWrap.className = 'hierarchy-children';
                item.children.forEach(child => childWrap.appendChild(createHierarchyItemElement(child)));
                container.appendChild(childWrap);
            }
        }

        return container;
    }

    /* ═══════════════════════════════════════════
       РЕДАКТОР ФІГУР
    ═══════════════════════════════════════════ */

    // Додати точку
    window.addPoint = function () {
        document.getElementById('coordInput').value = '';
        document.getElementById('coordModal').style.display = 'block';
        appState.editingLineId = null;
        setTimeout(() => document.getElementById('coordInput').focus(), 100);
    };

    // Замкнути фігуру
    window.closeShape = function () {
        if (shapePoints.length < 2) {
            showToast('Недостатньо точок для замикання фігури', 'warning');
            return;
        }
        const lastPoint  = shapePoints[shapePoints.length - 1];
        const firstPoint = shapePoints[0];
        const dx = firstPoint.x - lastPoint.x;
        const dy = firstPoint.y - lastPoint.y;
        const distMeters = (Math.sqrt(dx * dx + dy * dy) / SCALE).toFixed(2);

        document.getElementById('coordInput').value = `free\nline\n${distMeters}`;
        document.getElementById('coordModal').style.display = 'block';
        appState.isClosingLine = true;
        appState.editingLineId = null;

        setTimeout(() => {
            const inp = document.getElementById('coordInput');
            inp.focus();
            inp.setSelectionRange(0, 0);
        }, 100);
    };

    // Діагональ (заглушка)
    window.addDiagonal = function () {
        showToast('Функція «Діагональ» буде реалізована пізніше', 'info');
    };

    // Закрити модалку координат та обробити введення
    window.closeCoordModal = function () {
        const inputText = document.getElementById('coordInput').value.trim();

        if (inputText) {
            const parsedData = parseCoordinateInput(inputText);
            if (parsedData) {
                if (appState.editingLineId) {
                    updateExistingLine(appState.editingLineId, parsedData);
                    appState.editingLineId = null;
                } else {
                    drawLineOnCanvas(parsedData);
                }
            }
        }

        document.getElementById('coordModal').style.display = 'none';
        document.getElementById('coordInput').value = '';
    };

    // Застаріла функція (залишена для сумісності)
    window.submitCoords = function () {
        closeCoordModal();
    };

    // Вибір напрямку
    window.setAngle = function (direction) {
        currentAngle = direction;

        const codeMap = { up: 'top', down: 'bottom', right: 'right', left: 'left', free: 'free' };
        if (direction === 'free') {
            freeLineQuadrant = null;
        }

        _insertIntoCoordInput(codeMap[direction]);
    };

    // Вибір типу лінії
    window.setLineType = function (type) {
        currentLineType = type;
        const codeMap = { line: 'line', arc: 'curve' };
        _insertIntoCoordInput(codeMap[type]);
    };

    // Вибір елемента
    window.selectElement = function (code) {
        selectedElement = code;
        const coordInput = document.getElementById('coordInput');
        const cursorPos  = coordInput.selectionStart;
        const textBefore = coordInput.value.substring(0, cursorPos);
        const textAfter  = coordInput.value.substring(cursorPos);
        const lastChar   = textBefore.slice(-1);
        const prefix     = (textBefore && !textBefore.endsWith('\n') && lastChar !== '-' && isNaN(lastChar)) ? '\n' : '';
        const newText    = textBefore + prefix + code + '\n';
        coordInput.value = newText + textAfter;
        coordInput.setSelectionRange(newText.length, newText.length);
        coordInput.focus();
    };

    function _insertIntoCoordInput(code) {
        const coordInput = document.getElementById('coordInput');
        const cursorPos  = coordInput.selectionStart;
        const textBefore = coordInput.value.substring(0, cursorPos);
        const textAfter  = coordInput.value.substring(cursorPos);
        const newText    = textBefore + (textBefore && !textBefore.endsWith('\n') ? '\n' : '') + code + '\n';
        coordInput.value = newText + textAfter;
        coordInput.setSelectionRange(newText.length, newText.length);
        coordInput.focus();
    }

    /* ───────────────────────────────────────────
       Парсинг введених координат
    ─────────────────────────────────────────── */
    function parseCoordinateInput(inputText) {
        const lines = inputText.trim().split('\n').map(l => l.trim()).filter(Boolean);

        if (lines.length < 2) {
            showToast('Введіть принаймні напрямок та тип лінії', 'warning');
            return null;
        }

        const direction = lines[0].toLowerCase();
        if (!['top', 'bottom', 'left', 'right', 'free'].includes(direction)) {
            showToast('Невірний напрямок. Використовуйте: top, bottom, left, right, free', 'error');
            return null;
        }

        let quadrant   = null;
        let startIndex = 1;

        if (direction === 'free') {
            if (lines.length > 1 && ['top', 'bottom', 'left', 'right'].includes(lines[1].toLowerCase())) {
                quadrant   = lines[1].toLowerCase();
                startIndex = 2;
            } else if (freeLineQuadrant) {
                quadrant = freeLineQuadrant;
            }
        }

        if (lines.length < startIndex + 1) {
            showToast('Введіть тип лінії', 'warning');
            return null;
        }

        const lineType = lines[startIndex].toLowerCase();
        if (!['line', 'curve'].includes(lineType)) {
            showToast('Невірний тип лінії. Використовуйте: line, curve', 'error');
            return null;
        }

        const elements = [];
        for (let i = startIndex + 1; i < lines.length; i++) {
            const numValue = parseFloat(lines[i].replace(',', '.'));
            if (!isNaN(numValue)) {
                elements.push({ type: 'number', value: numValue });
            } else {
                elements.push({ type: 'element', value: lines[i] });
            }
        }

        return { direction, lineType, elements, quadrant };
    }

    /* ───────────────────────────────────────────
       Малювання лінії на shapeCanvas
    ─────────────────────────────────────────── */
    function drawLineOnCanvas(parsedData) {
        const svg       = document.getElementById('shapeCanvas');
        const lastPoint = shapePoints[shapePoints.length - 1];
        const isClosing = appState.isClosingLine || false;

        // Обробка free-лінії
        if (parsedData.direction === 'free') {
            const lineLength = parsedData.elements.find(el => el.type === 'number')?.value || 0;

            if (!isClosing) {
                const lineData = _makeLineData(lineIdCounter, lastPoint.num, null, parsedData, lineLength, false, true);
                pendingFreeLines.push(lineData);
                figureLines.push(lineData);
                lineIdCounter++;

                pointCounter++;
                shapePoints.push({ x: lastPoint.x, y: lastPoint.y, num: pointCounter, isTemp: true });

                updateLinesList();
                showToast('Лінію з невідомим кутом збережено. Додайте замикаючу для розрахунку.', 'info');
                return;
            }

            if (pendingFreeLines.length === 0) {
                parsedData.direction = 'direct-closing';
            } else {
                const lineData = _makeLineData(lineIdCounter, lastPoint.num, 1, parsedData, lineLength, true, true);
                pendingFreeLines.push(lineData);
                figureLines.push(lineData);
                lineIdCounter++;
                appState.isClosingLine = false;
                calculateFreeAngleFigure();
                return;
            }
        }

        // Звичайна лінія
        let endX = lastPoint.x, endY = lastPoint.y;
        let lineLength = 0;

        for (let i = parsedData.elements.length - 1; i >= 0; i--) {
            if (parsedData.elements[i].type === 'number') {
                lineLength = parseFloat(parsedData.elements[i].value);
                break;
            }
        }

        if (isClosing) {
            endX = shapePoints[0].x;
            endY = shapePoints[0].y;
        } else {
            const scaledLen = lineLength * SCALE;
            switch (parsedData.direction) {
                case 'top':    endY = lastPoint.y - scaledLen; break;
                case 'bottom': endY = lastPoint.y + scaledLen; break;
                case 'left':   endX = lastPoint.x - scaledLen; break;
                case 'right':  endX = lastPoint.x + scaledLen; break;
            }
        }

        _renderSvgLine(svg, lastPoint.x, lastPoint.y, endX, endY, lineIdCounter);
        drawLineDimension(lastPoint.x, lastPoint.y, endX, endY, lineLength, null);
        drawElementsOnLine(parsedData, lastPoint.x, lastPoint.y, endX, endY, SCALE);

        let targetPointNum;
        if (isClosing) {
            targetPointNum = 1;
            appState.isClosingLine = false;
            calculateAndDisplayArea();
        } else {
            pointCounter++;
            shapePoints.push({ x: endX, y: endY, num: pointCounter });
            targetPointNum = pointCounter;
            _renderSvgPoint(svg, endX, endY, pointCounter);
        }

        const lineData = _makeLineData(lineIdCounter, lastPoint.num, targetPointNum, parsedData, lineLength, isClosing, false);
        figureLines.push(lineData);
        updateLinesList();
        lineIdCounter++;
        autoScaleAndCenterFigure();
    }

    function _makeLineData(id, from, to, parsedData, length, isClosing, isPending) {
        return {
            id, from, to,
            direction:        parsedData.direction,
            lineType:         parsedData.lineType,
            elements:         parsedData.elements,
            code:             document.getElementById('coordInput').value,
            length:           parseFloat(length),
            isClosing,
            isPending,
            quadrant:         parsedData.quadrant || null,
            dimensionVisible: true,
            dimensionRotated: false
        };
    }

    /* ───────────────────────────────────────────
       Розміри на shapeCanvas
    ─────────────────────────────────────────── */
    function drawLineDimension(x1, y1, x2, y2, lengthInMeters, lineData) {
        if (lineData && lineData.dimensionVisible === false) return;

        const svg = document.getElementById('shapeCanvas');
        const dx  = x2 - x1, dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;

        const ux = dx / len, uy = dy / len;
        const px = uy, py = -ux;
        const offset = 10;
        const dir    = dimensionsOutside ? 1 : -1;
        const textX  = (x1 + x2) / 2 + px * offset * dir;
        const textY  = (y1 + y2) / 2 + py * offset * dir;

        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (angle > 90)  angle -= 180;
        if (angle < -90) angle += 180;
        if (lineData && lineData.dimensionRotated) angle += 180;

        const numLen = typeof lengthInMeters === 'number' ? lengthInMeters : parseFloat(lengthInMeters);
        const rounded = Math.round(numLen * 100) / 100;
        svg.appendChild(_makeSvgText(textX, textY, rounded.toFixed(2), angle));
    }

    /* ───────────────────────────────────────────
       Площа (формула Гаусса)
    ─────────────────────────────────────────── */
    function calculateAndDisplayArea() {
        if (shapePoints.length < 3) return;
        let area = 0;
        for (let i = 0; i < shapePoints.length; i++) {
            const j = (i + 1) % shapePoints.length;
            area += shapePoints[i].x * shapePoints[j].y;
            area -= shapePoints[j].x * shapePoints[i].y;
        }
        area = Math.abs(area) / 2;
        appState.calculatedArea = (area / (SCALE * SCALE)).toFixed(1);
        updateLinesList();
    }

    /* ───────────────────────────────────────────
       Редагування лінії
    ─────────────────────────────────────────── */
    function editLine(line) {
        document.getElementById('coordModal').style.display = 'block';
        document.getElementById('coordInput').value = line.code;
        appState.editingLineId = line.id;
        setTimeout(() => document.getElementById('coordInput').focus(), 100);
    }

    function updateExistingLine(lineId, parsedData) {
        const idx = figureLines.findIndex(l => l.id === lineId);
        if (idx === -1) {
            showToast('Лінію не знайдено', 'error');
            return;
        }

        let newLength = 0;
        for (let i = parsedData.elements.length - 1; i >= 0; i--) {
            if (parsedData.elements[i].type === 'number') { newLength = parsedData.elements[i].value; break; }
        }

        figureLines[idx].direction = parsedData.direction;
        figureLines[idx].lineType  = parsedData.lineType;
        figureLines[idx].elements  = parsedData.elements;
        figureLines[idx].code      = document.getElementById('coordInput').value;
        figureLines[idx].length    = newLength;

        const closingIdx = figureLines.findIndex(l => l.isClosing);
        if (closingIdx !== -1 && idx < closingIdx) recalculateClosingLine();

        redrawEntireFigure();
    }

    function recalculateClosingLine() {
        const closingIdx = figureLines.findIndex(l => l.isClosing);
        if (closingIdx === -1) return;

        const closingLine = figureLines.splice(closingIdx, 1)[0];

        // Відновлюємо точки без замикаючої лінії
        const svg = document.getElementById('shapeCanvas');
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
        renderStartPoint(svg);

        let currentPointNum = 1;
        figureLines.forEach(lineData => {
            const last = shapePoints[shapePoints.length - 1];
            let endX = last.x, endY = last.y;
            const scaledLen = lineData.length * SCALE;
            switch (lineData.direction) {
                case 'top':    endY = last.y - scaledLen; break;
                case 'bottom': endY = last.y + scaledLen; break;
                case 'left':   endX = last.x - scaledLen; break;
                case 'right':  endX = last.x + scaledLen; break;
            }
            currentPointNum++;
            shapePoints.push({ x: endX, y: endY, num: currentPointNum });
        });

        const last  = shapePoints[shapePoints.length - 1];
        const first = shapePoints[0];
        const newLen = (Math.sqrt((first.x - last.x) ** 2 + (first.y - last.y) ** 2) / SCALE).toFixed(2);

        closingLine.length = parseFloat(newLen);
        for (let i = closingLine.elements.length - 1; i >= 0; i--) {
            if (closingLine.elements[i].type === 'number') {
                closingLine.elements[i].value = parseFloat(newLen);
                break;
            }
        }
        const codeLines = closingLine.code.split('\n');
        for (let i = codeLines.length - 1; i >= 0; i--) {
            if (!isNaN(parseFloat(codeLines[i]))) { codeLines[i] = newLen; break; }
        }
        closingLine.code = codeLines.join('\n');
        figureLines.push(closingLine);
    }

    /* ───────────────────────────────────────────
       Перемалювання всієї фігури
    ─────────────────────────────────────────── */
    function redrawEntireFigure() {
        const svg = document.getElementById('shapeCanvas');
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        shapePoints = [{ x: START_X, y: START_Y, num: 1 }];
        renderStartPoint(svg);

        let currentPointNum = 1;
        const calculatedPoints = {};

        figureLines.forEach((lineData, index) => {
            const lastPoint = shapePoints[shapePoints.length - 1];
            let endX, endY;

            if (lineData.isClosing) {
                endX = shapePoints[0].x;
                endY = shapePoints[0].y;
            } else if (lineData.direction === 'free') {
                if (lineData.isPending) {
                    currentPointNum++;
                    shapePoints.push({ x: lastPoint.x, y: lastPoint.y, num: currentPointNum, isTemp: true });
                    figureLines[index].from = lastPoint.num;
                    figureLines[index].to   = currentPointNum;
                    return;
                }

                if (calculatedPoints[lineData.id]) {
                    endX = calculatedPoints[lineData.id].x;
                    endY = calculatedPoints[lineData.id].y;
                } else {
                    let nextClosingIdx = -1;
                    for (let i = index + 1; i < figureLines.length; i++) {
                        if (!figureLines[i].isPending || figureLines[i].isClosing) {
                            nextClosingIdx = i; break;
                        }
                    }
                    if (nextClosingIdx !== -1 && figureLines[nextClosingIdx].isClosing) {
                        const coords = _calcFreeLineEnd(lastPoint, shapePoints[0], lineData, figureLines[nextClosingIdx]);
                        endX = coords.x; endY = coords.y;
                        calculatedPoints[lineData.id] = { x: endX, y: endY };
                    } else {
                        return;
                    }
                }
            } else {
                endX = lastPoint.x; endY = lastPoint.y;
                const scaledLen = lineData.length * SCALE;
                switch (lineData.direction) {
                    case 'top':    endY = lastPoint.y - scaledLen; break;
                    case 'bottom': endY = lastPoint.y + scaledLen; break;
                    case 'left':   endX = lastPoint.x - scaledLen; break;
                    case 'right':  endX = lastPoint.x + scaledLen; break;
                }
            }

            _renderSvgLine(svg, lastPoint.x, lastPoint.y, endX, endY, lineData.id);
            drawLineDimension(lastPoint.x, lastPoint.y, endX, endY, lineData.length, lineData);
            drawElementsOnLine(lineData, lastPoint.x, lastPoint.y, endX, endY, SCALE);

            if (!lineData.isClosing) {
                currentPointNum++;
                shapePoints.push({ x: endX, y: endY, num: currentPointNum });
                figureLines[index].from = lastPoint.num;
                figureLines[index].to   = currentPointNum;
                _renderSvgPoint(svg, endX, endY, currentPointNum);
            } else {
                figureLines[index].from = lastPoint.num;
                figureLines[index].to   = 1;
            }
        });

        pointCounter = currentPointNum;

        if (figureLines.some(l => l.isClosing)) calculateAndDisplayArea();
        updateLinesList();
        autoScaleAndCenterFigure();
        drawRoomNumber();
    }

    /* ───────────────────────────────────────────
       Розрахунок фігури з free-лініями (теорема косинусів)
    ─────────────────────────────────────────── */
    function _calcFreeLineEnd(currentPoint, firstPoint, lineData, closingLine) {
        const a = lineData.length    * SCALE;
        const c = closingLine.length * SCALE;
        const dx = currentPoint.x - firstPoint.x;
        const dy = currentPoint.y - firstPoint.y;
        const b  = Math.sqrt(dx * dx + dy * dy);

        const cosAngle  = (a * a + b * b - c * c) / (2 * a * b);
        const angle     = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
        const baseAngle = Math.atan2(firstPoint.y - currentPoint.y, firstPoint.x - currentPoint.x);

        let finalAngle;
        switch (lineData.quadrant) {
            case 'bottom': finalAngle = baseAngle - angle; break;
            case 'right':  finalAngle = baseAngle - angle; break;
            default:       finalAngle = baseAngle + angle; break;
        }

        return {
            x: currentPoint.x + Math.cos(finalAngle) * a,
            y: currentPoint.y + Math.sin(finalAngle) * a
        };
    }

    function calculateFreeAngleFigure() {
        if (pendingFreeLines.length === 0) {
            showToast('Немає ліній з невідомим кутом', 'warning');
            return;
        }

        const closingLineData = pendingFreeLines.find(l => l.isClosing);
        if (!closingLineData) {
            showToast('Не знайдено замикаючу лінію', 'error');
            return;
        }

        const closingLength = closingLineData.elements.find(e => e.type === 'number')?.value || 0;

        let currentPoint = null;
        for (let i = shapePoints.length - 1; i >= 0; i--) {
            if (!shapePoints[i].isTemp) { currentPoint = shapePoints[i]; break; }
        }
        if (!currentPoint) {
            showToast('Не знайдено початкову точку', 'error');
            return;
        }

        const firstPoint = shapePoints[0];

        const processPendingLine = (pendingLine) => {
            const lineData = { ...pendingLine, length: pendingLine.length };
            const closingRef = { length: closingLength };
            const { x: endX, y: endY } = _calcFreeLineEnd(currentPoint, firstPoint, lineData, closingRef);

            const tempIdx = shapePoints.findIndex(p => p.isTemp);
            if (tempIdx !== -1) {
                shapePoints[tempIdx].x      = endX;
                shapePoints[tempIdx].y      = endY;
                shapePoints[tempIdx].isTemp = false;
            }

            pendingLine.isPending = false;
            pendingLine.to        = shapePoints[tempIdx]?.num || 2;
            return { endX, endY, tempIdx };
        };

        if (pendingFreeLines.length === 1) {
            const pendingLine = pendingFreeLines[0];
            const { tempIdx } = processPendingLine(pendingLine);

            pendingFreeLines = [];

            const lineData = _makeLineData(
                lineIdCounter++,
                pendingLine.to, 1,
                { direction: closingLineData.direction, lineType: closingLineData.lineType, elements: closingLineData.elements, quadrant: null },
                closingLength, true, false
            );
            figureLines.push(lineData);

            appState.isClosingLine = false;
            redrawEntireFigure();
            showToast('Фігуру розраховано успішно!', 'success');

        } else if (pendingFreeLines.length === 2) {
            const regularLine  = pendingFreeLines.find(l => !l.isClosing);
            const closingFree  = pendingFreeLines.find(l =>  l.isClosing);
            if (!regularLine || !closingFree) {
                showToast('Помилка: не знайдено потрібні лінії', 'error');
                return;
            }

            const { tempIdx } = processPendingLine(regularLine);

            closingFree.isPending = false;
            closingFree.from      = shapePoints[tempIdx]?.num || 2;
            closingFree.to        = 1;

            pendingFreeLines = [];
            appState.isClosingLine = false;
            redrawEntireFigure();
            showToast('Трикутник розраховано успішно!', 'success');

        } else {
            showToast('Розрахунок для більше ніж двох free-ліній поки не підтримується', 'warning');
        }
    }

    /* ───────────────────────────────────────────
       Автомасштабування shapeCanvas
    ─────────────────────────────────────────── */
    function autoScaleAndCenterFigure() {
        if (shapePoints.length < 2) return;
        const svg = document.getElementById('shapeCanvas');
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        shapePoints.forEach(p => {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        });
        const fw = maxX - minX, fh = maxY - minY;
        const padX = Math.max(fw * 0.2, 50);
        const padY = Math.max(fh * 0.2, 50);
        svg.setAttribute('viewBox', `${minX - padX} ${minY - padY} ${fw + padX * 2} ${fh + padY * 2}`);
    }

    /* ───────────────────────────────────────────
       Номер приміщення в центрі фігури
    ─────────────────────────────────────────── */
    function drawRoomNumber() {
        if (!roomNumber || shapePoints.length < 3) return;
        const svg = document.getElementById('shapeCanvas');
        const validPoints = shapePoints.filter(p => !p.isTemp);
        let cx = 0, cy = 0;
        validPoints.forEach(p => { cx += p.x; cy += p.y; });
        cx /= validPoints.length;
        cy /= validPoints.length;
        svg.appendChild(buildRoomNumberText(cx, cy, roomNumber));
    }

    function buildRoomNumberText(cx, cy, number) {
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
    }

    /* ═══════════════════════════════════════════
       ШВИДКЕ СТВОРЕННЯ ФІГУР
    ═══════════════════════════════════════════ */
    window.openQuickShapeModal = function () {
        document.getElementById('quickShapeModal').style.display = 'block';

        document.querySelectorAll('input[name="shapeType"]').forEach(radio => {
            radio.addEventListener('change', function () {
                const label = document.getElementById('quickDimensionsLabel');
                if (this.value === 'rectangle') {
                    label.textContent = 'Розміри (ширина висота через пробіл):';
                    document.getElementById('quickDimensionsInput').placeholder = '3.5 4.2';
                } else {
                    label.textContent = 'Розміри (сторона1 сторона2 сторона3 через пробіл):';
                    document.getElementById('quickDimensionsInput').placeholder = '3.5 4.2 5.0';
                }
            });
        });

        setTimeout(() => document.getElementById('quickDimensionsInput').focus(), 100);
    };

    window.closeQuickShapeModal = function () {
        document.getElementById('quickShapeModal').style.display = 'none';
        document.getElementById('quickDimensionsInput').value = '';
    };

    window.createQuickShape = function () {
        const shapeType = document.querySelector('input[name="shapeType"]:checked').value;
        const rawInput  = document.getElementById('quickDimensionsInput').value.trim();

        if (!rawInput) {
            showToast('Введіть розміри фігури', 'warning');
            return;
        }

        const dims = rawInput.split(/\s+/).map(d => {
            const n = parseFloat(d.replace(',', '.'));
            return isNaN(n) ? null : n;
        }).filter(d => d !== null);

        if (shapeType === 'rectangle') {
            if (dims.length < 2) { showToast('Для прямокутника потрібно 2 розміри', 'warning'); return; }
            createRectangle(dims[0], dims[1]);
        } else if (shapeType === 'triangle') {
            if (dims.length < 3) { showToast('Для трикутника потрібно 3 розміри', 'warning'); return; }
            createTriangle(dims[0], dims[1], dims[2]);
        }

        closeQuickShapeModal();
    };

    function _resetShapeState() {
        figureLines    = [];
        pendingFreeLines = [];
        lineIdCounter  = 1;
        pointCounter   = 1;
        appState.calculatedArea = null;
        appState.customArea     = null;

        const svg = document.getElementById('shapeCanvas');
        resetSvgCanvas(svg);
    }

    function createRectangle(width, height) {
        _resetShapeState();

        const points = [
            { x: START_X,               y: START_Y,               dir: 'right',  len: width,  closing: false },
            { x: START_X + width * SCALE, y: START_Y,              dir: 'bottom', len: height, closing: false },
            { x: START_X + width * SCALE, y: START_Y + height * SCALE, dir: 'left', len: width, closing: false },
            { x: START_X,               y: START_Y + height * SCALE, dir: 'top',  len: height, closing: true  }
        ];

        points.forEach((pt, idx) => {
            const from = shapePoints[shapePoints.length - 1];
            const toX  = idx < 3 ? points[idx + 1]?.x ?? START_X : START_X;
            const toY  = idx < 3 ? points[idx + 1]?.y ?? START_Y : START_Y;

            const lineDataMeta = { dimensionVisible: true, dimensionRotated: false };
            _drawShapeLine(from.x, from.y, toX, toY, pt.len, pt.closing, lineDataMeta);

            if (!pt.closing) {
                pointCounter++;
                shapePoints.push({ x: toX, y: toY, num: pointCounter });
            }

            figureLines.push({
                id: lineIdCounter++, from: from.num, to: pt.closing ? 1 : pointCounter,
                direction: pt.dir, lineType: 'line',
                elements: [{ type: 'number', value: parseFloat(pt.len) }],
                code: `${pt.dir}\nline\n${parseFloat(pt.len).toFixed(2)}`,
                length: parseFloat(pt.len), isClosing: pt.closing, isPending: false,
                dimensionVisible: true, dimensionRotated: false
            });
        });

        calculateAndDisplayArea();
        updateLinesList();
        autoScaleAndCenterFigure();
    }

    function createTriangle(side1, side2, side3) {
        if (side1 + side2 <= side3 || side1 + side3 <= side2 || side2 + side3 <= side1) {
            showToast('Неможливо створити трикутник (порушена нерівність трикутника)', 'error');
            return;
        }

        _resetShapeState();

        const from1 = shapePoints[0];
        const endX2 = START_X + side1 * SCALE;
        const endY2 = START_Y;

        const lineDataMeta = { dimensionVisible: true, dimensionRotated: false };
        _drawShapeLine(from1.x, from1.y, endX2, endY2, side1, false, lineDataMeta);
        pointCounter++;
        shapePoints.push({ x: endX2, y: endY2, num: pointCounter });
        figureLines.push({
            id: lineIdCounter++, from: 1, to: 2, direction: 'right', lineType: 'line',
            elements: [{ type: 'number', value: parseFloat(side1) }],
            code: `right\nline\n${parseFloat(side1).toFixed(2)}`,
            length: parseFloat(side1), isClosing: false, isPending: false,
            dimensionVisible: true, dimensionRotated: false
        });

        // Третя точка за теоремою косинусів
        const cosAngle  = (side1 ** 2 + side2 ** 2 - side3 ** 2) / (2 * side1 * side2);
        const angle     = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
        const endX3 = endX2 + Math.cos(angle) * side2 * SCALE;
        const endY3 = endY2 + Math.sin(angle) * side2 * SCALE;

        const from2 = shapePoints[1];
        _drawShapeLine(from2.x, from2.y, endX3, endY3, side2, false, lineDataMeta);
        pointCounter++;
        shapePoints.push({ x: endX3, y: endY3, num: pointCounter });
        figureLines.push({
            id: lineIdCounter++, from: 2, to: 3, direction: 'free', lineType: 'line',
            elements: [{ type: 'number', value: parseFloat(side2) }],
            code: `free\nline\n${parseFloat(side2).toFixed(2)}`,
            length: parseFloat(side2), isClosing: false, isPending: false, quadrant: 'bottom',
            dimensionVisible: true, dimensionRotated: false
        });

        const from3 = shapePoints[2];
        _drawShapeLine(from3.x, from3.y, START_X, START_Y, side3, true, lineDataMeta);
        figureLines.push({
            id: lineIdCounter++, from: 3, to: 1, direction: 'free', lineType: 'line',
            elements: [{ type: 'number', value: parseFloat(side3) }],
            code: `free\nline\n${parseFloat(side3).toFixed(2)}`,
            length: parseFloat(side3), isClosing: true, isPending: false,
            dimensionVisible: true, dimensionRotated: false
        });

        calculateAndDisplayArea();
        updateLinesList();
        autoScaleAndCenterFigure();
    }

    /* ───────────────────────────────────────────
       Допоміжна: намалювати лінію + розмір + точку на shapeCanvas
    ─────────────────────────────────────────── */
    function _drawShapeLine(x1, y1, x2, y2, length, isClosing, lineData) {
        const svg = document.getElementById('shapeCanvas');
        _renderSvgLine(svg, x1, y1, x2, y2);
        const numLen = typeof length === 'number' ? length : parseFloat(length);
        drawLineDimension(x1, y1, x2, y2, numLen, lineData);
        if (!isClosing) {
            _renderSvgPoint(svg, x2, y2, pointCounter + 1);
        }
    }

    /* ───────────────────────────────────────────
       SVG-примітиви
    ─────────────────────────────────────────── */
    function _renderSvgLine(svg, x1, y1, x2, y2, id) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', 'black');
        line.setAttribute('stroke-width', '1');
        if (id !== undefined) line.setAttribute('id', `line-${id}`);
        svg.appendChild(line);
    }

    function _renderSvgPoint(svg, x, y, num) {
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
    }

    function _makeSvgText(x, y, content, rotateAngle) {
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
    }

    /* ═══════════════════════════════════════════
       СПИСОК ЛІНІЙ (бічна панель у shapeModal)
    ═══════════════════════════════════════════ */
    function updateLinesList() {
        const linesList = document.getElementById('linesList');
        linesList.innerHTML = '';

        // --- Чекбокс "Будівля" ---
        linesList.appendChild(_makeCheckboxRow(
            'buildingTypeCheckbox', 'Будівля', isBuilding, toggleBuildingType
        ));

        // --- Чекбокс "Розміри ззовні" ---
        linesList.appendChild(_makeCheckboxRow(
            'dimensionSideCheckbox', 'Розміри ззовні', dimensionsOutside, toggleDimensionSide
        ));

        // --- Збереження / відновлення поля номера приміщення ---
        const existingInput = document.getElementById('roomNumberInput');
        if (existingInput) {
            roomNumberInputValue          = existingInput.value;
            roomNumberInputFocused        = document.activeElement === existingInput;
            roomNumberInputSelectionStart = existingInput.selectionStart;
            roomNumberInputSelectionEnd   = existingInput.selectionEnd;
        }

        linesList.appendChild(_makeRoomNumberRow());

        setTimeout(() => {
            const inp = document.getElementById('roomNumberInput');
            if (roomNumberInputFocused && inp) {
                inp.focus();
                try { inp.setSelectionRange(roomNumberInputSelectionStart, roomNumberInputSelectionEnd); }
                catch { inp.setSelectionRange(inp.value.length, inp.value.length); }
            }
        }, 0);

        // --- Площа ---
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
            areaInput.type       = 'number';
            areaInput.inputMode  = 'decimal';
            areaInput.step       = '0.1';
            areaInput.value      = appState.customArea || appState.calculatedArea;
            areaInput.style.cssText = 'width: 100%; padding: 4px; font-size: 12px; text-align: center; border: 1px solid #ddd; border-radius: 4px;';
            areaInput.onchange = function () { appState.customArea = parseFloat(this.value).toFixed(1); };
            areaInputWrap.appendChild(areaInput);
            linesList.appendChild(areaInputWrap);
        }

        // --- Список ліній ---
        figureLines.forEach(line => {
            const lineContainer = document.createElement('div');
            const bgColor = line.isPending ? '#fff3e0' : '#f0f0f0';
            lineContainer.style.cssText = `padding: 6px 8px; background: ${bgColor}; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;`;

            const lineBtn = document.createElement('button');
            lineBtn.style.cssText = 'flex: 1; padding: 4px; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 12px; font-weight: bold;';
            lineBtn.textContent = `${line.from}-${line.to ?? '?'}${line.isPending ? ' (очікування)' : ''}`;
            lineBtn.onclick = () => editLine(line);
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
    }

    function _makeCheckboxRow(id, label, checked, onChange) {
        const wrap  = document.createElement('div');
        wrap.style.cssText = 'margin-bottom: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';

        const lbl   = document.createElement('label');
        lbl.style.cssText = 'display: flex; align-items: center; cursor: pointer; font-size: 12px;';

        const inp   = document.createElement('input');
        inp.type    = 'checkbox';
        inp.id      = id;
        inp.checked = checked;
        inp.style.cssText = 'margin-right: 8px; width: 16px; height: 16px; cursor: pointer;';
        inp.onchange = onChange;

        const span = document.createElement('span');
        span.textContent = label;

        lbl.appendChild(inp);
        lbl.appendChild(span);
        wrap.appendChild(lbl);
        return wrap;
    }

    function _makeRoomNumberRow() {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'margin-bottom: 15px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';

        const lbl = document.createElement('label');
        lbl.style.cssText   = 'display: block; font-size: 12px; font-weight: bold; margin-bottom: 5px;';
        lbl.textContent     = '№ приміщення:';
        wrap.appendChild(lbl);

        const inp = document.createElement('input');
        inp.type        = 'text';
        inp.id          = 'roomNumberInput';
        inp.placeholder = '1-1';
        inp.style.cssText = 'width: 100%; padding: 4px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;';
        inp.value       = roomNumberInputValue;
        inp.onchange    = function () { roomNumber = this.value.trim(); redrawEntireFigure(); };
        wrap.appendChild(inp);

        const hint = document.createElement('div');
        hint.style.cssText = 'font-size: 10px; color: #666; margin-top: 3px;';
        hint.textContent   = 'Формат: 1-1';
        wrap.appendChild(hint);

        return wrap;
    }

    function _makeSmallCheckbox(checked, title, onChange) {
        const inp   = document.createElement('input');
        inp.type    = 'checkbox';
        inp.checked = checked;
        inp.title   = title;
        inp.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        inp.onchange = function (e) { e.stopPropagation(); onChange(this.checked); };
        return inp;
    }

    /* ───────────────────────────────────────────
       Ініціалізація
    ─────────────────────────────────────────── */
    setTimeout(() => {
        const inp = document.getElementById('roomNumberInput');
        if (inp) inp.value = roomNumber;
    }, 100);

}); // DOMContentLoaded
