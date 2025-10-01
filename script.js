class HandCursorController {
    constructor() {
        this.video = document.getElementById('webcam');
        this.webcamCanvas = document.getElementById('webcamOutput');
        this.webcamCtx = this.webcamCanvas.getContext('2d');
        this.mainCanvas = document.getElementById('mainCanvas');
        this.mainCtx = this.mainCanvas.getContext('2d');
        this.cursor = document.getElementById('cursor');
        
        this.status = document.getElementById('status');
        this.gestureStatus = document.getElementById('gestureStatus');
        this.cursorPos = document.getElementById('cursorPos');
        
        this.hands = null;
        this.camera = null;
        this.isActive = false;
        this.animationId = null;
        
        // Cursor properties
        this.cursorPosition = { x: 0, y: 0 };
        this.targetPosition = { x: 0, y: 0 };
        this.isDragging = false;
        this.isClicking = false;
        
        // Canvas dimensions
        this.canvasRect = null;
        
        this.init();
    }

    async init() {
        // Set canvas dimensions
        this.setCanvasDimensions();
        window.addEventListener('resize', () => this.setCanvasDimensions());
        
        // Initialize MediaPipe Hands
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.5
        });

        this.hands.onResults(this.onHandResults.bind(this));

        // Setup camera
        this.camera = new Camera(this.video, {
            onFrame: async () => {
                if (this.isActive) {
                    await this.hands.send({ image: this.video });
                }
            },
            width: 640,
            height: 480
        });

        // Set webcam canvas dimensions
        this.webcamCanvas.width = this.video.clientWidth;
        this.webcamCanvas.height = this.video.clientHeight;

        // Event listeners
        document.getElementById('startBtn').addEventListener('click', () => this.toggleControl());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetCursor());
        
        // Initialize main canvas
        this.drawMainCanvas();
        
        this.status.textContent = 'Click "Start Gesture Control" to begin';
    }

    setCanvasDimensions() {
        const container = this.mainCanvas.parentElement;
        this.mainCanvas.width = container.clientWidth;
        this.mainCanvas.height = container.clientHeight;
        this.canvasRect = this.mainCanvas.getBoundingClientRect();
        this.drawMainCanvas();
    }

    drawMainCanvas() {
        // Draw grid pattern on black canvas
        this.mainCtx.fillStyle = '#000000';
        this.mainCtx.fillRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);
        
        // Draw grid lines
        this.mainCtx.strokeStyle = '#1a1a1a';
        this.mainCtx.lineWidth = 1;
        
        const gridSize = 50;
        for (let x = 0; x <= this.mainCanvas.width; x += gridSize) {
            this.mainCtx.beginPath();
            this.mainCtx.moveTo(x, 0);
            this.mainCtx.lineTo(x, this.mainCanvas.height);
            this.mainCtx.stroke();
        }
        
        for (let y = 0; y <= this.mainCanvas.height; y += gridSize) {
            this.mainCtx.beginPath();
            this.mainCtx.moveTo(0, y);
            this.mainCtx.lineTo(this.mainCanvas.width, y);
            this.mainCtx.stroke();
        }
        
        // Draw center crosshair
        this.mainCtx.strokeStyle = '#333';
        this.mainCtx.lineWidth = 2;
        this.mainCtx.beginPath();
        this.mainCtx.moveTo(this.mainCanvas.width / 2, 0);
        this.mainCtx.lineTo(this.mainCanvas.width / 2, this.mainCanvas.height);
        this.mainCtx.moveTo(0, this.mainCanvas.height / 2);
        this.mainCtx.lineTo(this.mainCanvas.width, this.mainCanvas.height / 2);
        this.mainCtx.stroke();
    }

    onHandResults(results) {
        this.webcamCtx.save();
        this.webcamCtx.clearRect(0, 0, this.webcamCanvas.width, this.webcamCanvas.height);
        
        // Draw webcam feed
        this.webcamCtx.drawImage(results.image, 0, 0, this.webcamCanvas.width, this.webcamCanvas.height);
        
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            
            // Draw hand landmarks on webcam feed
            drawingUtils.drawConnectors(this.webcamCtx, landmarks, 
                                      HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
            drawingUtils.drawLandmarks(this.webcamCtx, landmarks, 
                                     { color: '#FF0000', lineWidth: 1 });
            
            // Process gestures and update cursor
            this.processGesture(landmarks);
        } else {
            this.gestureStatus.textContent = 'Gesture: No hand detected';
        }
        
        this.webcamCtx.restore();
    }

    processGesture(landmarks) {
        // Get key landmarks
        const indexTip = landmarks[8];
        const middleTip = landmarks[12];
        const ringTip = landmarks[16];
        const pinkyTip = landmarks[20];
        const thumbTip = landmarks[4];
        
        // Convert normalized coordinates to canvas coordinates
        const canvasX = indexTip.x * this.mainCanvas.width;
        const canvasY = indexTip.y * this.mainCanvas.height;
        
        this.targetPosition.x = canvasX;
        this.targetPosition.y = canvasY;
        
        // Gesture recognition
        const fingerStates = this.getFingerStates(landmarks);
        
        if (fingerStates.indexUp && !fingerStates.middleUp && 
            !fingerStates.ringUp && !fingerStates.pinkyUp) {
            // Index finger only - Move cursor
            this.gestureStatus.textContent = 'Gesture: Cursor Move';
            this.isDragging = false;
            this.updateCursorStyle('move');
        } 
        else if (!fingerStates.indexUp && !fingerStates.middleUp && 
                 !fingerStates.ringUp && !fingerStates.pinkyUp) {
            // All fingers down - Click
            this.gestureStatus.textContent = 'Gesture: Click';
            if (!this.isClicking) {
                this.simulateClick();
                this.isClicking = true;
            }
            this.updateCursorStyle('click');
        }
        else if (fingerStates.indexUp && fingerStates.middleUp && 
                 !fingerStates.ringUp && !fingerStates.pinkyUp) {
            // Victory sign - Right click
            this.gestureStatus.textContent = 'Gesture: Right Click';
            if (!this.isClicking) {
                this.simulateRightClick();
                this.isClicking = true;
            }
            this.updateCursorStyle('right-click');
        }
        else if (fingerStates.indexUp && fingerStates.middleUp && 
                 fingerStates.ringUp && fingerStates.pinkyUp) {
            // Open hand - Drag mode
            this.gestureStatus.textContent = 'Gesture: Drag Mode';
            this.isDragging = true;
            this.updateCursorStyle('drag');
        }
        else {
            this.gestureStatus.textContent = 'Gesture: Other';
            this.isClicking = false;
            this.updateCursorStyle('normal');
        }
        
        // Update cursor position with smooth interpolation
        this.updateCursorPosition();
    }

    getFingerStates(landmarks) {
        const isFingerUp = (tipIndex, pipIndex) => {
            return landmarks[tipIndex].y < landmarks[pipIndex].y;
        };
        
        return {
            indexUp: isFingerUp(8, 6),   // Index tip vs PIP
            middleUp: isFingerUp(12, 10), // Middle tip vs PIP
            ringUp: isFingerUp(16, 14),   // Ring tip vs PIP
            pinkyUp: isFingerUp(20, 18),  // Pinky tip vs PIP
            thumbUp: isFingerUp(4, 2)     // Thumb tip vs PIP
        };
    }

    updateCursorPosition() {
        // Smooth interpolation for cursor movement
        const smoothness = 0.3;
        this.cursorPosition.x += (this.targetPosition.x - this.cursorPosition.x) * smoothness;
        this.cursorPosition.y += (this.targetPosition.y - this.cursorPosition.y) * smoothness;
        
        // Update cursor element position
        this.cursor.style.left = (this.cursorPosition.x - 10) + 'px';
        this.cursor.style.top = (this.cursorPosition.y - 10) + 'px';
        
        // Update position display
        this.cursorPos.textContent = `Cursor: (${Math.round(this.cursorPosition.x)}, ${Math.round(this.cursorPosition.y)})`;
    }

    updateCursorStyle(mode) {
        this.cursor.className = 'cursor';
        
        switch(mode) {
            case 'click':
                this.cursor.classList.add('clicking');
                break;
            case 'right-click':
                this.cursor.style.background = '#4444ff';
                break;
            case 'drag':
                this.cursor.style.background = '#ffaa00';
                break;
            case 'move':
                this.cursor.style.background = '#ff4444';
                break;
            default:
                this.cursor.style.background = '#ff4444';
        }
    }

    simulateClick() {
        this.createClickEffect(this.cursorPosition.x, this.cursorPosition.y, '#44ff44');
        console.log('Click at:', this.cursorPosition);
    }

    simulateRightClick() {
        this.createClickEffect(this.cursorPosition.x, this.cursorPosition.y, '#4444ff');
        console.log('Right click at:', this.cursorPosition);
    }

    createClickEffect(x, y, color) {
        const effect = document.createElement('div');
        effect.className = 'click-effect';
        effect.style.left = (x - 25) + 'px';
        effect.style.top = (y - 25) + 'px';
        effect.style.borderColor = color;
        document.querySelector('.main-canvas-container').appendChild(effect);
        
        setTimeout(() => {
            effect.remove();
        }, 600);
    }

    toggleControl() {
        this.isActive = !this.isActive;
        const startBtn = document.getElementById('startBtn');
        
        if (this.isActive) {
            this.status.textContent = 'Status: ACTIVE - Show your hand to the camera';
            startBtn.textContent = 'Stop Gesture Control';
            startBtn.style.background = 'linear-gradient(45deg, #ff4757, #ff3838)';
            this.camera.start();
            this.startAnimation();
        } else {
            this.status.textContent = 'Status: INACTIVE';
            startBtn.textContent = 'Start Gesture Control';
            startBtn.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a24)';
            this.camera.stop();
            this.stopAnimation();
        }
    }

    resetCursor() {
        this.cursorPosition.x = this.mainCanvas.width / 2;
        this.cursorPosition.y = this.mainCanvas.height / 2;
        this.targetPosition.x = this.cursorPosition.x;
        this.targetPosition.y = this.cursorPosition.y;
        this.updateCursorPosition();
    }

    startAnimation() {
        const animate = () => {
            this.drawMainCanvas();
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new HandCursorController();
});

// Error handling for webcam access
window.addEventListener('error', (e) => {
    console.error('Error:', e.error);
    alert('Error initializing webcam. Please make sure you have a webcam connected and have granted camera permissions.');
});