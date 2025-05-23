/**
 * InstaReveal QR Draw System - Refactored Main Application
 * 使用模組化設計模式重構
 */

// ===== 基礎層 (Foundation Layer) =====

/**
 * 配置管理模組
 */
const Config = (function() {
    const config = {
        SESSION_ID_KEY: 'qrSessionId',
        API_ENDPOINTS: {
            GENERATE_QR: '/api/generate-qr-session',
            SESSION_STATUS: '/api/session-status',
            PASTOR_SCAN: '/api/pastor-scan'
        },
        POLLING: {
            INITIAL_INTERVAL: 500,
            INTERVALS: {
                AFTER_5_SECONDS: 1000,
                AFTER_30_SECONDS: 2000,
                AFTER_60_SECONDS: 3000
            },
            JITTER: 100,
            TIMEOUT: 3000
        },
        QR_CODE: {
            SIZE: 300,
            TYPE: 'svg',
            BACKGROUND_COLOR: 'transparent'
        }
    };

    return {
        get: (path) => {
            const keys = path.split('.');
            let result = config;
            for (const key of keys) {
                result = result[key];
            }
            return result;
        }
    };
})();

/**
 * 工具函數模組
 */
const Utils = (function() {
    return {
        // DOM 輔助函數
        $(selector) {
            return document.querySelector(selector);
        },
        
        $$(selector) {
            return document.querySelectorAll(selector);
        },
        
        show(element) {
            if (element) element.style.display = 'block';
        },
        
        hide(element) {
            if (element) element.style.display = 'none';
        },
        
        // 日誌函數
        log(message, level = 'info') {
            const timestamp = new Date().toISOString();
            console[level](`[${timestamp}] ${message}`);
        },
        
        // 錯誤處理
        handleError(error, userMessage) {
            this.log(error.message, 'error');
            if (userMessage) {
                alert(userMessage);
            }
        }
    };
})();

/**
 * 事件系統模組 (Observer Pattern)
 */
const EventBus = (function() {
    const events = {};
    
    return {
        on(event, callback) {
            if (!events[event]) {
                events[event] = [];
            }
            events[event].push(callback);
        },
        
        off(event, callback) {
            if (events[event]) {
                events[event] = events[event].filter(cb => cb !== callback);
            }
        },
        
        emit(event, data) {
            if (events[event]) {
                events[event].forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        Utils.handleError(error, null);
                    }
                });
            }
        }
    };
})();

// ===== 服務層 (Service Layer) =====

/**
 * API 服務模組 (Facade Pattern)
 */
const APIService = (function() {
    const makeRequest = async (url, options = {}) => {
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || response.statusText);
            }
            
            return await response.json();
        } catch (error) {
            Utils.log(`API request failed: ${url}`, 'error');
            throw error;
        }
    };
    
    return {
        async generateQRSession() {
            return makeRequest(Config.get('API_ENDPOINTS.GENERATE_QR'), {
                method: 'POST'
            });
        },
        
        async getSessionStatus(sessionId, signal) {
            return makeRequest(
                `${Config.get('API_ENDPOINTS.SESSION_STATUS')}?sessionId=${sessionId}`,
                { signal }
            );
        },
        
        async scanQRCode(sessionId) {
            return makeRequest(Config.get('API_ENDPOINTS.PASTOR_SCAN'), {
                method: 'POST',
                body: JSON.stringify({ sessionId })
            });
        }
    };
})();

/**
 * 儲存服務模組
 */
const StorageService = (function() {
    return {
        getSessionId() {
            return localStorage.getItem(Config.get('SESSION_ID_KEY'));
        },
        
        setSessionId(sessionId) {
            localStorage.setItem(Config.get('SESSION_ID_KEY'), sessionId);
        },
        
        clearSessionId() {
            localStorage.removeItem(Config.get('SESSION_ID_KEY'));
        }
    };
})();

/**
 * 輪詢管理服務 (Strategy Pattern)
 */
