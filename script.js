document.addEventListener('DOMContentLoaded', function() {
    const isWebCodeApp = window.location.protocol === 'file:' ||
                         !window.location.hostname ||
                         window.location.hostname === 'localhost' ||
                         navigator.userAgent.toLowerCase().includes('web code') ||
                         /Android/.test(navigator.userAgent);  // Додано для Android-планшетів
    window.isWebCodeApp = isWebCodeApp;

    // Canvas Management System
    const canvasManager = {
        canvases: [],
        activeCanvasId: null,
        nextId: 1,

        createCanvas() {
            const id = this.nextId++;
            const canvas = {
                id: id,
                name: `Canvas ${id}`,
                viewBox: { x: 0, y: 0, width: 900, height: 1200 },
                savedPath: null
            };
            
            this.canvases.push(canvas);
            this.renderCanvas(canvas);
            this.renderTab(canvas);
            this.setActiveCanvas(id);
            
            return canvas;
        },

        renderCanvas(canvas) {
            const container = document.getElementById('canvas-container');
            const svgElement = document.createElement('div');
            svgElement.className = 'w-full h-full';
            svgElement.style.display = 'none';
            svgElement.setAttribute('data-canvas-id', canvas.id);
            
            svgElement.innerHTML = `
                <svg class="w-full h-full bg-[#e6f2ff]" viewBox="${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}" preserveAspectRatio="xMidYMid meet">
                    <rect 
                        x="50" 
                        y="50" 
                        width="794" 
                        height="1123" 
                        fill="none" 
                        stroke="#1e88e5" 
                        stroke-width="2" 
                        vector-effect="non-scaling-stroke"
                        class="paper-frame"
                    />
                </svg>
            `;
            
            container.appendChild(svgElement);
            this.attachCanvasEvents(svgElement.querySelector('svg'), canvas);
        },

        renderTab(canvas) {
            const tabsContainer = document.getElementById('tabs-container');
            const tab = document.createElement('button');
            tab.className = 'px-4 py-2 text-sm rounded-t hover:bg-white transition bg-gray-50 flex items-center';  // Додано flex для кращого вирівнювання на touch
            tab.setAttribute('data-tab-id', canvas.id);
            tab.innerHTML = `
                <span>${canvas.name}</span>
                <i class="fas fa-times ml-2 text-gray-400 hover:text-red-600 cursor-pointer" onclick="event.stopPropagation(); window.canvasManager.closeCanvas(${canvas.id})" style="min-width: 16px;"></i>
            `;
            tab.onclick = () => this.setActiveCanvas(canvas.id);
            tabsContainer.appendChild(tab);
        },

        setActiveCanvas(id) {
            this.activeCanvasId = id;
            
            // Hide all canvases
            document.querySelectorAll('[data-canvas-id]').forEach(el => {
                el.style.display = 'none';
            });
            
            // Show active canvas
            const activeCanvas = document.querySelector(`[data-canvas-id="${id}"]`);
            if (activeCanvas) activeCanvas.style.display = 'block';
            
            // Update tabs
            document.querySelectorAll('[data-tab-id]').forEach(tab => {
                if (parseInt(tab.getAttribute('data-tab-id')) === id) {
                    tab.classList.add('bg-white', 'border-t-2', 'border-blue-600');
                    tab.classList.remove('bg-gray-50');
                } else {
                    tab.classList.remove('bg-white', 'border-t-2', 'border-blue-600');
                    tab.classList.add('bg-gray-50');
                }
            });
            
            // Update global svg reference
            window.svg = activeCanvas ? activeCanvas.querySelector('svg') : null;
        },

        closeCanvas(id) {
            if (this.canvases.length <= 1) {
                alert('Cannot close the last canvas');
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
            const canvas = this.canvases.find(c => c.id === id);
            if (!canvas) return;
            
            const canvasElement = document.querySelector(`[data-canvas-id="${id}"]`);
            const svgElement = canvasElement.querySelector('svg');
            
            // Get SVG content
            const svgData = svgElement.outerHTML;
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            
            if ('showSaveFilePicker' in window && !isWebCodeApp) {  // Не використовувати в Web Code
                this.saveWithFilePicker(canvas, blob);
            } else if (isWebCodeApp || isMobile) {
                this.saveForWebCodeOrMobile(canvas, blob);
            } else {
                this.saveWithDownload(canvas, blob);
            }
        },
        
        async saveWithFilePicker(canvas, blob) {
            try {
                const fileName = canvas.savedPath || `${canvas.name}.svg`;
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: 'SVG Files',
                        accept: { 'image/svg+xml': ['.svg'] }
                    }]
                });
                
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                
                canvas.savedPath = handle.name;
                canvas.fileHandle = handle;
                
                alert(`Canvas saved as ${canvas.savedPath}`);
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('Save failed:', err);
                    alert('Failed to save file');
                }
            }
        },

        saveForWebCodeOrMobile(canvas, blob, fileName) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const svgContent = e.target.result;
                // Замість prompt — відкриваємо модалку
                document.getElementById('svgCode').value = svgContent;
                document.getElementById('modalTitle').textContent = `Copy SVG Code for "${fileName}"`;
                document.getElementById('copyModal').style.display = 'block';
            };
            reader.readAsText(blob);
        },

        fallbackPrompt(svgContent, fileName) {
            alert(`Copy this code and save as "${fileName}":\n(Select all and copy)`);
            prompt('SVG Code:', svgContent);
        },
        
        saveWithDownload(canvas, blob) {
            // ... (залишається без змін, як у вашому коді)
            try {
                let fileName;
                if (canvas.savedPath) {
                    fileName = canvas.savedPath;
                } else {
                    fileName = prompt('Enter file name:', `${canvas.name}.svg`);
                    if (!fileName) return;
                    if (!fileName.endsWith('.svg')) {
                        fileName = `${fileName}.svg`;
                    }
                    canvas.savedPath = fileName;
                }
                
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                
                document.body.appendChild(link);
                link.click();
                
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    alert(`File saved: ${fileName}`);
                }, 100);
                
            } catch (err) {
                alert('Save error: ' + err.message);
            }
        },

        attachCanvasEvents(svgElement, canvas) {
            let isDragging = false;
            let startX, startY;
            let initialDistance = 0;
            let initialViewBox = null;

            // ... (touch/mouse events залишаються без змін, вони вже оптимізовані для Android)

            // Додано: кращий cursor для touch
            if (/Android|iPhone|iPad/.test(navigator.userAgent)) {
                svgElement.style.touchAction = 'manipulation';  // Для кращої responsivity на touch
            }
        }
    };
    
    // Make canvasManager globally accessible
    window.canvasManager = canvasManager;
    // Initialize first canvas
    canvasManager.createCanvas();

    // Toolbar button functionality (без змін)

    // Додано: Клавіатурні скорочення (працюють на планшеті з клавіатурою)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    canvasManager.createCanvas();
                    break;
                case 'o':
                    e.preventDefault();
                    // Додати логіку open, якщо потрібно
                    alert('Open functionality: Implement window.canvasManager.openCanvas()');
                    break;
                case 's':
                    e.preventDefault();
                    saveActiveCanvas();
                    break;
                case '=':
                case '+':
                    e.preventDefault();
                    zoomIn();
                    break;
                case '-':
                    e.preventDefault();
                    zoomOut();
                    break;
            }
        } else {
            switch (e.key.toLowerCase()) {
                case 'h':
                    // Toggle hand tool
                    document.querySelector('.fa-hand-paper').closest('.toolbar-button').click();
                    break;
                case 'z':
                    // Toggle zoom tool
                    document.querySelector('.fa-search').closest('.toolbar-button').click();
                    break;
                case 'f':
                    // Frame tool
                    document.querySelector('.fa-square').closest('.toolbar-button').click();
                    break;
            }
        }
    });

    // ... (інші функції без змін: isHandToolActive, zoomIn, zoomOut, saveActiveCanvas)

    window.saveActiveCanvas = function() {
        if (window.canvasManager && window.canvasManager.activeCanvasId) {
            window.canvasManager.saveCanvas(window.canvasManager.activeCanvasId);
        }
    };

    // Special handling for Web Code (оновлено)
    window.saveToWebCode = function(fileName, content) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(content).then(() => {
                alert(`SVG copied! Paste into "${fileName}" in Web Code.`);
            }).catch(() => {
                prompt(`Copy manually:`, content);
            });
        } else {
            prompt(`Save as "${fileName}":`, content);
        }
    };
    // Функції для модалки
window.copySvgCode = function() {
    const textarea = document.getElementById('svgCode');
    textarea.select();
    textarea.setSelectionRange(0, 99999); // Для мобільних
    navigator.clipboard.writeText(textarea.value).then(() => {
        alert('Copied to clipboard! Paste into your editor.');
    }).catch(() => {
        // Fallback для старих браузерів
        document.execCommand('copy');
        alert('Copied (fallback method)!');
    });
};

window.closeModal = function() {
    document.getElementById('copyModal').style.display = 'none';
};

// Закриття модалки по кліку поза нею
window.onclick = function(event) {
    const modal = document.getElementById('copyModal');
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};
});