// Add toggle state to buttons when clicked
        document.querySelectorAll('.toolbar-button').forEach(button => {
            button.addEventListener('click', function() {
                const isHandButton = this.querySelector('.fa-hand-paper');
                
                // For Hand tool button - toggle state
                if (isHandButton) {
                    this.classList.toggle('bg-blue-50');
                    const icon = this.querySelector('i');
                    icon.classList.toggle('text-blue-600');
                    icon.classList.toggle('text-gray-700');
                    
                    if(this.querySelector('span')) {
                        this.querySelector('span').classList.toggle('text-blue-600');
                    }
                    
                    // Update cursor
                    svg.style.cursor = isHandToolActive() ? 'grab' : 'default';
                } 
                // For other buttons - normal behavior
                else {
                    // Remove active state from all buttons
                    document.querySelectorAll('.toolbar-button').forEach(btn => {
                        btn.classList.remove('bg-blue-50', 'text-blue-600');
                        btn.querySelector('i').classList.remove('text-blue-600');
                        btn.querySelector('i').classList.add('text-gray-700');
                        if(btn.querySelector('span')) {
                            btn.querySelector('span').classList.remove('text-blue-600');
                        }
                    });
                    
                    // Add active state to clicked button
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

        // Hand tool functionality
        const svg = document.querySelector('svg');
        let isDragging = false;
        let startX, startY;
        let viewBox = {
            x: 0,
            y: 0,
            width: 900,
            height: 1200
        };

        // Initialize viewBox
        svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

        // Check if hand tool is active
        function isHandToolActive() {
            const handButton = document.querySelector('.fa-hand-paper').closest('.toolbar-button');
            return handButton.classList.contains('bg-blue-50');
        }

        // Mouse and touch events for dragging
        svg.addEventListener('mousedown', (e) => {
            if (!isHandToolActive()) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            svg.style.cursor = 'grabbing';
            e.preventDefault();
        });

        svg.addEventListener('mousemove', (e) => {
            if (!isDragging || !isHandToolActive()) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            // Adjust viewBox position (scaled by current zoom level)
            const scale = viewBox.width / svg.clientWidth;
            viewBox.x -= dx * scale;
            viewBox.y -= dy * scale;
            
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
            
            startX = e.clientX;
            startY = e.clientY;
            e.preventDefault();
        });

        svg.addEventListener('mouseup', () => {
            isDragging = false;
            if (isHandToolActive()) {
                svg.style.cursor = 'grab';
            }
        });

        svg.addEventListener('mouseleave', () => {
            isDragging = false;
        });

        // Touch events
        let initialDistance = 0;
        let initialViewBox = {...viewBox};

        svg.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                // Pinch zoom start
                initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                initialViewBox = {...viewBox};
                e.preventDefault();
            } else if (isHandToolActive()) {
                // Single finger drag
                isDragging = true;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                e.preventDefault();
            }
        });

        svg.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                // Pinch zoom
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                
                if (initialDistance > 0) {
                    const scale = initialDistance / currentDistance;
                    const centerX = initialViewBox.x + initialViewBox.width / 2;
                    const centerY = initialViewBox.y + initialViewBox.height / 2;
                    
                    viewBox.width = initialViewBox.width * scale;
                    viewBox.height = initialViewBox.height * scale;
                    viewBox.x = centerX - viewBox.width / 2;
                    viewBox.y = centerY - viewBox.height / 2;
                    
                    svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
                }
                e.preventDefault();
            } else if (isDragging && isHandToolActive()) {
                // Single finger drag
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                
                // Adjust viewBox position (scaled by current zoom level)
                const scale = viewBox.width / svg.clientWidth;
                viewBox.x -= dx * scale;
                viewBox.y -= dy * scale;
                
                svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
                
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
                e.preventDefault();
            }
        });

        svg.addEventListener('touchend', () => {
            isDragging = false;
            initialDistance = 0;
        });

        // Initialize cursor state
        svg.style.cursor = 'default';
        svg.style.touchAction = 'none'; // Prevent browser touch handling

        // Zoom functionality
        const zoomFactor = 1.2; // 20% zoom per click
        
        function zoomIn() {
            const centerX = viewBox.x + viewBox.width / 2;
            const centerY = viewBox.y + viewBox.height / 2;
            
            viewBox.width /= zoomFactor;
            viewBox.height /= zoomFactor;
            viewBox.x = centerX - viewBox.width / 2;
            viewBox.y = centerY - viewBox.height / 2;
            
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        }
        
        function zoomOut() {
            const centerX = viewBox.x + viewBox.width / 2;
            const centerY = viewBox.y + viewBox.height / 2;
            
            viewBox.width *= zoomFactor;
            viewBox.height *= zoomFactor;
            viewBox.x = centerX - viewBox.width / 2;
            viewBox.y = centerY - viewBox.height / 2;
            
            svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        }

        // Add event listeners to zoom buttons
        document.querySelector('.fa-search-plus').closest('button').addEventListener('click', zoomIn);
        document.querySelector('.fa-search-minus').closest('button').addEventListener('click', zoomOut);