const PollingService = (function() {
    let pollTimeout = null;
    let abortController = null;
    let pollStartTime = null;
    let currentInterval = Config.get('POLLING.INITIAL_INTERVAL');
    
    const calculateInterval = () => {
        const elapsedTime = Date.now() - pollStartTime;
        
        if (elapsedTime > 60000) {
            return Config.get('POLLING.INTERVALS.AFTER_60_SECONDS');
        } else if (elapsedTime > 30000) {
            return Config.get('POLLING.INTERVALS.AFTER_30_SECONDS');
        } else if (elapsedTime > 5000) {
            return Config.get('POLLING.INTERVALS.AFTER_5_SECONDS');
        }
        
        return Config.get('POLLING.INITIAL_INTERVAL');
    };
    
    const addJitter = (interval) => {
        const jitter = (Math.random() - 0.5) * Config.get('POLLING.JITTER');
        return interval + jitter;
    };
    
    return {
        start(sessionId, onSuccess, onError) {
            pollStartTime = Date.now();
            currentInterval = Config.get('POLLING.INITIAL_INTERVAL');
            
            const poll = async () => {
                // 取消之前的請求
                if (abortController) {
                    abortController.abort();
                }
                
                abortController = new AbortController();
                
                try {
                    const response = await Promise.race([
                        APIService.getSessionStatus(sessionId, abortController.signal),
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Request timed out')), 
                            Config.get('POLLING.TIMEOUT'))
                        )
                    ]);
                    
                    if (response.status === 1 && response.imageUrl) {
                        this.stop();
                        onSuccess(response);
                    } else if (response.status === 2) {
                        this.stop();
                        onError(response);
                    } else {
                        // 繼續輪詢
                        const newInterval = calculateInterval();
                        if (newInterval !== currentInterval) {
                            currentInterval = newInterval;
                            Utils.log(`Polling interval adjusted to ${currentInterval}ms`);
                        }
                        
                        const nextInterval = addJitter(currentInterval);
                        pollTimeout = setTimeout(poll, nextInterval);
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        Utils.log('Fetch aborted');
                    } else {
                        this.stop();
                        onError({ message: error.message });
                    }
                }
            };
            
            poll();
        },
        
        stop() {
            if (pollTimeout) {
                clearTimeout(pollTimeout);
                pollTimeout = null;
            }
            
            if (abortController) {
                abortController.abort();
                abortController = null;
            }
        }
    };
})();

/**
 * 相機服務模組
 */
const CameraService = (function() {
    let stream = null;
    let scanning = false;
    
    return {
        async requestCamera(videoElement) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                videoElement.srcObject = stream;
                scanning = true;
                return stream;
            } catch (error) {
                throw new Error('Failed to access camera: ' + error.message);
            }
        },
        
        stopCamera() {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            scanning = false;
        },
        
        isScanning() {
            return scanning;
        },
        
        scanQRCode(videoElement, onCodeFound) {
            if (!scanning || !videoElement) return;
            
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            
            const scan = () => {
                if (!this.isScanning()) return;
                
                context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                
                const code = jsQR(imageData.data, imageData.width, imageData.height, {
                    inversionAttempts: 'dontInvert'
                });
                
                if (code) {
                    onCodeFound(code.data);
                }
                
                requestAnimationFrame(scan);
            };
            
            // 等待視頻載入後開始掃描
            videoElement.onloadedmetadata = () => {
                scan();
            };
        }
    };
})();

// ===== 業務層 (Business Layer) =====

/**
 * 狀態管理模組 (Singleton Pattern)
 */
const StateManager = (function() {
    const state = {
        sessionId: null,
        isPolling: false,
        currentInterface: null,
        qrCodeGenerated: false
    };
    
    return {
        getState(key) {
            return key ? state[key] : { ...state };
        },
        
        setState(key, value) {
            const oldValue = state[key];
            state[key] = value;
            
            // 發出狀態變化事件
            EventBus.emit('stateChanged', {
                key,
                oldValue,
                newValue: value
            });
        },
        
        clearSession() {
            this.setState('sessionId', null);
            this.setState('qrCodeGenerated', false);
            StorageService.clearSessionId();
        }
    };
})();

