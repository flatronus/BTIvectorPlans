document.addEventListener('DOMContentLoaded', function() {
    // Визначення середовища (покращена логіка)
    const isWebCodeApp = navigator.userAgent.toLowerCase().includes('web code');
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isLocalFile = window.location.protocol === 'file:';
    
    window.isWebCodeApp = isWebCodeApp;
    window.isAndroid = isAndroid;

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
    
    // Визначення платформи
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isDesktop = !isMobile && 'showSaveFilePicker' in window;
    
    // Вибір методу збереження
    if (isDesktop) {
        // ПК - File System Access API
        this.saveWithFilePicker(canvas, blob);
    } else if (isMobile || isWebCodeApp) {
        // Android/Mobile - модалка з копіюванням
        const fileName = canvas.savedPath || `${canvas.name}.svg`;
        this.showCopyModal(svgData, fileName);
    } else {
        // Fallback - звичайне завантаження
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
        
        showCopyModal(svgContent, fileName) {
    document.getElementById('svgCode').value = svgContent;
    document.getElementById('modalTitle').textContent = `Copy SVG Code for "${fileName}"`;
    document.getElementById('copyModal').style.display = 'block';
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
                link.style.display = 'none';
                
                document.body.appendChild(link);
                link.click();
                
                setTimeout(() => {
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 100);
                
                alert(`File saved: ${fileName}`);
                
            } catch (err) {
                console.error('Save error:', err);
                alert('Save error: ' + err.message);
            }
        },

        attachCanvasEvents(svgElement, canvas) {
            let isDragging = false;
            let startX, startY;
            let initialDistance = 0;
            let initialViewBox = null;

            // Mouse events для десктопу
            svgElement.addEventListener('mousedown', (e) => {
                if (e.button === 0) { // Ліва кнопка миші
                    isDragging = true;
                    startX = e.clientX;
                    startY = e.clientY;
                    svgElement.style.cursor = 'grabbing';
                }
            });

            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const dx = (startX - e.clientX) * (canvas.viewBox.width / svgElement.clientWidth);
                const dy = (startY - e.clientY) * (canvas.viewBox.height / svgElement.clientHeight);
                
                canvas.viewBox.x += dx;
                canvas.viewBox.y += dy;
                
                svgElement.setAttribute('viewBox', 
                    `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`
                );
                
                startX = e.clientX;
                startY = e.clientY;
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
                svgElement.style.cursor = 'grab';
            });

            // Touch events для планшета
            svgElement.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    isDragging = true;
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else if (e.touches.length === 2) {
                    isDragging = false;
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    initialDistance = Math.hypot(
                        touch2.clientX - touch1.clientX,
                        touch2.clientY - touch1.clientY
                    );
                    initialViewBox = { ...canvas.viewBox };
                }
            });

            svgElement.addEventListener('touchmove', (e) => {
                e.preventDefault();
                
                if (e.touches.length === 1 && isDragging) {
                    const dx = (startX - e.touches[0].clientX) * (canvas.viewBox.width / svgElement.clientWidth);
                    const dy = (startY - e.touches[0].clientY) * (canvas.viewBox.height / svgElement.clientHeight);
                    
                    canvas.viewBox.x += dx;
                    canvas.viewBox.y += dy;
                    
                    svgElement.setAttribute('viewBox', 
                        `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`
                    );
                    
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                } else if (e.touches.length === 2 && initialDistance > 0) {
                    const touch1 = e.touches[0];
                    const touch2 = e.touches[1];
                    const currentDistance = Math.hypot(
                        touch2.clientX - touch1.clientX,
                        touch2.clientY - touch1.clientY
                    );
                    
                    const scale = initialDistance / currentDistance;
                    canvas.viewBox.width = initialViewBox.width * scale;
                    canvas.viewBox.height = initialViewBox.height * scale;
                    
                    canvas.viewBox.width = Math.max(200, Math.min(5000, canvas.viewBox.width));
                    canvas.viewBox.height = Math.max(200, Math.min(5000, canvas.viewBox.height));
                    
                    svgElement.setAttribute('viewBox', 
                        `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`
                    );
                }
            });

            svgElement.addEventListener('touchend', () => {
                isDragging = false;
                initialDistance = 0;
            });

            // Оптимізація для touch-пристроїв
            if (/Android|iPhone|iPad/.test(navigator.userAgent)) {
                svgElement.style.touchAction = 'none';
                svgElement.style.cursor = 'grab';
            } else {
                svgElement.style.cursor = 'grab';
            }
        }
    };
    
    // Make canvasManager globally accessible
    window.canvasManager = canvasManager;
    // Initialize first canvas
    canvasManager.createCanvas();

    // Zoom functions
    window.zoomIn = function() {
        if (!window.canvasManager || !window.canvasManager.activeCanvasId) return;
        
        const canvas = window.canvasManager.canvases.find(c => c.id === window.canvasManager.activeCanvasId);
        if (!canvas) return;
        
        const svgElement = document.querySelector(`[data-canvas-id="${canvas.id}"] svg`);
        if (!svgElement) return;
        
        canvas.viewBox.width *= 0.9;
        canvas.viewBox.height *= 0.9;
        canvas.viewBox.x += canvas.viewBox.width * 0.05;
        canvas.viewBox.y += canvas.viewBox.height * 0.05;
        
        svgElement.setAttribute('viewBox', 
            `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`
        );
    };

    window.zoomOut = function() {
        if (!window.canvasManager || !window.canvasManager.activeCanvasId) return;
        
        const canvas = window.canvasManager.canvases.find(c => c.id === window.canvasManager.activeCanvasId);
        if (!canvas) return;
        
        const svgElement = document.querySelector(`[data-canvas-id="${canvas.id}"] svg`);
        if (!svgElement) return;
        
        canvas.viewBox.width *= 1.1;
        canvas.viewBox.height *= 1.1;
        canvas.viewBox.x -= canvas.viewBox.width * 0.045;
        canvas.viewBox.y -= canvas.viewBox.height * 0.045;
        
        svgElement.setAttribute('viewBox', 
            `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`
        );
    };

    // Toolbar button functionality (без змін)

    // Додано: Клавіатурні скорочення (працюють на десктопі та планшеті з клавіатурою)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch (e.key.toLowerCase()) {
                case 'n':
                    e.preventDefault();
                    canvasManager.createCanvas();
                    break;
                case 'o':
                    e.preventDefault();
                    alert('Open functionality: Not yet implemented');
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
        }
    });

    // ... (інші функції без змін: isHandToolActive, zoomIn, zoomOut, saveActiveCanvas)

    window.saveActiveCanvas = function() {
        if (window.canvasManager && window.canvasManager.activeCanvasId) {
            window.canvasManager.saveCanvas(window.canvasManager.activeCanvasId);
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