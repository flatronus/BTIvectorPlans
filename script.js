document.addEventListener('DOMContentLoaded', function() {
    // Визначення середовища (покращена логіка)
    const isWebCodeApp = navigator.userAgent.toLowerCase().includes('web code');
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isLocalFile = window.location.protocol === 'file:';
    
    window.isWebCodeApp = isWebCodeApp;
    window.isAndroid = isAndroid;

    // Змінна для розміщення розмірів (true = zzовні, false = всередині)
    let dimensionsOutside = false;
	
	// ДОДАНО: Змінна для номера приміщення
	let roomNumber = '';
	
	// Збереження стану поля номера приміщення
	let roomNumberInputValue = '';
	let roomNumberInputFocused = false;
	let roomNumberInputSelectionStart = 0;
	let roomNumberInputSelectionEnd = 0;
    
    // Структура для зберігання ліній фігури
    let figureLines = []; // Масив об'єктів {id, from, to, direction, lineType, elements, code}
    let lineIdCounter = 1;
    
    // ДОДАТИ ЦІ НОВІ ЗМІННІ:
    let pendingFreeLines = []; // Масив ліній з невідомим кутом, які очікують розрахунку
    let freeLineQuadrant = null; // Поточний квадрант для free лінії ('top-right', 'top-left', 'bottom-right', 'bottom-left')
    
    // Функція перемикання розміщення розмірів
    window.toggleDimensionSide = function() {
        dimensionsOutside = document.getElementById('dimensionSideCheckbox').checked;
        
        // Перемальовуємо фігуру з новим розміщенням розмірів
        if (figureLines.length > 0) {
            redrawEntireFigure();
        }
    };
    
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
	
	// Відновлюємо значення поля № приміщення при першому завантаженні
	setTimeout(() => {
		const input = document.getElementById('roomNumberInput');
		if (input) {
			input.value = roomNumber;
		}
	}, 100);

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
		
		// ДОДАТИ ЦЕ:
		const quickModal = document.getElementById('quickShapeModal');
		if (event.target === quickModal) {
			closeQuickShapeModal();
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
        
        // ЗАМИКАЮЧА ЛІНІЯ ЗАВЖДИ FREE!
        const direction = 'free';
        
        // Формуємо текст для поля вводу
        const coordText = `${direction}\nline\n${distanceInMeters}`;
        
        // Заповнюємо поле введення
        document.getElementById('coordInput').value = coordText;
        
        // Відкриваємо модалку координат
        document.getElementById('coordModal').style.display = 'block';
        
        // Позначаємо що це замикаюча лінія
        window.isClosingLine = true;
        
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
        document.getElementById('coordInput').value = '';
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
		
		// Якщо обрано free, зберігаємо квадрант для подальшого використання
		if (direction === 'free') {
			freeLineQuadrant = null;
		} else if (direction === 'up') {
			if (currentAngle === 'free' || document.getElementById('coordInput').value.includes('free')) {
				freeLineQuadrant = 'top';
			}
		} else if (direction === 'down') {
			if (currentAngle === 'free' || document.getElementById('coordInput').value.includes('free')) {
				freeLineQuadrant = 'bottom';
			}
		} else if (direction === 'left') {
			if (currentAngle === 'free' || document.getElementById('coordInput').value.includes('free')) {
				freeLineQuadrant = 'left';
			}
		} else if (direction === 'right') {
			if (currentAngle === 'free' || document.getElementById('coordInput').value.includes('free')) {
				freeLineQuadrant = 'right';
			}
		}
		
		// Вставка коду напрямку в поле вводу координат
		const coordInput = document.getElementById('coordInput');
		const code = directions[direction];
		
		// Зберігаємо позицію курсора
		const cursorPos = coordInput.selectionStart;
		const textBefore = coordInput.value.substring(0, cursorPos);
		const textAfter = coordInput.value.substring(cursorPos);
		
		// ВИПРАВЛЕНО: завжди додаємо код + новий рядок
		const newText = textBefore + (textBefore && !textBefore.endsWith('\n') ? '\n' : '') + code + '\n';
		coordInput.value = newText + textAfter;
		
		// Встановлюємо курсор в новий рядок після вставленого тексту
		const newCursorPos = newText.length;
		coordInput.setSelectionRange(newCursorPos, newCursorPos);
		
		// Повертаємо фокус на поле
		coordInput.focus();
		
		console.log('Встановлено код:', code, 'Квадрант:', freeLineQuadrant);
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
		
		// ВИПРАВЛЕНО: завжди додаємо код + новий рядок
		const newText = textBefore + (textBefore && !textBefore.endsWith('\n') ? '\n' : '') + code + '\n';
		coordInput.value = newText + textAfter;
		
		// Встановлюємо курсор в новий рядок після вставленого тексту
		const newCursorPos = newText.length;
		coordInput.setSelectionRange(newCursorPos, newCursorPos);
		
		// Повертаємо фокус на поле
		coordInput.focus();
		
		console.log('Встановлено код:', code);
	};

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
		
		// ВИПРАВЛЕНО: для мінуса та цифри - без нового рядка, для решти - з новим рядком
		let prefix = '';
		if (textBefore && !textBefore.endsWith('\n') && lastChar !== '-' && isNaN(lastChar)) {
			prefix = '\n';
		}
		
		// Додаємо код + новий рядок після нього
		const newText = textBefore + prefix + code + '\n';
		coordInput.value = newText + textAfter;
		
		// Встановлюємо курсор в новий рядок після вставленого тексту
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
		
		// ДОДАНО: Перевірка квадранту для free
		let quadrant = null;
		let startIndex = 1;
		
		if (direction === 'free') {
			// Другий рядок може бути квадрантом (top, bottom, left, right)
			if (lines.length > 1 && ['top', 'bottom', 'left', 'right'].includes(lines[1].toLowerCase())) {
				quadrant = lines[1].toLowerCase();
				startIndex = 2;
			} else if (freeLineQuadrant) {
				// Використовуємо збережений квадрант
				quadrant = freeLineQuadrant;
			}
		}
		
		// Тип лінії (line, curve)
		if (lines.length < startIndex + 1) {
			alert('Введіть тип лінії');
			return null;
		}
		
		const lineType = lines[startIndex].toLowerCase();
		if (!['line', 'curve'].includes(lineType)) {
			alert('Невірний тип лінії. Використовуйте: line, curve');
			return null;
		}
		
		// Решта рядків - числа та коди елементів
		const elements = [];
		for (let i = startIndex + 1; i < lines.length; i++) {
			const value = lines[i];
			
			// ВИПРАВЛЕННЯ: Перевірка чи це число з підтримкою коми як десяткового роздільника
			const numValue = parseFloat(value.replace(',', '.'));
			if (!isNaN(numValue)) {
				elements.push({ type: 'number', value: numValue });
			} else {
				// Це код елемента
				elements.push({ type: 'element', value: value });
			}
		}
		
		return { direction, lineType, elements, quadrant };
	}
    
    // Функція малювання лінії на полотні
	function drawLineOnCanvas(parsedData) {
		const svg = document.getElementById('shapeCanvas');
		const lastPoint = shapePoints[shapePoints.length - 1];
		
		// Перевіряємо чи це замикаюча лінія
		const isClosing = window.isClosingLine || false;
		
		// ПЕРЕВІРКА FREE ЛІНІЇ (ПЕРЕВІРЯЄМО СПОЧАТКУ!)
		if (parsedData.direction === 'free') {
			// Знаходимо довжину лінії
			const lineLength = parsedData.elements.find(el => el.type === 'number')?.value || 0;
			
			if (!isClosing) {
				// Звичайна free лінія - зберігаємо як pending
				const lineData = {
					id: lineIdCounter,
					from: lastPoint.num,
					to: null,
					direction: parsedData.direction,
					lineType: parsedData.lineType,
					elements: parsedData.elements,
					code: document.getElementById('coordInput').value,
					length: lineLength,
					isClosing: false,
					isPending: true,
					quadrant: parsedData.quadrant,
					dimensionVisible: true,
					dimensionRotated: false
				};
				
				pendingFreeLines.push(lineData);
				figureLines.push(lineData);
				lineIdCounter++;
				
				// Додаємо тимчасову точку
				pointCounter++;
				const tempPoint = { x: lastPoint.x, y: lastPoint.y, num: pointCounter, isTemp: true };
				shapePoints.push(tempPoint);
				
				updateLinesList();
				alert('Лінія з невідомим кутом збережена. Додайте замикаючу лінію для розрахунку фігури.');
				
				return;
			}
			
			// ЗАМИКАЮЧА FREE ЛІНІЯ
			if (pendingFreeLines.length === 0) {
				// ПРЯМОКУТНИК/БАГАТОКУТНИК: немає pending ліній - просто малюємо звичайну замикаючу
				// НЕ зберігаємо як pending, а малюємо відразу
				window.isClosingLine = false;
				
				// Перенаправляємо на обробку звичайної замикаючої лінії
				// Змінюємо direction на щось конкретне (буде ігноруватися, бо isClosing=true)
				parsedData.direction = 'direct-closing';
				// Продовжуємо виконання далі (не робимо return)
			} else {
				// ТРИКУТНИК: є pending лінії - зберігаємо і розраховуємо
				const lineData = {
					id: lineIdCounter,
					from: lastPoint.num,
					to: 1,
					direction: parsedData.direction,
					lineType: parsedData.lineType,
					elements: parsedData.elements,
					code: document.getElementById('coordInput').value,
					length: lineLength,
					isClosing: true,
					isPending: true,
					quadrant: parsedData.quadrant,
					dimensionVisible: true,
					dimensionRotated: false
				};
				
				pendingFreeLines.push(lineData);
				figureLines.push(lineData);
				lineIdCounter++;
				
				window.isClosingLine = false;
				calculateFreeAngleFigure();
				
				return;
			}
		}
		
		// ОБРОБКА ЗВИЧАЙНИХ ЛІНІЙ (НЕ FREE)
		let endX, endY;
		let lineLength = 0;
		
		if (isClosing) {
			// Замикаюча НЕ-free лінія
			endX = shapePoints[0].x;
			endY = shapePoints[0].y;
			
			// Знаходимо довжину з введених даних
			for (let i = parsedData.elements.length - 1; i >= 0; i--) {
				if (parsedData.elements[i].type === 'number') {
					lineLength = parseFloat(parsedData.elements[i].value); // ВИПРАВЛЕННЯ: parseFloat
					break;
				}
			}
		} else {
			// Звичайна НЕ-free лінія
			endX = lastPoint.x;
			endY = lastPoint.y;

			// Знаходимо загальну довжину лінії
			for (let i = parsedData.elements.length - 1; i >= 0; i--) {
				if (parsedData.elements[i].type === 'number') {
					lineLength = parseFloat(parsedData.elements[i].value); // ВИПРАВЛЕННЯ: parseFloat
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
		
		// Малюємо розмір лінії
		drawLineDimension(lastPoint.x, lastPoint.y, endX, endY, lineLength, null);
		
		// Малюємо елементи на лінії
		const scale = 50;
		drawElementsOnLine(parsedData, lastPoint.x, lastPoint.y, endX, endY, scale);
		
		// Для замикаючої лінії не створюємо нову точку
		let targetPointNum;
		if (isClosing) {
			targetPointNum = 1;
			window.isClosingLine = false;
			calculateAndDisplayArea();
		} else {
			pointCounter++;
			const newPoint = { x: endX, y: endY, num: pointCounter };
			shapePoints.push(newPoint);
			targetPointNum = pointCounter;
			
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
		}
		
		// Зберігаємо лінію в масив
		const lineData = {
			id: lineIdCounter,
			from: lastPoint.num,
			to: targetPointNum,
			direction: parsedData.direction,
			lineType: parsedData.lineType,
			elements: parsedData.elements,
			code: document.getElementById('coordInput').value,
			length: parseFloat(lineLength), // ВИПРАВЛЕННЯ: parseFloat
			isClosing: isClosing,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		};
		figureLines.push(lineData);
		
		updateLinesList();
		lineIdCounter++;
		
		// ДОДАНО: Автоматичне масштабування після додавання лінії
		autoScaleAndCenterFigure();
	}
    
    // Функція обчислення та відображення площі
    function calculateAndDisplayArea() {
        if (shapePoints.length < 3) return;
        
        // Обчислення площі за формулою Гаусса (Shoelace formula)
        let area = 0;
        for (let i = 0; i < shapePoints.length; i++) {
            const j = (i + 1) % shapePoints.length;
            area += shapePoints[i].x * shapePoints[j].y;
            area -= shapePoints[j].x * shapePoints[i].y;
        }
        area = Math.abs(area) / 2;
        
        // Конвертуємо з пікселів² в метри² (масштаб: 1 метр = 50 пікселів)
        const scale = 50;
        const areaInMeters = area / (scale * scale);
        
        // Форматуємо до 1 знака після коми
        const formattedArea = areaInMeters.toFixed(1);
        
        // Зберігаємо площу
        window.calculatedArea = formattedArea;
        
        // Оновлюємо список ліній з площею
        updateLinesList();
    }
    
    function drawLineDimension(x1, y1, x2, y2, lengthInMeters, lineData) {
		// Якщо розміри приховані для цієї лінії, не малюємо їх
		if (lineData && lineData.dimensionVisible === false) return;
		
		const svg = document.getElementById('shapeCanvas');
		
		// Обчислюємо центр лінії
		const centerX = (x1 + x2) / 2;
		const centerY = (y1 + y2) / 2;
		
		// Обчислюємо вектор напрямку лінії
		const dx = x2 - x1;
		const dy = y2 - y1;
		const length = Math.sqrt(dx * dx + dy * dy);
		
		if (length === 0) return;
		
		// Одиничний вектор вздовж лінії
		const ux = dx / length;
		const uy = dy / length;
		
		// Перпендикулярний вектор
		const px = uy;
		const py = -ux;
		
		// Відстань тексту від лінії (фіксована відстань 15 пікселів)
		const offset = 15;
		
		// Визначаємо напрямок зміщення в залежності від налаштування
		const direction = dimensionsOutside ? 1 : -1;
		
		// Позиція тексту (завжди на однаковій відстані від лінії)
		const textX = centerX + px * offset * direction;
		const textY = centerY + py * offset * direction;
		
		// Обчислюємо кут повороту тексту (щоб був вздовж лінії)
		let angle = Math.atan2(dy, dx) * 180 / Math.PI;
		
		// Нормалізуємо кут щоб текст не був догори ногами
		if (angle > 90) angle -= 180;
		if (angle < -90) angle += 180;
		
		// Додаємо розворот на 180° якщо активовано для цієї лінії
		if (lineData && lineData.dimensionRotated === true) {
			angle += 180;
		}
		
		// ВИПРАВЛЕННЯ: Переконуємося що lengthInMeters - це число
		const numericLength = typeof lengthInMeters === 'number' ? lengthInMeters : parseFloat(lengthInMeters);
		
		// Форматуємо довжину: завжди 2 знаки після коми
		let formattedLength;
		const rounded = Math.round(numericLength * 100) / 100; // Округлюємо до 2 знаків
		formattedLength = rounded.toFixed(2);
		
		// Створюємо текст розміру
		const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
		text.setAttribute('x', textX);
		text.setAttribute('y', textY);
		text.setAttribute('font-size', '12');
		text.setAttribute('fill', 'black');
		text.setAttribute('font-weight', 'bold');
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('dominant-baseline', 'middle');
		text.setAttribute('transform', `rotate(${angle}, ${textX}, ${textY})`);
		text.textContent = formattedLength;
		svg.appendChild(text);
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
    
    // Функція оновлення списку ліній (ЄДИНА ВЕРСІЯ!)
	function updateLinesList() {
		const linesList = document.getElementById('linesList');
		linesList.innerHTML = '';
		
		// Чекбокс для розміщення розмірів
		const dimensionCheckbox = document.createElement('div');
		dimensionCheckbox.style.cssText = 'margin-bottom: 15px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';
		
		const dimLabel = document.createElement('label');
		dimLabel.style.cssText = 'display: flex; align-items: center; cursor: pointer; font-size: 12px;';
		
		const dimInput = document.createElement('input');
		dimInput.type = 'checkbox';
		dimInput.id = 'dimensionSideCheckbox';
		dimInput.checked = dimensionsOutside;
		dimInput.style.cssText = 'margin-right: 8px; width: 16px; height: 16px; cursor: pointer;';
		dimInput.onchange = toggleDimensionSide;
		
		const dimSpan = document.createElement('span');
		dimSpan.textContent = 'Розміри ззовні';
		
		dimLabel.appendChild(dimInput);
		dimLabel.appendChild(dimSpan);
		dimensionCheckbox.appendChild(dimLabel);
		linesList.appendChild(dimensionCheckbox);
		
		// === ЗБЕРІГАЄМО СТАН ПОЛЯ ПЕРЕД ВИДАЛЕННЯМ ===
		const existingRoomInput = document.getElementById('roomNumberInput');
		if (existingRoomInput) {
			roomNumberInputValue = existingRoomInput.value;
			roomNumberInputFocused = document.activeElement === existingRoomInput;
			roomNumberInputSelectionStart = existingRoomInput.selectionStart;
			roomNumberInputSelectionEnd = existingRoomInput.selectionEnd;
		}

		// Поле для номера приміщення
		const roomNumberDiv = document.createElement('div');
		roomNumberDiv.style.cssText = 'margin-bottom: 15px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';

		const roomLabel = document.createElement('label');
		roomLabel.style.cssText = 'display: block; font-size: 12px; font-weight: bold; margin-bottom: 5px;';
		roomLabel.textContent = '№ приміщення:';
		roomNumberDiv.appendChild(roomLabel);

		const roomInput = document.createElement('input');
		roomInput.type = 'text';
		roomInput.id = 'roomNumberInput';
		roomInput.placeholder = '1-1';
		roomInput.style.cssText = 'width: 100%; padding: 4px; font-size: 12px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;';
		roomInput.value = roomNumberInputValue;

		// КРИТИЧНО: onchange, а НЕ oninput!
		roomInput.onchange = function() {
			roomNumber = this.value.trim();
			redrawEntireFigure();
		};

		roomNumberDiv.appendChild(roomInput);

		const roomHint = document.createElement('div');
		roomHint.style.cssText = 'font-size: 10px; color: #666; margin-top: 3px;';
		roomHint.textContent = 'Формат: 1-1';
		roomNumberDiv.appendChild(roomHint);

		linesList.appendChild(roomNumberDiv);

		// === ВІДНОВЛЮЄМО ФОКУС ТА КУРСОР ===
		setTimeout(() => {
			const input = document.getElementById('roomNumberInput');
			if (roomNumberInputFocused && input) {
				input.focus();
				try {
					input.setSelectionRange(roomNumberInputSelectionStart, roomNumberInputSelectionEnd);
				} catch (e) {
					input.setSelectionRange(input.value.length, input.value.length);
				}
			}
		}, 0);
		
		// Якщо є обчислена площа, показуємо її
		if (window.calculatedArea) {
			const areaDisplay = document.createElement('div');
			areaDisplay.style.cssText = 'padding: 8px; background: #e8f5e9; border: 1px solid #4CAF50; border-radius: 4px; margin-bottom: 10px; font-weight: bold; font-size: 12px; text-align: center;';
			areaDisplay.textContent = 'S = ' + window.calculatedArea + ' м²';
			linesList.appendChild(areaDisplay);
			
			const areaInputContainer = document.createElement('div');
			areaInputContainer.style.cssText = 'padding: 8px; background: #fff3e0; border: 1px solid #FF9800; border-radius: 4px; margin-bottom: 10px;';
			
			const areaLabel = document.createElement('div');
			areaLabel.style.cssText = 'font-weight: bold; font-size: 10px; margin-bottom: 5px; text-align: center;';
			areaLabel.textContent = "S' (редагована):";
			areaInputContainer.appendChild(areaLabel);
			
			const areaInput = document.createElement('input');
			areaInput.type = 'number';
			areaInput.inputMode = 'decimal';
			areaInput.step = '0.1';
			areaInput.value = window.customArea || window.calculatedArea;
			areaInput.style.cssText = 'width: 100%; padding: 4px; font-size: 12px; text-align: center; border: 1px solid #ddd; border-radius: 4px;';
			areaInput.onchange = function() {
				window.customArea = parseFloat(this.value).toFixed(1);
			};
			areaInputContainer.appendChild(areaInput);
			
			linesList.appendChild(areaInputContainer);
		}
		
		// Список ліній
		figureLines.forEach(line => {
			const lineContainer = document.createElement('div');
			const bgColor = line.isPending ? '#fff3e0' : '#f0f0f0';
			lineContainer.style.cssText = 'padding: 6px 8px; background: ' + bgColor + '; border: 1px solid #ddd; border-radius: 4px; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;';

			const lineButton = document.createElement('button');
			lineButton.style.cssText = 'flex: 1; padding: 4px; background: transparent; border: none; cursor: pointer; text-align: left; font-size: 12px; font-weight: bold;';
			const pendingMark = line.isPending ? ' (очікування)' : '';
			lineButton.textContent = line.from + '-' + (line.to || '?') + pendingMark;
			lineButton.onclick = () => editLine(line);
			lineContainer.appendChild(lineButton);

			const visibilityCheckbox = document.createElement('input');
			visibilityCheckbox.type = 'checkbox';
			visibilityCheckbox.checked = line.dimensionVisible !== false;
			visibilityCheckbox.title = 'Показати розмір';
			visibilityCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
			visibilityCheckbox.onchange = function(e) {
				e.stopPropagation();
				line.dimensionVisible = this.checked;
				redrawEntireFigure();
			};
			lineContainer.appendChild(visibilityCheckbox);

			const rotateCheckbox = document.createElement('input');
			rotateCheckbox.type = 'checkbox';
			rotateCheckbox.checked = line.dimensionRotated === true;
			rotateCheckbox.title = 'Розвернути на 180°';
			rotateCheckbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
			rotateCheckbox.onchange = function(e) {
				e.stopPropagation();
				line.dimensionRotated = this.checked;
				redrawEntireFigure();
			};
			lineContainer.appendChild(rotateCheckbox);

			linesList.appendChild(lineContainer);
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
        
        if (lineIndex === -1) {
            alert('ПОМИЛКА: Лінію не знайдено!');
            return;
        }
        
        // Знаходимо нову довжину лінії (останнє число в elements)
        let newLength = 0;
        for (let i = parsedData.elements.length - 1; i >= 0; i--) {
            if (parsedData.elements[i].type === 'number') {
                newLength = parsedData.elements[i].value;
                break;
            }
        }
        
        // Зберігаємо оновлені дані
        figureLines[lineIndex].direction = parsedData.direction;
        figureLines[lineIndex].lineType = parsedData.lineType;
        figureLines[lineIndex].elements = parsedData.elements;
        figureLines[lineIndex].code = document.getElementById('coordInput').value;
        figureLines[lineIndex].length = newLength;
        
        // Якщо змінена НЕ остання лінія перед замикаючою, потрібно перерахувати замикаючу
        const closingLineIndex = figureLines.findIndex(l => l.isClosing);
        if (closingLineIndex !== -1 && lineIndex < closingLineIndex) {
            recalculateClosingLine();
        }
        
        // Перемальовуємо всю фігуру з урахуванням змін
        redrawEntireFigure();
    }
    
    // Функція перерахунку замикаючої лінії
    function recalculateClosingLine() {
        const closingLineIndex = figureLines.findIndex(l => l.isClosing);
        if (closingLineIndex === -1) return;
        
        // Тимчасово видаляємо замикаючу лінію
        const closingLine = figureLines[closingLineIndex];
        figureLines.splice(closingLineIndex, 1);
        
        // Перемальовуємо фігуру без замикаючої
        const svg = document.getElementById('shapeCanvas');
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        
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
        
        let currentPointNum = 1;
        const scale = 50;
        
        // Малюємо всі лінії крім замикаючої
        figureLines.forEach((lineData) => {
            const lastPoint = shapePoints[shapePoints.length - 1];
            let endX = lastPoint.x;
            let endY = lastPoint.y;
            
            const scaledLength = lineData.length * scale;
            
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
            
            currentPointNum++;
            const newPoint = { x: endX, y: endY, num: currentPointNum };
            shapePoints.push(newPoint);
        });
        
        // Тепер обчислюємо нову довжину замикаючої лінії
        const lastPoint = shapePoints[shapePoints.length - 1];
        const firstPoint = shapePoints[0];
        
        const dx = firstPoint.x - lastPoint.x;
        const dy = firstPoint.y - lastPoint.y;
        const distanceInPixels = Math.sqrt(dx * dx + dy * dy);
        const newClosingLength = (distanceInPixels / scale).toFixed(2);
        
        console.log('Нова довжина замикаючої лінії:', newClosingLength);
        
        // Оновлюємо дані замикаючої лінії
        closingLine.length = parseFloat(newClosingLength);
        
        // Оновлюємо елементи (останнє число)
        for (let i = closingLine.elements.length - 1; i >= 0; i--) {
            if (closingLine.elements[i].type === 'number') {
                closingLine.elements[i].value = parseFloat(newClosingLength);
                break;
            }
        }
        
        // Оновлюємо код
        const codeLines = closingLine.code.split('\n');
        for (let i = codeLines.length - 1; i >= 0; i--) {
            if (!isNaN(parseFloat(codeLines[i]))) {
                codeLines[i] = newClosingLength;
                break;
            }
        }
        closingLine.code = codeLines.join('\n');
        
        // Повертаємо замикаючу лінію назад
        figureLines.push(closingLine);
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
		
		// ДОДАНО: Зберігаємо обчислені координати для free ліній
		const calculatedPoints = {};
		
		figureLines.forEach((lineData, index) => {
			const lastPoint = shapePoints[shapePoints.length - 1];
			
			// Обчислення кінцевої точки
			let endX, endY;
			
			// ВИПРАВЛЕННЯ: для замикаючої лінії завжди використовуємо першу точку
			if (lineData.isClosing) {
				endX = shapePoints[0].x;
				endY = shapePoints[0].y;
			} else if (lineData.direction === 'free') {
				// ДОДАНО: Обробка free лінії
				// Якщо лінія ще pending (не розрахована), пропускаємо малювання
				if (lineData.isPending) {
					// Додаємо тимчасову точку
					currentPointNum++;
					const tempPoint = { x: lastPoint.x, y: lastPoint.y, num: currentPointNum, isTemp: true };
					shapePoints.push(tempPoint);
					
					// Оновлюємо номери
					figureLines[index].from = lastPoint.num;
					figureLines[index].to = currentPointNum;
					
					return; // Пропускаємо малювання
				}
				
				// ДОДАНО: Якщо free лінія вже розрахована (isPending: false),
				// беремо координати з calculatedPoints або обчислюємо
				if (calculatedPoints[lineData.id]) {
					endX = calculatedPoints[lineData.id].x;
					endY = calculatedPoints[lineData.id].y;
				} else {
					// Це означає що координати вже були обчислені в calculateFreeAngleFigure
					// Потрібно знайти наступну точку з shapePoints (після перерахунку)
					// Але оскільки ми перемальовуємо з нуля, потрібно відновити розрахунок
					
					// Знаходимо наступну не-pending лінію або замикаючу
					let nextNonPendingIndex = -1;
					for (let i = index + 1; i < figureLines.length; i++) {
						if (!figureLines[i].isPending || figureLines[i].isClosing) {
							nextNonPendingIndex = i;
							break;
						}
					}
					
					if (nextNonPendingIndex !== -1 && figureLines[nextNonPendingIndex].isClosing) {
						// Використовуємо теорему косинусів для відновлення позиції
						const pendingLength = lineData.length * scale;
						const closingLength = figureLines[nextNonPendingIndex].length * scale;
						
						const firstPoint = shapePoints[0];
						const dx = lastPoint.x - firstPoint.x;
						const dy = lastPoint.y - firstPoint.y;
						const thirdSide = Math.sqrt(dx * dx + dy * dy);
						
						const a = pendingLength;
						const b = thirdSide;
						const c = closingLength;
						
						const cosAngle = (a * a + b * b - c * c) / (2 * a * b);
						const angle = Math.acos(cosAngle);
						
						let baseAngle = Math.atan2(firstPoint.y - lastPoint.y, firstPoint.x - lastPoint.x);
						
						let finalAngle;
						switch(lineData.quadrant) {
							case 'top':
								finalAngle = baseAngle + angle;
								break;
							case 'bottom':
								finalAngle = baseAngle - angle;
								break;
							case 'left':
								finalAngle = baseAngle + angle;
								break;
							case 'right':
								finalAngle = baseAngle - angle;
								break;
							default:
								finalAngle = baseAngle + angle;
						}
						
						endX = lastPoint.x + Math.cos(finalAngle) * pendingLength;
						endY = lastPoint.y + Math.sin(finalAngle) * pendingLength;
						
						// Зберігаємо для наступних викликів
						calculatedPoints[lineData.id] = { x: endX, y: endY };
					} else {
						// Помилка: не можемо відновити координати
						console.error('Cannot restore free line coordinates');
						return;
					}
				}
			} else {
				// Для звичайної лінії обчислюємо відносно попередньої точки
				endX = lastPoint.x;
				endY = lastPoint.y;
				
				const lineLength = lineData.length;
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
			
			// Малюємо розмір лінії з налаштуваннями конкретної лінії
			drawLineDimension(lastPoint.x, lastPoint.y, endX, endY, lineData.length, lineData);
			
			// Малюємо елементи на лінії
			drawElementsOnLine(lineData, lastPoint.x, lastPoint.y, endX, endY, scale);
			
			// ВИПРАВЛЕННЯ: для замикаючої лінії НЕ створюємо нову точку
			if (!lineData.isClosing) {
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
			} else {
				// Для замикаючої лінії просто оновлюємо номери
				figureLines[index].from = lastPoint.num;
				figureLines[index].to = 1; // Завжди повертаємось до точки 1
			}
		});
		
		// Оновлюємо pointCounter
		pointCounter = currentPointNum;
		
		// Перераховуємо площу після перемалювання
		if (figureLines.some(line => line.isClosing)) {
			calculateAndDisplayArea();
		}
		
		// Оновлюємо список ліній (ОДИН РАЗ!)
		updateLinesList();

		// ДОДАНО: Автоматичне масштабування та центрування
		autoScaleAndCenterFigure();
		
		// ДОДАНО: Відображення номера приміщення
		drawRoomNumber();
	}
    
    // Функція розрахунку фігури з невідомими кутами
	function calculateFreeAngleFigure() {
		if (pendingFreeLines.length === 0) {
			alert('Немає ліній з невідомим кутом для розрахунку');
			return;
		}
		
		const scale = 50;
		
		// Знаходимо замикаючу лінію серед pending
		const closingLineData = pendingFreeLines.find(line => line.isClosing);
		if (!closingLineData) {
			alert('Помилка: не знайдено замикаючу лінію');
			return;
		}
		
		// Знаходимо довжину замикаючої лінії
		let closingLength = 0;
		for (let i = closingLineData.elements.length - 1; i >= 0; i--) {
			if (closingLineData.elements[i].type === 'number') {
				closingLength = closingLineData.elements[i].value;
				break;
			}
		}
		
		// Беремо останню завершену точку (перед pending лініями)
		let currentPoint = null;
		for (let i = shapePoints.length - 1; i >= 0; i--) {
			if (!shapePoints[i].isTemp) {
				currentPoint = shapePoints[i];
				break;
			}
		}
		
		if (!currentPoint) {
			alert('Помилка: не знайдено початкову точку');
			return;
		}
		
		// Для простого трикутника: одна pending лінія
		if (pendingFreeLines.length === 1) {
			const pendingLine = pendingFreeLines[0];
			const pendingLength = pendingLine.length * scale;
			const closingLengthPx = closingLength * scale;
			
			// Знаходимо третю сторону (від початку до поточної точки)
			const firstPoint = shapePoints[0];
			const dx = currentPoint.x - firstPoint.x;
			const dy = currentPoint.y - firstPoint.y;
			const thirdSide = Math.sqrt(dx * dx + dy * dy);
			
			// Розраховуємо кут за теоремою косинусів
			// c² = a² + b² - 2ab·cos(C)
			// cos(C) = (a² + b² - c²) / (2ab)
			
			const a = pendingLength;
			const b = thirdSide;
			const c = closingLengthPx;
			
			const cosAngle = (a * a + b * b - c * c) / (2 * a * b);
			const angle = Math.acos(cosAngle);
			
			// Визначаємо напрямок на основі квадранту
			let baseAngle = Math.atan2(firstPoint.y - currentPoint.y, firstPoint.x - currentPoint.x);
			
			let finalAngle;
			switch(pendingLine.quadrant) {
				case 'top':
					finalAngle = baseAngle + angle;
					break;
				case 'bottom':
					finalAngle = baseAngle - angle;
					break;
				case 'left':
					finalAngle = baseAngle + angle;
					break;
				case 'right':
					finalAngle = baseAngle - angle;
					break;
				default:
					// Автоматичне визначення за квадрантом
					finalAngle = baseAngle + angle;
			}
			
			// Обчислюємо кінцеву точку pending лінії
			const endX = currentPoint.x + Math.cos(finalAngle) * pendingLength;
			const endY = currentPoint.y + Math.sin(finalAngle) * pendingLength;
			
			// Оновлюємо точку
			const tempPointIndex = shapePoints.findIndex(p => p.isTemp);
			if (tempPointIndex !== -1) {
				shapePoints[tempPointIndex].x = endX;
				shapePoints[tempPointIndex].y = endY;
				shapePoints[tempPointIndex].isTemp = false;
			}
			
			// Оновлюємо pending лінію
			pendingLine.isPending = false;
			pendingLine.to = shapePoints[tempPointIndex].num;
			
			// Очищаємо pending
			pendingFreeLines = [];
			
			// Додаємо замикаючу лінію
			const lineData = {
				id: lineIdCounter++,
				from: shapePoints[tempPointIndex].num,
				to: 1,
				direction: closingLineData.direction,
				lineType: closingLineData.lineType,
				elements: closingLineData.elements,
				code: document.getElementById('coordInput').value,
				length: closingLength,
				isClosing: true,
				isPending: false,
				dimensionVisible: true,
				dimensionRotated: false
			};
			figureLines.push(lineData);
			
			window.isClosingLine = false;
			
			// Перемальовуємо всю фігуру
			redrawEntireFigure();
			
			alert('Фігуру розраховано успішно!');
			
		} else if (pendingFreeLines.length === 2) {
			// Трикутник: одна звичайна free лінія + одна замикаюча free лінія
			const regularFreeLine = pendingFreeLines.find(line => !line.isClosing);
			const closingFreeLine = pendingFreeLines.find(line => line.isClosing);
			
			if (!regularFreeLine || !closingFreeLine) {
				alert('Помилка: не знайдено потрібні лінії');
				return;
			}
			
			const pendingLength = regularFreeLine.length * scale;
			const closingLengthPx = closingFreeLine.length * scale;
			
			// Знаходимо третю сторону (від початку до поточної точки)
			const firstPoint = shapePoints[0];
			const dx = currentPoint.x - firstPoint.x;
			const dy = currentPoint.y - firstPoint.y;
			const thirdSide = Math.sqrt(dx * dx + dy * dy);
			
			// Розраховуємо кут за теоремою косинусів
			const a = pendingLength;
			const b = thirdSide;
			const c = closingLengthPx;
			
			const cosAngle = (a * a + b * b - c * c) / (2 * a * b);
			const angle = Math.acos(cosAngle);
			
			// Визначаємо напрямок на основі квадранту
			let baseAngle = Math.atan2(firstPoint.y - currentPoint.y, firstPoint.x - currentPoint.x);
			
			let finalAngle;
			switch(regularFreeLine.quadrant) {
				case 'top':
					finalAngle = baseAngle + angle;
					break;
				case 'bottom':
					finalAngle = baseAngle - angle;
					break;
				case 'left':
					finalAngle = baseAngle + angle;
					break;
				case 'right':
					finalAngle = baseAngle - angle;
					break;
				default:
					finalAngle = baseAngle + angle;
			}
			
			// Обчислюємо кінцеву точку звичайної free лінії
			const endX = currentPoint.x + Math.cos(finalAngle) * pendingLength;
			const endY = currentPoint.y + Math.sin(finalAngle) * pendingLength;
			
			// Оновлюємо тимчасову точку
			const tempPointIndex = shapePoints.findIndex(p => p.isTemp);
			if (tempPointIndex !== -1) {
				shapePoints[tempPointIndex].x = endX;
				shapePoints[tempPointIndex].y = endY;
				shapePoints[tempPointIndex].isTemp = false;
			}
			
			// Оновлюємо обидві pending лінії
			regularFreeLine.isPending = false;
			regularFreeLine.to = shapePoints[tempPointIndex].num;
			
			closingFreeLine.isPending = false;
			closingFreeLine.from = shapePoints[tempPointIndex].num;
			closingFreeLine.to = 1;
			
			// Очищаємо pending
			pendingFreeLines = [];
			
			window.isClosingLine = false;
			
			// Перемальовуємо всю фігуру
			redrawEntireFigure();
			
			alert('Трикутник розраховано успішно!');
			
			// ДОДАНО: Автоматичне масштабування після розрахунку
			autoScaleAndCenterFigure();
			
		} else {
			alert('Розрахунок для більше ніж двох free ліній поки не підтримується');
		}
	}
	
	// Функція автоматичного масштабування та центрування фігури
	function autoScaleAndCenterFigure() {
		if (shapePoints.length < 2) return;
		
		const svg = document.getElementById('shapeCanvas');
		
		// Знаходимо межі фігури (bounding box)
		let minX = Infinity, minY = Infinity;
		let maxX = -Infinity, maxY = -Infinity;
		
		shapePoints.forEach(point => {
			if (point.x < minX) minX = point.x;
			if (point.y < minY) minY = point.y;
			if (point.x > maxX) maxX = point.x;
			if (point.y > maxY) maxY = point.y;
		});
		
		// Розміри фігури
		const figureWidth = maxX - minX;
		const figureHeight = maxY - minY;
		
		// Додаємо відступи (20% від розміру фігури, мінімум 50 пікселів)
		const paddingX = Math.max(figureWidth * 0.2, 50);
		const paddingY = Math.max(figureHeight * 0.2, 50);
		
		// Нові межі viewBox з відступами
		const viewBoxX = minX - paddingX;
		const viewBoxY = minY - paddingY;
		const viewBoxWidth = figureWidth + paddingX * 2;
		const viewBoxHeight = figureHeight + paddingY * 2;
		
		// Встановлюємо новий viewBox
		svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
		
		console.log('Auto-scaled viewBox:', {
			x: viewBoxX,
			y: viewBoxY,
			width: viewBoxWidth,
			height: viewBoxHeight
		});
	}
	
	// Функція відображення номера приміщення в центрі фігури
	function drawRoomNumber() {
		if (!roomNumber || shapePoints.length < 3) return;
		
		const svg = document.getElementById('shapeCanvas');
		
		// Обчислюємо центр фігури (центроїд полігона)
		let centerX = 0, centerY = 0;
		let validPoints = shapePoints.filter(p => !p.isTemp);
		
		validPoints.forEach(point => {
			centerX += point.x;
			centerY += point.y;
		});
		centerX /= validPoints.length;
		centerY /= validPoints.length;
		
		// Розділяємо номер на частини (формат: 1-1)
		const parts = roomNumber.split('-');
		
		if (parts.length >= 2 && parts[0] && parts[1]) {
			// Створюємо один текстовий елемент з tspan для кольорів
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('id', 'room-number');
			text.setAttribute('x', centerX);
			text.setAttribute('y', centerY);
			text.setAttribute('font-size', '12');
			text.setAttribute('font-weight', 'bold');
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('dominant-baseline', 'middle');
			
			// Перша частина (червона)
			const tspan1 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
			tspan1.setAttribute('fill', '#e53935');
			tspan1.textContent = parts[0];
			text.appendChild(tspan1);
			
			// Дефіс (чорний)
			const tspan2 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
			tspan2.setAttribute('fill', 'black');
			tspan2.textContent = '-';
			text.appendChild(tspan2);
			
			// Друга частина (чорна)
			const tspan3 = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
			tspan3.setAttribute('fill', 'black');
			tspan3.textContent = parts[1];
			text.appendChild(tspan3);
			
			svg.appendChild(text);
		} else {
			// Якщо формат інший, просто показуємо як є (чорним)
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('id', 'room-number');
			text.setAttribute('x', centerX);
			text.setAttribute('y', centerY);
			text.setAttribute('font-size', '12');
			text.setAttribute('font-weight', 'bold');
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('dominant-baseline', 'middle');
			text.setAttribute('fill', 'black');
			text.textContent = roomNumber;
			svg.appendChild(text);
		}
	}
	
	// Функція відкриття модалки швидкого створення
	window.openQuickShapeModal = function() {
		document.getElementById('quickShapeModal').style.display = 'block';
		
		// Слухач зміни типу фігури для оновлення підказки
		document.querySelectorAll('input[name="shapeType"]').forEach(radio => {
			radio.addEventListener('change', function() {
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
		
		// Фокус на поле вводу
		setTimeout(() => {
			document.getElementById('quickDimensionsInput').focus();
		}, 100);
	};

	// Функція закриття модалки швидкого створення
	window.closeQuickShapeModal = function() {
		document.getElementById('quickShapeModal').style.display = 'none';
		document.getElementById('quickDimensionsInput').value = '';
	};

	// Функція створення фігури швидким методом
	window.createQuickShape = function() {
		const shapeType = document.querySelector('input[name="shapeType"]:checked').value;
		const dimensionsInput = document.getElementById('quickDimensionsInput').value.trim();
		
		if (!dimensionsInput) {
			alert('Введіть розміри фігури');
			return;
		}
		
		// ВИПРАВЛЕННЯ: Парсимо розміри як числа з плаваючою точкою
		const dimensions = dimensionsInput
			.split(/\s+/)
			.map(d => {
				const num = parseFloat(d.replace(',', '.')); // Підтримка коми як десяткового роздільника
				return isNaN(num) ? null : num;
			})
			.filter(d => d !== null);
		
		if (shapeType === 'rectangle') {
			if (dimensions.length < 2) {
				alert('Для прямокутника потрібно 2 розміри: ширина та висота');
				return;
			}
			console.log('Створюємо прямокутник з розмірами:', dimensions[0], dimensions[1]);
			createRectangle(dimensions[0], dimensions[1]);
		} else if (shapeType === 'triangle') {
			if (dimensions.length < 3) {
				alert('Для трикутника потрібно 3 розміри: довжини всіх трьох сторін');
				return;
			}
			console.log('Створюємо трикутник з розмірами:', dimensions[0], dimensions[1], dimensions[2]);
			createTriangle(dimensions[0], dimensions[1], dimensions[2]);
		}
		
		closeQuickShapeModal();
	};

	// Функція створення прямокутника
	function createRectangle(width, height) {
		// Очищаємо попередні дані
		figureLines = [];
		pendingFreeLines = [];
		lineIdCounter = 1;
		pointCounter = 1;
		window.calculatedArea = null;
		window.customArea = null;
		
		// Скидаємо SVG
		const svg = document.getElementById('shapeCanvas');
		while (svg.firstChild) {
			svg.removeChild(svg.firstChild);
		}
		
		// Початкова точка
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
		
		const scale = 50; // 1 метр = 50 пікселів
		
		// Лінія 1: вправо (width)
		let lastPoint = shapePoints[shapePoints.length - 1];
		let endX = lastPoint.x + width * scale;
		let endY = lastPoint.y;
		
		const lineData1 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, width, 'right', false, lineData1);
		pointCounter++;
		shapePoints.push({x: endX, y: endY, num: pointCounter});
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: pointCounter,
			direction: 'right',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(width) }],
			code: `right\nline\n${parseFloat(width).toFixed(2)}`,
			length: parseFloat(width),
			isClosing: false,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Лінія 2: вниз (height)
		lastPoint = shapePoints[shapePoints.length - 1];
		endX = lastPoint.x;
		endY = lastPoint.y + height * scale;
		
		const lineData2 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, height, 'bottom', false, lineData2);
		pointCounter++;
		shapePoints.push({x: endX, y: endY, num: pointCounter});
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: pointCounter,
			direction: 'bottom',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(height) }],
			code: `bottom\nline\n${parseFloat(height).toFixed(2)}`,
			length: parseFloat(height),
			isClosing: false,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Лінія 3: вліво (width)
		lastPoint = shapePoints[shapePoints.length - 1];
		endX = lastPoint.x - width * scale;
		endY = lastPoint.y;
		
		const lineData3 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, width, 'left', false, lineData3);
		pointCounter++;
		shapePoints.push({x: endX, y: endY, num: pointCounter});
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: pointCounter,
			direction: 'left',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(width) }],
			code: `left\nline\n${parseFloat(width).toFixed(2)}`,
			length: parseFloat(width),
			isClosing: false,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Лінія 4: вгору (height) - замикаюча
		lastPoint = shapePoints[shapePoints.length - 1];
		endX = shapePoints[0].x;
		endY = shapePoints[0].y;
		
		const lineData4 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, height, 'top', true, lineData4);
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: 1,
			direction: 'top',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(height) }],
			code: `top\nline\n${parseFloat(height).toFixed(2)}`,
			length: parseFloat(height),
			isClosing: true,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Обчислюємо площу
		calculateAndDisplayArea();
		
		// Оновлюємо список ліній
		updateLinesList();
		
		// Автоматичне масштабування
		autoScaleAndCenterFigure();
		
		console.log('Прямокутник створено:', width, 'x', height);
	}

	// Функція створення трикутника
	function createTriangle(side1, side2, side3) {
		// Перевірка можливості існування трикутника (нерівність трикутника)
		if (side1 + side2 <= side3 || side1 + side3 <= side2 || side2 + side3 <= side1) {
			alert('Неможливо створити трикутник з такими сторонами (порушена нерівність трикутника)');
			return;
		}
		
		// Очищаємо попередні дані
		figureLines = [];
		pendingFreeLines = [];
		lineIdCounter = 1;
		pointCounter = 1;
		window.calculatedArea = null;
		window.customArea = null;
		
		// Скидаємо SVG
		const svg = document.getElementById('shapeCanvas');
		while (svg.firstChild) {
			svg.removeChild(svg.firstChild);
		}
		
		// Початкова точка
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
		
		const scale = 50; // 1 метр = 50 пікселів
		
		// Лінія 1: горизонтальна вправо (side1)
		let lastPoint = shapePoints[shapePoints.length - 1];
		let endX = lastPoint.x + side1 * scale;
		let endY = lastPoint.y;
		
		const lineData1 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, side1, 'right', false, lineData1);
		pointCounter++;
		shapePoints.push({x: endX, y: endY, num: pointCounter});
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: pointCounter,
			direction: 'right',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(side1) }],
			code: `right\nline\n${parseFloat(side1).toFixed(2)}`,
			length: parseFloat(side1),
			isClosing: false,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Лінія 2: обчислюємо позицію третьої точки за теоремою косинусів
		// Трикутник за годинниковою стрілкою: вправо → вниз-вправо → назад до початку
		const a = side1;
		const b = side2;
		const c = side3;
		
		// Кут при другій точці (між side1 та side2)
		// cos(angle) = (a² + b² - c²) / (2ab)
		const cosAngle = (a * a + b * b - c * c) / (2 * a * b);
		const angle = Math.acos(cosAngle);
		
		lastPoint = shapePoints[shapePoints.length - 1];
		
		// За годинниковою стрілкою - кут вниз (додатний в SVG координатах)
		// Базовий напрямок: 0 радіан = вправо
		// Повертаємо на кут вниз (за годинниковою)
		const finalAngle = angle; // Позитивний кут = вниз в SVG
		endX = lastPoint.x + Math.cos(finalAngle) * side2 * scale;
		endY = lastPoint.y + Math.sin(finalAngle) * side2 * scale;
		
		const lineData2 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, side2, 'free', false, lineData2);
		pointCounter++;
		shapePoints.push({x: endX, y: endY, num: pointCounter});
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: pointCounter,
			direction: 'free',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(side2) }],
			code: `free\nline\n${parseFloat(side2).toFixed(2)}`,
			length: parseFloat(side2),
			isClosing: false,
			isPending: false,
			quadrant: 'bottom',
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Лінія 3: замикаюча (side3) - від третьої точки до першої
		lastPoint = shapePoints[shapePoints.length - 1];
		endX = shapePoints[0].x;
		endY = shapePoints[0].y;
		
		const lineData3 = {
			dimensionVisible: true,
			dimensionRotated: false
		};
		drawLine(lastPoint.x, lastPoint.y, endX, endY, side3, 'free', true, lineData3);
		
		figureLines.push({
			id: lineIdCounter++,
			from: lastPoint.num,
			to: 1,
			direction: 'free',
			lineType: 'line',
			elements: [{ type: 'number', value: parseFloat(side3) }],
			code: `free\nline\n${parseFloat(side3).toFixed(2)}`,
			length: parseFloat(side3),
			isClosing: true,
			isPending: false,
			dimensionVisible: true,
			dimensionRotated: false
		});
		
		// Обчислюємо площу
		calculateAndDisplayArea();
		
		// Оновлюємо список ліній
		updateLinesList();
		
		// Автоматичне масштабування
		autoScaleAndCenterFigure();
		
		console.log('Трикутник створено:', side1, side2, side3);
	}

	// Допоміжна функція для малювання лінії
	function drawLine(x1, y1, x2, y2, length, direction, isClosing, lineData) {
		const svg = document.getElementById('shapeCanvas');
		
		// Малюємо лінію
		const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
		line.setAttribute('x1', x1);
		line.setAttribute('y1', y1);
		line.setAttribute('x2', x2);
		line.setAttribute('y2', y2);
		line.setAttribute('stroke', '#2196F3');
		line.setAttribute('stroke-width', '2');
		svg.appendChild(line);
		
		// ВИПРАВЛЕННЯ: переконуємось що length - це число
		const numericLength = typeof length === 'number' ? length : parseFloat(length);
		
		// Малюємо розмір (передаємо числове значення)
		drawLineDimension(x1, y1, x2, y2, numericLength, lineData);
		
		// Малюємо точку (якщо не замикаюча)
		if (!isClosing) {
			const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			circle.setAttribute('cx', x2);
			circle.setAttribute('cy', y2);
			circle.setAttribute('r', '5');
			circle.setAttribute('fill', '#e53935');
			svg.appendChild(circle);
			
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('x', x2 + 10);
			text.setAttribute('y', y2 - 5);
			text.setAttribute('font-size', '16');
			text.setAttribute('fill', '#e53935');
			text.setAttribute('font-weight', 'bold');
			text.textContent = pointCounter + 1;
			svg.appendChild(text);
		}
	}
    
});