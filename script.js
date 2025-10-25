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
            viewBox: { x: 0, y: 0, width: 900, height: 1200 }
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
        tab.className = 'px-4 py-2 text-sm rounded-t hover:bg-white transition bg-gray-50';
        tab.setAttribute('data-tab-id', canvas.id);
        tab.innerHTML = `
            <span>${canvas.name}</span>
            <i class="fas fa-times ml-2 text-gray-400 hover:text-red-600" onclick="event.stopPropagation(); canvasManager.closeCanvas(${canvas.id})"></i>
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

    attachCanvasEvents(svgElement, canvas) {
        let isDragging = false;
        let startX, startY;
        let initialDistance = 0;
        let initialViewBox = null;

        svgElement.addEventListener('mousedown', (e) => {
            if (!isHandToolActive()) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            svgElement.style.cursor = 'grabbing';
            e.preventDefault();
        });

        svgElement.addEventListener('mousemove', (e) => {
            if (!isDragging || !isHandToolActive()) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const scale = canvas.viewBox.width / svgElement.clientWidth;
            
            canvas.viewBox.x -= dx * scale;
            canvas.viewBox.y -= dy * scale;
            
            svgElement.setAttribute('viewBox', `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
            
            startX = e.clientX;
            startY = e.clientY;
            e.preventDefault();
        });

        svgElement.addEventListener('mouseup', () => {
            isDragging = false;
            if (isHandToolActive()) {
                svgElement.style.cursor = 'grab';
            }
        });

        svgElement.addEventListener('mouseleave', () => {
            isDragging = false;
        });

        svgElement.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialViewBox = {...canvas.viewBox};
                e.preventDefault();
            } else if (isHandToolActive()) {
                isDragging = true;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                e.preventDefault();
            }
        });

        svgElement.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 && initialDistance > 0) {
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                const scale = initialDistance / currentDistance;
                const centerX = initialViewBox.x + initialViewBox.width / 2;
                const centerY = initialViewBox.y + initialViewBox.height / 2;
                
                canvas.viewBox.width = initialViewBox.width * scale;
                canvas.viewBox.height = initialViewBox.height * scale;
                canvas.viewBox.x = centerX - canvas.viewBox.width / 2;
                canvas.viewBox.y = centerY - canvas.viewBox.height / 2;
                
                svgElement.setAttribute('viewBox', `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
                e.preventDefault();
            } else if (isDragging && isHandToolActive()) {
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                const scale = canvas.viewBox.width / svgElement.clientWidth;
                
                canvas.viewBox.x -= dx * scale;
                canvas.viewBox.y -= dy * scale;
                
                svgElement.setAttribute('viewBox', `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
                
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                e.preventDefault();
            }
        });

        svgElement.addEventListener('touchend', () => {
            isDragging = false;
            initialDistance = 0;
            initialViewBox = null;
        });

        svgElement.style.cursor = 'default';
        svgElement.style.touchAction = 'none';
    }
};

// Initialize first canvas after DOM is loaded
canvasManager.createCanvas();

// Toolbar button functionality
document.querySelectorAll('.toolbar-button').forEach(button => {
    button.addEventListener('click', function() {
        const isHandButton = this.querySelector('.fa-hand-paper');
        
        if (isHandButton) {
            this.classList.toggle('bg-blue-50');
            const icon = this.querySelector('i');
            icon.classList.toggle('text-blue-600');
            icon.classList.toggle('text-gray-700');
            
            if(this.querySelector('span')) {
                this.querySelector('span').classList.toggle('text-blue-600');
            }
            
            if (window.svg) {
                window.svg.style.cursor = isHandToolActive() ? 'grab' : 'default';
            }
        } else {
            document.querySelectorAll('.toolbar-button').forEach(btn => {
                btn.classList.remove('bg-blue-50', 'text-blue-600');
                btn.querySelector('i').classList.remove('text-blue-600');
                btn.querySelector('i').classList.add('text-gray-700');
                if(btn.querySelector('span')) {
                    btn.querySelector('span').classList.remove('text-blue-600');
                }
            });
            
            this.classList.add('bg-blue-50');
            const icon = this.querySelector('i');
            icon.classList.remove('text-gray-700');
            icon.classList.add('text-blue-600');
            
            if(this.querySelector('span')) {
                this.querySelector('span').classList.add('text-blue-600');
            }
        }
    });
});

function isHandToolActive() {
    const handButton = document.querySelector('.fa-hand-paper');
    if (!handButton) return false;
    return handButton.closest('.toolbar-button').classList.contains('bg-blue-50');
}

const zoomFactor = 1.2;

function zoomIn() {
    const canvas = canvasManager.canvases.find(c => c.id === canvasManager.activeCanvasId);
    if (!canvas || !window.svg) return;
    
    const centerX = canvas.viewBox.x + canvas.viewBox.width / 2;
    const centerY = canvas.viewBox.y + canvas.viewBox.height / 2;
    
    canvas.viewBox.width /= zoomFactor;
    canvas.viewBox.height /= zoomFactor;
    canvas.viewBox.x = centerX - canvas.viewBox.width / 2;
    canvas.viewBox.y = centerY - canvas.viewBox.height / 2;
    
    window.svg.setAttribute('viewBox', `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
}

function zoomOut() {
    const canvas = canvasManager.canvases.find(c => c.id === canvasManager.activeCanvasId);
    if (!canvas || !window.svg) return;
    
    const centerX = canvas.viewBox.x + canvas.viewBox.width / 2;
    const centerY = canvas.viewBox.y + canvas.viewBox.height / 2;
    
    canvas.viewBox.width *= zoomFactor;
    canvas.viewBox.height *= zoomFactor;
    canvas.viewBox.x = centerX - canvas.viewBox.width / 2;
    canvas.viewBox.y = centerY - canvas.viewBox.height / 2;
    
    window.svg.setAttribute('viewBox', `${canvas.viewBox.x} ${canvas.viewBox.y} ${canvas.viewBox.width} ${canvas.viewBox.height}`);
}