/**
 * 參與者業務邏輯模組
 */
const ParticipantLogic = (function() {
    const generateAndStartPolling = async () => {
        try {
            // 顯示載入狀態
            EventBus.emit('showLoading', { message: 'Generating QR Code...' });
            
            let sessionId = StateManager.getState('sessionId');
            
            if (!sessionId) {
                // 獲取新的 session ID
                const data = await APIService.generateQRSession();
                sessionId = data.sessionId;
                
                if (!sessionId) {
                    throw new Error('Session ID not received from backend.');
                }
                
                StateManager.setState('sessionId', sessionId);
                StorageService.setSessionId(sessionId);
                Utils.log('New session ID obtained: ' + sessionId);
            }
            
            // 檢查 session 狀態
            try {
                const statusData = await APIService.getSessionStatus(sessionId);
                if (statusData.status === 1 && statusData.imageUrl) {
                    // 已經抽中
                    EventBus.emit('showResult', {
                        imageUrl: statusData.imageUrl,
                        message: 'Congratulations! Here is your prize!'
                    });
                    return;
                }
            } catch (error) {
                Utils.log('Failed to check initial status, proceeding with QR generation');
            }
            
            // 生成 QR Code
            EventBus.emit('generateQRCode', { sessionId });
            
            // 開始輪詢
            startPolling(sessionId);
            
        } catch (error) {
            EventBus.emit('hideLoading');
            Utils.handleError(error, `Failed to generate QR code: ${error.message}`);
            StateManager.clearSession();
        }
    };
    
    const startPolling = (sessionId) => {
        StateManager.setState('isPolling', true);
        
        PollingService.start(
            sessionId,
            // 成功回調
            (response) => {
                EventBus.emit('showResult', {
                    imageUrl: response.imageUrl,
                    message: 'Congratulations! Here is your prize!'
                });
                StateManager.setState('isPolling', false);
            },
            // 錯誤回調
            (error) => {
                Utils.handleError(
                    new Error(error.message),
                    `Error checking status: ${error.message}`
                );
                StateManager.clearSession();
                StateManager.setState('isPolling', false);
                EventBus.emit('resetParticipantUI');
            }
        );
    };
    
    return {
        init() {
            // 檢查是否有存在的 session
            const existingSessionId = StorageService.getSessionId();
            if (existingSessionId) {
                StateManager.setState('sessionId', existingSessionId);
            }
            
            // 自動開始
            generateAndStartPolling();
        },
        
        reset() {
            PollingService.stop();
            StateManager.clearSession();
            EventBus.emit('resetParticipantUI');
        }
    };
})();

/**
 * 操作員業務邏輯模組
 */
const OperatorLogic = (function() {
    const processScannedSession = async (sessionId) => {
        try {
            EventBus.emit('updateScanStatus', { message: 'Processing...' });
            
            const result = await APIService.scanQRCode(sessionId);
            
            CameraService.stopCamera();
            
            if (result.status === 1) {
                EventBus.emit('showOperatorResult', {
                    success: true,
                    message: 'Scan successful. Result processed and pushed to participant.'
                });
            } else if (result.status === 2) {
                EventBus.emit('showOperatorResult', {
                    success: false,
                    message: `Error: ${result.message || 'Failed to process scan.'}`
                });
            }
        } catch (error) {
            CameraService.stopCamera();
            EventBus.emit('showOperatorResult', {
                success: false,
                message: 'Error: Failed to communicate with server.'
            });
        }
    };
    
    return {
        async startScanning(videoElement) {
            try {
                await CameraService.requestCamera(videoElement);
                EventBus.emit('showCameraUI');
                
                CameraService.scanQRCode(videoElement, (sessionId) => {
                    processScannedSession(sessionId);
                });
            } catch (error) {
                Utils.handleError(error, 'Failed to start camera: ' + error.message);
            }  
        
        }
    }
})();
    