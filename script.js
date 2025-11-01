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
        
        openCanvas() {
            if ('showOpenFilePicker' in window) {
                // Сучасний API для ПК/мобільних (працює на Android Chrome 86+)
                window.showOpenFilePicker({
                    types: [{
                        description: 'SVG Files',
                        accept: { 'image/svg+xml': ['.svg'] }
                    }]
                }).then(async ([handle]) => {
                    const file = await handle.getFile();
                    const reader = new FileReader();
                    reader.onload = (e) => this.loadSvgFromContent(e.target.result, file.name.replace('.svg', ''));
                    reader.readAsText(file);
                }).catch(err => {
                    if (err.name !== 'AbortError') alert('Open failed: ' + err.message);
                });
            } else {
                // Fallback для старих браузерів/мобільних
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.svg';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => this.loadSvgFromContent(e.target.result, file.name.replace('.svg', ''));
                        reader.readAsText(file);
                    }
                };
                input.click();
            }
        },
        
        loadSvgFromContent(svgContent, name) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = svgContent;
            const svg = tempDiv.querySelector('svg');
            if (!svg) {
                alert('Invalid SVG file');
                return;
            }
            const id = this.nextId++;
            const viewBox = svg.getAttribute('viewBox');
            const [x, y, width, height] = viewBox ? viewBox.split(/\s+/).map(Number) : [0, 0, 900, 1200];
            const canvas = {
                id,
                name: `C${id}`,
                fullName: name || `Canvas ${id}`,
                viewBox: { x, y, width, height },
                savedPath: `${name || 'imported'}.svg`
            };
            this.canvases.push(canvas);
            this.renderImportedCanvas(canvas, svg.outerHTML);
            this.renderTab(canvas);
            this.setActiveCanvas(id);
        },
        
        renderImportedCanvas(canvas, svgContent) {
            const container = document.getElementById('canvas-container');
            const svgElement = document.createElement('div');
            svgElement.className = 'w-full h-full';
            svgElement.style.display = 'none';
            svgElement.setAttribute('data-canvas-id', canvas.id);
            svgElement.innerHTML = svgContent;
            container.appendChild(svgElement);
            this.attachCanvasEvents(svgElement.querySelector('svg'), canvas);
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
    
    // Функція відкриття модалки фігур (Shapes)
    window.openShapeModal = function() {
        document.getElementById('shapeModal').style.display = 'block';
    };
    
    // Функція закриття модалки фігур
    window.closeShapeModal = function() {
        document.getElementById('shapeModal').style.display = 'none';
    };
    
    // Змінні для створення фігур
    let shapePoints = [{x: 400, y: 300, num: 1}]; // Початкова точка
    let shapeLines = [];
    let pointCounter = 1;
    // Структура для зберігання ліній фігури
    let figureLines = []; // Масив об'єктів {id, from, to, direction, lineType, elements, code}
    let lineIdCounter = 1;
    
    // Функція додавання точки
    window.addPoint = function() {
        // Очистити поле вводу для нової лінії
        document.getElementById('coordInput').value = '';
        
        // Відкрити модалку введення координат
        document.getElementById('coordModal').style.display = 'block';
        
        // Скинути ID редагування
        window.editingLineId = null;
        
        // Фокус на поле (з невеликою затримкою для коректної роботи)
        setTimeout(() => {
            document.getElementById('coordInput').focus();
        }, 100);
    };
    
    // Функція замикання фігури
    window.closeShape = function() {
        if (shapePoints.length < 2) {
            alert('Недостатньо точок для замикання фігури');
            return;
        }
        
        // Остання точка
        const lastPoint = shapePoints[shapePoints.length - 1];
        // Перша точка
        const firstPoint = shapePoints[0];
        
        // Обчислюємо відстань між останньою та першою точкою
        const dx = firstPoint.x - lastPoint.x;
        const dy = firstPoint.y - lastPoint.y;
        const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
        
        // Конвертуємо в метри (масштаб: 1 метр = 50 пікселів)
        const scale = 50;
        const distanceInMeters = (distanceInPixels / scale).toFixed(2);
        
        // Визначаємо напрямок
        let direction = 'free';
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Визначаємо найближчий прямий напрямок (з толерантністю ±5°)
        if (Math.abs(angle - 0) < 5 || Math.abs(angle - 360) < 5) {
            direction = 'right';
        } else if (Math.abs(angle - 180) < 5 || Math.abs(angle + 180) < 5) {
            direction = 'left';
        } else if (Math.abs(angle - 90) < 5) {
            direction = 'bottom';
        } else if (Math.abs(angle + 90) < 5) {
            direction = 'top';
        }
        
        // Формуємо текст для поля вводу
        const coordText = `${direction}\nline\n${distanceInMeters}`;
        
        // Заповнюємо поле введення
        document.getElementById('coordInput').value = coordText;
        
        // Відкриваємо модалку координат
        document.getElementById('coordModal').style.display = 'block';
        
        // Встановлюємо курсор на перший рядок (початок поля)
        setTimeout(() => {
            const coordInput = document.getElementById('coordInput');
            coordInput.focus();
            coordInput.setSelectionRange(0, 0);
        }, 100);
        
        // Скидаємо ID редагування
        window.editingLineId = null;
    };
    
    // Функція додавання діагоналі
    window.addDiagonal = function() {
        alert('Функція "Діагональ" буде реалізована далі');
        console.log('Add diagonal clicked');
    };
    
    // Оновлення відображення фігури на полотні
    function updateShapeCanvas() {
        const svg = document.getElementById('shapeCanvas');
        // Очистити все крім початкової точки
        while (svg.childNodes.length > 2) {
            svg.removeChild(svg.lastChild);
        }
        
        // Малювати лінії
        shapeLines.forEach(line => {
            const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            lineEl.setAttribute('x1', line.x1);
            lineEl.setAttribute('y1', line.y1);
            lineEl.setAttribute('x2', line.x2);
            lineEl.setAttribute('y2', line.y2);
            lineEl.setAttribute('stroke', '#2196F3');
            lineEl.setAttribute('stroke-width', '2');
            svg.appendChild(lineEl);
        });
        
        // Малювати точки (крім першої)
        shapePoints.slice(1).forEach(point => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', '#e53935');
            svg.appendChild(circle);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', point.x + 10);
            text.setAttribute('y', point.y - 5);
            text.setAttribute('font-size', '16');
            text.setAttribute('fill', '#e53935');
            text.setAttribute('font-weight', 'bold');
            text.textContent = point.num;
            svg.appendChild(text);
        });
    }
    
    // Функція закриття модалки координат з обробкою введених даних
    window.closeCoordModal = function() {
        const inputText = document.getElementById('coordInput').value.trim();
        
        if (inputText) {
            const parsedData = parseCoordinateInput(inputText);
            
            if (parsedData) {
                // Якщо редагуємо існуючу лінію
                if (window.editingLineId) {
                    updateExistingLine(window.editingLineId, parsedData);
                    window.editingLineId = null;
                } else {
                    // Малюємо нову лінію
                    drawLineOnCanvas(parsedData);
                }
            }
        }
        
        document.getElementById('coordModal').style.display = 'none';
    };
    
    // Функція обробки введених координат
    window.submitCoords = function() {
        const input = document.getElementById('coordInput').value.trim();
        
        if (!input) {
            alert('Будь ласка, введіть координати');
            return;
        }
        
        // Розділити по рядках і перетворити на числа
        const numbers = input.split('\n')
            .map(line => line.trim())
            .filter(line => line !== '')
            .map(line => parseFloat(line))
            .filter(num => !isNaN(num));
        
        if (numbers.length === 0) {
            alert('Не знайдено жодного числа');
            return;
        }
        
        console.log('Введені координати:', numbers);
        alert(`Введено ${numbers.length} чисел: ${numbers.join(', ')}`);
        
        // TODO: Обробка координат для створення точок
        
        closeCoordModal();
    };
    
    // Змінні для налаштувань
    let currentAngle = 'up'; // up, down, left, right, free
    let currentLineType = 'line'; // line, arc
    
    // Функція вибору напрямку кута
    window.setAngle = function(direction) {
        currentAngle = direction;
        console.log('Обрано напрямок:', direction);
        
        const directions = {
            'up': 'top',
            'down': 'bottom',
            'right': 'right',
            'left': 'left',
            'free': 'free'
        };
        
        // Вставка коду напрямку в поле вводу координат
        const coordInput = document.getElementById('coordInput');
        const code = directions[direction];
        
        // Зберігаємо позицію курсора
        const cursorPos = coordInput.selectionStart;
        const textBefore = coordInput.value.substring(0, cursorPos);
        const textAfter = coordInput.value.substring(cursorPos);
        
        // Вставляємо код на позицію курсора (з новим рядком якщо потрібно)
        const newText = textBefore + (textBefore && !textBefore.endsWith('\n') ? '\n' : '') + code;
        coordInput.value = newText + textAfter;
        
        // Встановлюємо курсор після вставленого тексту
        const newCursorPos = newText.length;
        coordInput.setSelectionRange(newCursorPos, newCursorPos);
        
        // Повертаємо фокус на поле
        coordInput.focus();
        
        console.log('Встановлено код:', code);
    };
    
    // Функція вибору типу лінії
    window.setLineType = function(type) {
        currentLineType = type;
        console.log('Обрано тип лінії:', type === 'line' ? 'Лінія' : 'Дуга');
        
        const lineTypes = {
            'line': 'line',
            'arc': 'curve'
        };
        
        // Вставка коду типу лінії в поле вводу координат
        const coordInput = document.getElementById('coordInput');
        const code = lineTypes[type];
        
        // Зберігаємо позицію курсора
        const cursorPos = coordInput.selectionStart;
        const textBefore = coordInput.value.substring(0, cursorPos);
        const textAfter = coordInput.value.substring(cursorPos);
        
        // Вставляємо код на позицію курсора (з новим рядком якщо потрібно)
        const newText = textBefore + (textBefore && !textBefore.endsWith('\n') ? '\n' : '') + code;
        coordInput.value = newText + textAfter;
        
        // Встановлюємо курсор після вставленого тексту
        const newCursorPos = newText.length;
        coordInput.setSelectionRange(newCursorPos, newCursorPos);
        
        // Повертаємо фокус на поле
        coordInput.focus();
        
        console.log('Встановлено код:', code);
    };
    
    // Змінна для вибраного елемента
    let selectedElement = null;
    
    // Функція вибору елемента
    window.selectElement = function(code) {
        selectedElement = code;
        console.log('Обрано елемент:', code);
        
        // Вставка кодового значення в поле вводу координат
        const coordInput = document.getElementById('coordInput');
        
        // Зберігаємо позицію курсора
        const cursorPos = coordInput.selectionStart;
        const textBefore = coordInput.value.substring(0, cursorPos);
        const textAfter = coordInput.value.substring(cursorPos);
        
        // Перевіряємо останній символ перед курсором
        const lastChar = textBefore.slice(-1);
        
        // Якщо попередній символ - мінус, пробіл або цифра, вставляємо код БЕЗ нового рядка
        // В інших випадках - з новим рядком (якщо потрібно)
        let prefix = '';
        if (textBefore && !textBefore.endsWith('\n') && lastChar !== '-' && isNaN(lastChar)) {
            prefix = '\n';
        }
        
        const newText = textBefore + prefix + code;
        coordInput.value = newText + textAfter;
        
        // Встановлюємо курсор після вставленого тексту
        const newCursorPos = newText.length;
        coordInput.setSelectionRange(newCursorPos, newCursorPos);
        
        // Повертаємо фокус на поле
        coordInput.focus();
    };
    
    // Функція створення коду елемента "Вікно"
    function createWindowElement() {
        return `<!-- Вікно 1 (WI1) -->
    <!-- Параметри: ширина, висота -->
    <!-- Приклад: 100, 150 -->
    <g id="WI1">
      <rect x="0" y="0" width="100" height="150" 
            fill="none" stroke="black" stroke-width="2"/>
      <line x1="0" y1="75" x2="100" y2="75" 
            stroke="black" stroke-width="2"/>
    </g>`;
    }
    
    // Функція парсингу введених координат
    function parseCoordinateInput(inputText) {
        const lines = inputText.trim().split('\n').map(line => line.trim()).filter(line => line);
        
        if (lines.length < 2) {
            alert('Введіть принаймні напрямок та тип лінії');
            return null;
        }
        
        // Перший рядок - напрямок (top, bottom, left, right, free)
        const direction = lines[0].toLowerCase();
        if (!['top', 'bottom', 'left', 'right', 'free'].includes(direction)) {
            alert('Невірний напрямок. Використовуйте: top, bottom, left, right, free');
            return null;
        }
        
        // Другий рядок - тип лінії (line, curve)
        const lineType = lines[1].toLowerCase();
        if (!['line', 'curve'].includes(lineType)) {
            alert('Невірний тип лінії. Використовуйте: line, curve');
            return null;
        }
        
        // Решта рядків - числа та коди елементів
        const elements = [];
        for (let i = 2; i < lines.length; i++) {
            const value = lines[i];
            
            // Перевірка чи це число
            if (!isNaN(parseFloat(value))) {
                elements.push({ type: 'number', value: parseFloat(value) });
            } else {
                // Це код елемента
                elements.push({ type: 'element', value: value });
            }
        }
        
        return { direction, lineType, elements };
    }
    
    // Функція малювання лінії на полотні
    function drawLineOnCanvas(parsedData) {
        const svg = document.getElementById('shapeCanvas');
        const lastPoint = shapePoints[shapePoints.length - 1];
        
        // Обчислення кінцевої точки в залежності від напрямку
        let endX = lastPoint.x;
        let endY = lastPoint.y;
        let lineLength = 0;
        
        // Знаходимо загальну довжину лінії (останнє число в elements)
        for (let i = parsedData.elements.length - 1; i >= 0; i--) {
            if (parsedData.elements[i].type === 'number') {
                lineLength = parsedData.elements[i].value;
                break;
            }
        }
        
        // Масштаб: 1 метр = 50 пікселів
        const scale = 50;
        const scaledLength = lineLength * scale;
        
        switch(parsedData.direction) {
            case 'top':
                endY = lastPoint.y - scaledLength;
                break;
            case 'bottom':
                endY = lastPoint.y + scaledLength;
                break;
            case 'left':
                endX = lastPoint.x - scaledLength;
                break;
            case 'right':
                endX = lastPoint.x + scaledLength;
                break;
        }
        
        // Малюємо лінію
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', lastPoint.x);
        line.setAttribute('y1', lastPoint.y);
        line.setAttribute('x2', endX);
        line.setAttribute('y2', endY);
        line.setAttribute('stroke', '#2196F3');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('id', `line-${lineIdCounter}`);
        svg.appendChild(line);
        
        // Малюємо елементи на лінії
        drawElementsOnLine(parsedData, lastPoint.x, lastPoint.y, endX, endY, scale);
        
        // Додаємо нову точку
        pointCounter++;
        const newPoint = { x: endX, y: endY, num: pointCounter };
        shapePoints.push(newPoint);
        
        // Малюємо нову точку
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', endX);
        circle.setAttribute('cy', endY);
        circle.setAttribute('r', '5');
        circle.setAttribute('fill', '#e53935');
        svg.appendChild(circle);
        
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', endX + 10);
        text.setAttribute('y', endY - 5);
        text.setAttribute('font-size', '16');
        text.setAttribute('fill', '#e53935');
        text.setAttribute('font-weight', 'bold');
        text.textContent = pointCounter;
        svg.appendChild(text);
        
        // Зберігаємо лінію в масив
        const lineData = {
            id: lineIdCounter,
            from: lastPoint.num,
            to: pointCounter,
            direction: parsedData.direction,
            lineType: parsedData.lineType,
            elements: parsedData.elements,
            code: document.getElementById('coordInput').value
        };
        figureLines.push(lineData);
        
        // Оновлюємо список ліній
        updateLinesList();
        
        lineIdCounter++;
    }
    
    // Функція малювання елементів (вікна, двері, отвори) на лінії
    function drawElementsOnLine(parsedData, x1, y1, x2, y2, scale) {
        const svg = document.getElementById('shapeCanvas');
        const thickness = 0.20 * scale; // 0.20 метрів в пікселях (товщина елемента перпендикулярно до лінії)
        
        // Обчислюємо вектор напрямку лінії
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / length; // Одиничний вектор X вздовж лінії
        const uy = dy / length; // Одиничний вектор Y вздовж лінії
        
        // Перпендикулярний вектор (праворуч від лінії - додатне положення)
        const px = uy;  // Змінено знак
        const py = -ux; // Змінено знак
        
        // Парсимо елементи: очікуємо формат число1, число2, код_елемента (або -код_елемента)
        for (let i = 0; i < parsedData.elements.length; i++) {
            if (parsedData.elements[i].type === 'number' && 
                i + 1 < parsedData.elements.length && 
                parsedData.elements[i + 1].type === 'number' &&
                i + 2 < parsedData.elements.length &&
                parsedData.elements[i + 2].type === 'element') {
                
                const start = parsedData.elements[i].value * scale;
                const end = parsedData.elements[i + 1].value * scale;
                let elementCode = parsedData.elements[i + 2].value;
                
                // Перевірка на мінус перед кодом (розміщення з іншого боку)
                let side = 1; // 1 = праворуч (додатне), -1 = ліворуч (від'ємне)
                if (elementCode.startsWith('-')) {
                    side = -1;
                    elementCode = elementCode.substring(1); // Видаляємо мінус
                }
                
                // Позиція початку елемента на лінії
                const startX = x1 + ux * start;
                const startY = y1 + uy * start;
                
                // Довжина елемента вздовж лінії
                const elementLength = end - start;
                
                // Малюємо елемент відповідно до коду
                if (elementCode === 'WI1') {
                    // Вікно: прямокутник з поділом посередині
                    // Елемент прилипає зовнішньою стороною до лінії
                    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                    
                    // Координати чотирьох кутів прямокутника
                    // Одна сторона на лінії, інша зміщена на товщину перпендикулярно
                    
                    // Початок елемента - на лінії
                    const corner1X = startX;
                    const corner1Y = startY;
                    
                    // Кінець елемента - на лінії
                    const corner2X = startX + ux * elementLength;
                    const corner2Y = startY + uy * elementLength;
                    
                    // Кінець елемента - зміщений на товщину (ліворуч або праворуч)
                    const corner3X = startX + ux * elementLength + px * thickness * side;
                    const corner3Y = startY + uy * elementLength + py * thickness * side;
                    
                    // Початок елемента - зміщений на товщину
                    const corner4X = startX + px * thickness * side;
                    const corner4Y = startY + py * thickness * side;
                    
                    // Основний прямокутник
                    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    rect.setAttribute('points', `${corner1X},${corner1Y} ${corner2X},${corner2Y} ${corner3X},${corner3Y} ${corner4X},${corner4Y}`);
                    rect.setAttribute('fill', 'none');
                    rect.setAttribute('stroke', 'black');
                    rect.setAttribute('stroke-width', '2');
                    group.appendChild(rect);
                    
                    // Середня лінія (ділить прямокутник навпіл вздовж лінії, на половині товщини від лінії)
                    const midLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    
                    // Середина на початку елемента (посередині товщини)
                    const midX1 = startX + ux * (elementLength / 2) + px * (thickness / 2) * side;
                    const midY1 = startY + uy * (elementLength / 2) + py * (thickness / 2) * side;
                    
                    // Середина в кінці - паралельно до основи
                    const midX2 = midX1;
                    const midY2 = midY1;
                    
                    // Виправлення: лінія має йти вздовж довжини елемента
                    const midStartX = startX + px * (thickness / 2) * side;
                    const midStartY = startY + py * (thickness / 2) * side;
                    const midEndX = startX + ux * elementLength + px * (thickness / 2) * side;
                    const midEndY = startY + uy * elementLength + py * (thickness / 2) * side;
                    
                    midLine.setAttribute('x1', midStartX);
                    midLine.setAttribute('y1', midStartY);
                    midLine.setAttribute('x2', midEndX);
                    midLine.setAttribute('y2', midEndY);
                    midLine.setAttribute('stroke', 'black');
                    midLine.setAttribute('stroke-width', '2');
                    group.appendChild(midLine);
                    
                    svg.appendChild(group);
                }
                
                i += 2; // Пропускаємо оброблені елементи
            }
        }
    }
    
    // Функція оновлення списку ліній
    function updateLinesList() {
        const linesList = document.getElementById('linesList');
        linesList.innerHTML = '';
        
        figureLines.forEach(line => {
            const lineItem = document.createElement('button');
            lineItem.style.cssText = 'padding: 8px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; text-align: left; font-size: 12px;';
            lineItem.textContent = `${line.from}-${line.to}`;
            lineItem.onclick = () => editLine(line);
            linesList.appendChild(lineItem);
        });
    }
    
    // Функція редагування лінії
    function editLine(line) {
        // Відкриваємо модалку координат
        document.getElementById('coordModal').style.display = 'block';
        
        // Заповнюємо поле введення збереженим кодом
        document.getElementById('coordInput').value = line.code;
        
        // Зберігаємо ID лінії для редагування
        window.editingLineId = line.id;
        
        setTimeout(() => {
            document.getElementById('coordInput').focus();
        }, 100);
    }
    
    // Функція оновлення існуючої лінії
    function updateExistingLine(lineId, parsedData) {
        const lineIndex = figureLines.findIndex(l => l.id === lineId);
        if (lineIndex === -1) return;
        
        // Зберігаємо оновлені дані
        const oldLine = figureLines[lineIndex];
        figureLines[lineIndex].direction = parsedData.direction;
        figureLines[lineIndex].lineType = parsedData.lineType;
        figureLines[lineIndex].elements = parsedData.elements;
        figureLines[lineIndex].code = document.getElementById('coordInput').value;
        
        // Перемальовуємо всю фігуру з урахуванням змін
        redrawEntireFigure();
    }
    
    // Функція перемалювання всієї фігури
    function redrawEntireFigure() {
        const svg = document.getElementById('shapeCanvas');
        
        // Очищаємо весь SVG (крім viewBox)
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        
        // Скидаємо масив точок до початкової
        shapePoints = [{x: 400, y: 300, num: 1}];
        
        // Малюємо початкову точку
        const startCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        startCircle.setAttribute('cx', '400');
        startCircle.setAttribute('cy', '300');
        startCircle.setAttribute('r', '5');
        startCircle.setAttribute('fill', '#e53935');
        svg.appendChild(startCircle);
        
        const startText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        startText.setAttribute('x', '410');
        startText.setAttribute('y', '295');
        startText.setAttribute('font-size', '16');
        startText.setAttribute('fill', '#e53935');
        startText.setAttribute('font-weight', 'bold');
        startText.textContent = '1';
        svg.appendChild(startText);
        
        // Малюємо всі лінії послідовно
        let currentPointNum = 1;
        const scale = 50;
        
        figureLines.forEach((lineData, index) => {
            const lastPoint = shapePoints[shapePoints.length - 1];
            
            // Обчислення кінцевої точки
            let endX = lastPoint.x;
            let endY = lastPoint.y;
            let lineLength = 0;
            
            // Знаходимо загальну довжину лінії
            for (let i = lineData.elements.length - 1; i >= 0; i--) {
                if (lineData.elements[i].type === 'number') {
                    lineLength = lineData.elements[i].value;
                    break;
                }
            }
            
            const scaledLength = lineLength * scale;
            
            // Обчислюємо кінцеву точку в залежності від напрямку
            switch(lineData.direction) {
                case 'top':
                    endY = lastPoint.y - scaledLength;
                    break;
                case 'bottom':
                    endY = lastPoint.y + scaledLength;
                    break;
                case 'left':
                    endX = lastPoint.x - scaledLength;
                    break;
                case 'right':
                    endX = lastPoint.x + scaledLength;
                    break;
            }
            
            // Малюємо лінію
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', lastPoint.x);
            line.setAttribute('y1', lastPoint.y);
            line.setAttribute('x2', endX);
            line.setAttribute('y2', endY);
            line.setAttribute('stroke', '#2196F3');
            line.setAttribute('stroke-width', '2');
            line.setAttribute('id', `line-${lineData.id}`);
            svg.appendChild(line);
            
            // Малюємо елементи на лінії
            drawElementsOnLine(lineData, lastPoint.x, lastPoint.y, endX, endY, scale);
            
            // Додаємо нову точку
            currentPointNum++;
            const newPoint = { x: endX, y: endY, num: currentPointNum };
            shapePoints.push(newPoint);
            
            // Оновлюємо номери точок в даних лінії
            figureLines[index].from = lastPoint.num;
            figureLines[index].to = currentPointNum;
            
            // Малюємо нову точку
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', endX);
            circle.setAttribute('cy', endY);
            circle.setAttribute('r', '5');
            circle.setAttribute('fill', '#e53935');
            svg.appendChild(circle);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', endX + 10);
            text.setAttribute('y', endY - 5);
            text.setAttribute('font-size', '16');
            text.setAttribute('fill', '#e53935');
            text.setAttribute('font-weight', 'bold');
            text.textContent = currentPointNum;
            svg.appendChild(text);
        });
        
        // Оновлюємо pointCounter
        pointCounter = currentPointNum;
        
        // Оновлюємо список ліній
        updateLinesList();
    }
    
});