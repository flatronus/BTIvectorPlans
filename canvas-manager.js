/**
 * canvas-manager.js — Керування полотнами (вкладки, zoom, збереження).
 * Залежності: constants.js, state.js, g.js, svg-primitives.js, toast.js
 */

/* ── Внутрішні хелпери ── */
function _getActiveCanvas() {
    if (!window.canvasManager || !window.canvasManager.activeCanvasId) return null;
    return window.canvasManager.canvases.find(c => c.id === window.canvasManager.activeCanvasId) || null;
}

function _getActiveSvg(canvas) {
    return document.querySelector(`[data-canvas-id="${canvas.id}"] svg`);
}

/* ── canvasManager ── */
window.canvasManager = {
    canvases:       [],
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
        const container = document.getElementById('canvas-container');
        const wrapper   = document.createElement('div');
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
        if (this.activeCanvasId !== null) {
            const prev = this.canvases.find(c => c.id === this.activeCanvasId);
            if (prev) {
                prev.hierarchyData      = G.hierarchyData;
                prev.hierarchyIdCounter = G.hierarchyIdCounter;
            }
        }

        this.activeCanvasId = id;

        const next = this.canvases.find(c => c.id === id);
        if (next) {
            G.hierarchyData      = next.hierarchyData      || [];
            G.hierarchyIdCounter = next.hierarchyIdCounter || 1;
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

        G.selectedHierarchyItem = null;
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
        if (!svg) { showToast('Невірний SVG-файл', 'error'); return; }

        const id = this.nextId++;
        const viewBox = svg.getAttribute('viewBox');
        const [x, y, width, height] = viewBox
            ? viewBox.split(/\s+/).map(Number)
            : [0, 0, 900, 1200];

        const canvas = {
            id, name: `C${id}`, fullName: name || `Canvas ${id}`,
            viewBox: { x, y, width, height },
            savedPath: `${name || 'imported'}.svg`,
            hierarchyData: [], hierarchyIdCounter: 1
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
        if (this.activeCanvasId === id) this.setActiveCanvas(this.canvases[0].id);
    },

    saveCanvas(id) {
        const canvas   = this.canvases.find(c => c.id === id);
        if (!canvas) return;
        const canvasEl = document.querySelector(`[data-canvas-id="${id}"]`);
        const svgEl    = canvasEl.querySelector('svg');
        const svgData  = svgEl.outerHTML;
        const blob     = new Blob([svgData], { type: 'image/svg+xml' });

        const isMobile  = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isDesktop = !isMobile && 'showSaveFilePicker' in window;

        if (isDesktop)                          this.saveWithFilePicker(canvas, blob);
        else if (isMobile || G.isWebCodeApp)    this.showCopyModal(svgData, canvas.savedPath || `${canvas.name}.svg`);
        else                                    this.saveWithDownload(canvas, blob);
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
            if (err.name !== 'AbortError') showToast('Помилка збереження', 'error');
        }
    },

    showCopyModal(svgContent, fileName) {
        document.getElementById('svgCode').value          = svgContent;
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
            link.href = url; link.download = fileName; link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
            showToast(`Файл збережено: ${fileName}`, 'success');
        } catch (err) {
            showToast('Помилка збереження: ' + err.message, 'error');
        }
    },

    attachCanvasEvents(svgElement, canvas) {
        let isDragging = false, startX, startY;
        let initialDistance = 0, initialViewBox = null;

        svgElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                isDragging = true; startX = e.clientX; startY = e.clientY;
                svgElement.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = (startX - e.clientX) * (canvas.viewBox.width  / svgElement.clientWidth);
            const dy = (startY - e.clientY) * (canvas.viewBox.height / svgElement.clientHeight);
            canvas.viewBox.x += dx; canvas.viewBox.y += dy;
            svgElement.setAttribute('viewBox',
                `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
            startX = e.clientX; startY = e.clientY;
        });

        document.addEventListener('mouseup', () => {
            isDragging = false; svgElement.style.cursor = 'grab';
        });

        svgElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true; startX = e.touches[0].clientX; startY = e.touches[0].clientY;
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
                canvas.viewBox.x += dx; canvas.viewBox.y += dy;
                svgElement.setAttribute('viewBox',
                    `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
                startX = e.touches[0].clientX; startY = e.touches[0].clientY;
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

        svgElement.addEventListener('touchend', () => { isDragging = false; initialDistance = 0; });

        svgElement.style.cursor = 'grab';
        if (/Android|iPhone|iPad/.test(navigator.userAgent)) svgElement.style.touchAction = 'none';
    }
};

/* ── Zoom ── */
window.zoomIn = function () {
    const canvas = _getActiveCanvas(); if (!canvas) return;
    const svgEl  = _getActiveSvg(canvas); if (!svgEl) return;
    canvas.viewBox.width  *= 0.9; canvas.viewBox.height *= 0.9;
    canvas.viewBox.x += canvas.viewBox.width  * 0.05;
    canvas.viewBox.y += canvas.viewBox.height * 0.05;
    svgEl.setAttribute('viewBox',
        `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
};

window.zoomOut = function () {
    const canvas = _getActiveCanvas(); if (!canvas) return;
    const svgEl  = _getActiveSvg(canvas); if (!svgEl) return;
    canvas.viewBox.width  *= 1.1; canvas.viewBox.height *= 1.1;
    canvas.viewBox.x -= canvas.viewBox.width  * 0.045;
    canvas.viewBox.y -= canvas.viewBox.height * 0.045;
    svgEl.setAttribute('viewBox',
        `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
};

/* ── Збереження активного полотна ── */
window.saveActiveCanvas = function () {
    const canvas = _getActiveCanvas();
    if (canvas) window.canvasManager.saveCanvas(canvas.id);
};

/* ── Модалка копіювання SVG ── */
window.copySvgCode = function () {
    const textarea = document.getElementById('svgCode');
    textarea.select(); textarea.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(textarea.value)
        .then(() => showToast('Скопійовано в буфер обміну!', 'success'))
        .catch(() => { document.execCommand('copy'); showToast('Скопійовано (резервний метод)!', 'success'); });
};

window.closeModal = function () {
    document.getElementById('copyModal').style.display = 'none';
};
