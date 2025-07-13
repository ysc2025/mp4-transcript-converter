class MP4Transcriber {
    constructor() {
        this.currentFile = null;
        this.audioContext = null;
        this.recognition = null;
        this.isTranscribing = false;
        this.transcriptText = '';
        this.startTime = null;
        this.recognitionErrors = 0;
        this.maxErrors = 5;
        this.restartTimeout = null;
        this.lastRestartTime = 0;
        this.minRestartInterval = 1000;
        this.isOnline = navigator.onLine;
        this.hasNetworkError = false; // Flag to track if we have network issues
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupNetworkMonitoring();
        this.initializeSpeechRecognition();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileInfo = document.getElementById('fileInfo');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.progressBar = document.getElementById('progressBar');
        this.progressText = document.getElementById('progressText');
        this.controls = document.getElementById('controls');
        this.startBtn = document.getElementById('startTranscription');
        this.pauseBtn = document.getElementById('pauseTranscription');
        this.resetBtn = document.getElementById('resetTranscription');
        this.transcriptSection = document.getElementById('transcriptSection');
        this.transcriptTextArea = document.getElementById('transcriptText');
        this.copyBtn = document.getElementById('copyTranscript');
        this.downloadBtn = document.getElementById('downloadTranscript');
        this.clearBtn = document.getElementById('clearTranscript');
        this.wordCount = document.getElementById('wordCount');
        this.transcriptionTime = document.getElementById('transcriptionTime');
    }

    setupEventListeners() {
        // File upload events
        this.uploadBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));
        
        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        this.uploadArea.addEventListener('drop', (e) => this.handleFileDrop(e));
        this.uploadArea.addEventListener('click', () => this.fileInput.click());

        // Control buttons
        this.startBtn.addEventListener('click', () => this.startTranscription());
        this.pauseBtn.addEventListener('click', () => this.pauseTranscription());
        this.resetBtn.addEventListener('click', () => this.resetTranscription());

        // Transcript actions
        this.copyBtn.addEventListener('click', () => this.copyTranscript());
        this.downloadBtn.addEventListener('click', () => this.downloadTranscript());
        this.clearBtn.addEventListener('click', () => this.clearTranscript());
    }

    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.hasNetworkError = false;
            this.showSuccess('Internet connection restored');
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.showError('Internet connection lost. Transcription requires network access.');
            if (this.isTranscribing) {
                this.pauseTranscription();
            }
        });
    }

    checkNetworkConnectivity() {
        return new Promise((resolve) => {
            if (!navigator.onLine) {
                resolve(false);
                return;
            }

            // Try to fetch a small resource to verify actual connectivity
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            
            // Fallback timeout
            setTimeout(() => resolve(navigator.onLine), 3000);
        });
    }

    initializeSpeechRecognition() {
        if ('webkitSpeechRecognition' in window) {
            this.recognition = new webkitSpeechRecognition();
        } else if ('SpeechRecognition' in window) {
            this.recognition = new SpeechRecognition();
        } else {
            alert('Your browser does not support speech recognition. Please use Chrome browser.');
            return;
        }

        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            this.isTranscribing = true;
            this.startTime = Date.now();
            this.recognitionErrors = 0;
            // Reset network errors only on successful start
            if (this.networkErrors > 0) {
                this.networkErrors = 0;
            }
            this.updateUI();
        };

        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                this.transcriptText += finalTranscript + '\n';
                this.transcriptTextArea.value = this.transcriptText;
                this.updateWordCount();
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            
            // Handle network errors specifically
            if (event.error === 'network') {
                this.hasNetworkError = true;
                console.log('Network error detected, stopping transcription');
                this.showError('Network connection issue detected. Please check your internet connection and try again.');
                this.pauseTranscription();
                return;
            }
            
            // For non-network errors, increment general error count
            this.recognitionErrors++;
            
            if (this.recognitionErrors >= this.maxErrors) {
                this.showError('Too many speech recognition errors. Stopping transcription.');
                this.pauseTranscription();
                return;
            }
            
            // Handle specific error types
            switch (event.error) {
                case 'not-allowed':
                    this.showError('Microphone access denied. Please allow microphone access.');
                    this.pauseTranscription();
                    return;
                case 'service-not-allowed':
                    this.showError('Speech recognition service not allowed.');
                    this.pauseTranscription();
                    return;
                case 'aborted':
                    // Don't show error for aborted - usually intentional
                    break;
                default:
                    this.showError('Speech recognition error: ' + event.error);
            }
        };

        this.recognition.onend = () => {
            // Don't auto-restart if we have network errors - require manual intervention
            if (this.isTranscribing && this.recognitionErrors < this.maxErrors && !this.hasNetworkError) {
                this.restartRecognitionWithDelay();
            } else if (this.hasNetworkError) {
                console.log('Recognition ended due to network error, not auto-restarting');
                this.pauseTranscription();
            }
        };
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    handleFileDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFileSelect(files[0]);
        }
    }

    handleFileSelect(file) {
        if (!file) return;

        if (!file.type.includes('mp4') && !file.name.toLowerCase().endsWith('.mp4')) {
            this.showError('Please select an MP4 format file');
            return;
        }

        this.currentFile = file;
        this.showFileInfo(file);
        this.extractAudioFromVideo(file);
    }

    showFileInfo(file) {
        this.fileName.textContent = `File Name: ${file.name}`;
        this.fileSize.textContent = `File Size: ${this.formatFileSize(file.size)}`;
        this.fileInfo.style.display = 'block';
        this.progressText.textContent = 'Processing video file...';
        this.updateProgress(10);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async extractAudioFromVideo(file) {
        try {
            this.updateProgress(30);
            this.progressText.textContent = 'Extracting audio...';

            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            
            await new Promise((resolve) => {
                video.addEventListener('loadedmetadata', resolve);
            });

            this.updateProgress(60);
            this.progressText.textContent = 'Audio extraction complete, preparing transcription...';

            this.setupAudioPlayback(video);
            this.updateProgress(100);
            this.progressText.textContent = 'Ready to start transcription';
            this.controls.style.display = 'flex';

        } catch (error) {
            console.error('Audio extraction error:', error);
            this.showError('Audio extraction failed. Please check file format.');
        }
    }

    async restartRecognitionWithDelay() {
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
        }
        
        // Check network connectivity before restarting
        const isConnected = await this.checkNetworkConnectivity();
        if (!isConnected) {
            this.showError('No network connection. Please check your internet and try again.');
            this.pauseTranscription();
            return;
        }
        
        const now = Date.now();
        const timeSinceLastRestart = now - this.lastRestartTime;
        
        // Calculate delay
        const delay = Math.max(this.minRestartInterval - timeSinceLastRestart, 100);
        
        this.restartTimeout = setTimeout(() => {
            if (this.isTranscribing && this.recognition) {
                try {
                    this.lastRestartTime = Date.now();
                    this.recognition.start();
                } catch (error) {
                    console.error('Error restarting recognition:', error);
                    this.recognitionErrors++;
                    if (this.recognitionErrors < this.maxErrors) {
                        this.restartRecognitionWithDelay();
                    } else {
                        this.pauseTranscription();
                    }
                }
            }
        }, delay);
    }

    setupAudioPlayback(video) {
        this.video = video;
        video.volume = 0;
        video.loop = false;
    }

    updateProgress(percentage) {
        this.progressBar.style.width = percentage + '%';
    }

    async startTranscription() {
        if (!this.currentFile || !this.recognition) {
            this.showError('Please select a file first or check browser speech recognition support');
            return;
        }

        // Check network connectivity before starting
        const isConnected = await this.checkNetworkConnectivity();
        if (!isConnected) {
            this.showError('No internet connection. Speech recognition requires network access.');
            return;
        }

        this.transcriptSection.style.display = 'block';
        this.startBtn.disabled = true;
        this.pauseBtn.disabled = false;
        
        this.video.currentTime = 0;
        this.video.play();
        
        // Reset error counts before starting
        this.recognitionErrors = 0;
        this.hasNetworkError = false;
        
        try {
            this.recognition.start();
        } catch (error) {
            console.error('Error starting recognition:', error);
            this.showError('Failed to start speech recognition');
            this.pauseTranscription();
            return;
        }
        
        this.progressText.textContent = 'Transcribing...';
        this.startTranscriptionTimer();
    }

    pauseTranscription() {
        this.isTranscribing = false;
        
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('Error stopping recognition:', error);
            }
        }
        
        if (this.video) {
            this.video.pause();
        }
        
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        
        if (this.hasNetworkError) {
            this.progressText.textContent = 'Transcription stopped due to network error. Click Start to retry.';
        } else {
            this.progressText.textContent = 'Transcription paused';
        }
    }

    resetTranscription() {
        this.isTranscribing = false;
        
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (error) {
                console.error('Error stopping recognition:', error);
            }
        }
        
        if (this.video) {
            this.video.pause();
            this.video.currentTime = 0;
        }

        this.recognitionErrors = 0;
        this.hasNetworkError = false;
        this.transcriptText = '';
        this.transcriptTextArea.value = '';
        this.startBtn.disabled = false;
        this.pauseBtn.disabled = true;
        this.progressText.textContent = 'Reset complete, ready to start transcription';
        this.updateWordCount();
        this.transcriptionTime.textContent = 'Transcription Time: 00:00';
    }

    startTranscriptionTimer() {
        const timer = setInterval(() => {
            if (!this.isTranscribing) {
                clearInterval(timer);
                return;
            }
            
            if (this.startTime) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const minutes = Math.floor(elapsed / 60);
                const seconds = elapsed % 60;
                this.transcriptionTime.textContent = 
                    `Transcription Time: ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    updateWordCount() {
        const words = this.transcriptText.trim().split(/\s+/).filter(word => word.length > 0);
        this.wordCount.textContent = `Word Count: ${words.length}`;
    }

    copyTranscript() {
        if (!this.transcriptText.trim()) {
            this.showError('No text to copy');
            return;
        }

        navigator.clipboard.writeText(this.transcriptText).then(() => {
            this.showSuccess('Text copied to clipboard');
        }).catch(() => {
            this.transcriptTextArea.select();
            document.execCommand('copy');
            this.showSuccess('Text copied to clipboard');
        });
    }

    downloadTranscript() {
        if (!this.transcriptText.trim()) {
            this.showError('No text to download');
            return;
        }

        const blob = new Blob([this.transcriptText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.showSuccess('Text file downloaded');
    }

    clearTranscript() {
        if (confirm('Are you sure you want to clear all transcription results?')) {
            this.transcriptText = '';
            this.transcriptTextArea.value = '';
            this.updateWordCount();
            this.showSuccess('Transcription results cleared');
        }
    }

    updateUI() {
        if (this.isTranscribing) {
            this.startBtn.disabled = true;
            this.pauseBtn.disabled = false;
        } else {
            this.startBtn.disabled = false;
            this.pauseBtn.disabled = true;
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease;
            background: ${type === 'error' ? '#e74c3c' : '#27ae60'};
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

document.addEventListener('DOMContentLoaded', () => {
    new MP4Transcriber();
});