// Main JavaScript for unified InstaReveal QR Draw application
document.addEventListener('DOMContentLoaded', () => {
    const SESSION_ID_KEY = 'qrSessionId'; // Key for storing session ID in localStorage

    // DOM elements for operator interface
    const operatorInterface = document.getElementById('operatorInterface');
    const startScanBtn = document.getElementById('startScanBtn');
    const cameraContainer = document.getElementById('cameraContainer');
    const cameraPreview = document.getElementById('cameraPreview');
    const scanStatus = document.getElementById('scanStatus');
    const operatorResultContainer = document.getElementById('operatorResultContainer');
    const scanResultMessage = document.getElementById('scanResultMessage');
    const scanAgainBtn = document.getElementById('scanAgainBtn');
    let stream = null;
    let scanning = false;
    
    // DOM elements for participant interface
    const participantInterface = document.getElementById('participantInterface');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCode = document.getElementById('qrCode');
    const participantResultContainer = document.getElementById('participantResultContainer');
const resultImage = document.getElementById('resultImage');
const resultMessage = document.getElementById('resultMessage');
const downloadImageBtn = document.getElementById('downloadImageBtn'); // Get download button element
const statusText = document.querySelector('#qrCodeContainer .status-text'); // Get status text element
const loadingIndicator = document.getElementById('loadingIndicator'); // Get loading indicator element
    
    // Check URL path to determine which interface to show
    const path = window.location.pathname;
    if (path === '/operator' || path === '/operator/') {
        participantInterface.style.display = 'none';
        operatorInterface.style.display = 'block';
        document.title = 'InstaReveal QR Draw - Operator';
    } else if (path === '/admin' || path === '/admin/') {
        // This path is handled by admin.html directly, but ensure main interfaces are hidden
        participantInterface.style.display = 'none';
        operatorInterface.style.display = 'none';
        // The admin.html will load its own admin.js
    }
    else {
        participantInterface.style.display = 'block';
        operatorInterface.style.display = 'none';
        document.title = 'InstaReveal QR Draw - Participant';
    }
    
    // Operator functionality (QR code scanning)
    startScanBtn.addEventListener('click', async () => {
        try {
            // Request camera access
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment' } 
            });
            cameraPreview.srcObject = stream;
            
            // Show camera container and hide start button
            cameraContainer.style.display = 'block';
            startScanBtn.style.display = 'none';
            scanning = true;
            
            // Wait for video to load metadata before starting scan
            cameraPreview.onloadedmetadata = () => {
                scanQRCode();
            };
        } catch (error) {
            console.error('Error accessing camera:', error);
            alert('Failed to access camera. Please grant permission and try again.');
        }
    });
    
    scanAgainBtn.addEventListener('click', () => {
        // Hide result and show start button
        operatorResultContainer.style.display = 'none';
        startScanBtn.style.display = 'block';
        // Stop camera if it's running
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            cameraPreview.srcObject = null;
            cameraContainer.style.display = 'none';
        }
    });
    
    function scanQRCode() {
        if (!scanning) return;
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = cameraPreview.videoWidth;
        canvas.height = cameraPreview.videoHeight;
        
        context.drawImage(cameraPreview, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });
        
        if (code) {
            // Process scanned QR code (session ID)
            const sessionId = code.data;
            scanStatus.textContent = 'Processing...';
            processScannedSession(sessionId);
            // Continue scanning after processing
            requestAnimationFrame(scanQRCode); // Keep the loop going
        } else {
            scanStatus.textContent = 'Scanning for QR Code...';
            requestAnimationFrame(scanQRCode);
        }
    }
    
    async function processScannedSession(sessionId) {
        try {
            const response = await fetch('/api/pastor-scan', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ sessionId })
            });
            const result = await response.json();
            
            // Show result
            cameraContainer.style.display = 'none';
            operatorResultContainer.style.display = 'block';
            if (result.status === 1) { // 1 for success
                scanResultMessage.textContent = 'Scan successful. Result processed and pushed to participant.';
            } else if (result.status === 2) { // 2 for error
                scanResultMessage.textContent = `Error: ${result.message || 'Failed to process scan.'}`;
            }
        } catch (error) {
            console.error('Error processing scanned session:', error);
            scanResultMessage.textContent = 'Error: Failed to communicate with server.';
            operatorResultContainer.style.display = 'block';
        }
    }
    
    // Function to generate QR code and establish WebSocket connection
    async function generateQrCodeAndConnect() {
        console.log('generateQrCodeAndConnect called.');
        let sessionId = localStorage.getItem(SESSION_ID_KEY);

        try {
            // Show loading indicator and update status text
            loadingIndicator.style.display = 'block';
            statusText.textContent = 'Generating QR Code...';
            console.log('Loading indicator shown, status text updated.');

            if (!sessionId) {
                console.log('No existing session ID found, requesting from backend.');
                // Request session ID from backend if not found in localStorage
                const response = await fetch('/api/generate-qr-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Backend error: ${errorData.message || response.statusText}`);
                }

                const data = await response.json();
                sessionId = data.sessionId;
                
                if (!sessionId) {
                    throw new Error('Session ID not received from backend.');
                }
                localStorage.setItem(SESSION_ID_KEY, sessionId); // Store new session ID
                console.log('New session ID obtained and stored:', sessionId);
            } else {
                console.log('Reusing session ID from localStorage:', sessionId);
            }

            // Check session status from backend
            const statusResponse = await fetch(`/api/session-status?sessionId=${sessionId}`);
            if (!statusResponse.ok) {
                console.warn('Failed to fetch session status, proceeding with QR code generation and polling.');
            } else {
                const statusData = await statusResponse.json();
                if (statusData.status === 1 && statusData.imageUrl) { // 1 for drawn, use imageUrl
                    // Session already drawn, display result immediately
                    resultImage.src = statusData.imageUrl;
                    qrCodeContainer.style.display = 'none';
                    participantResultContainer.style.display = 'block';
                    downloadImageBtn.style.display = 'block'; // Show download button
                    loadingIndicator.style.display = 'none'; // Hide loading indicator
                    console.log('Session already drawn, displaying result.');
                    return; // Exit function, no need for QR code or polling
                }
            }

            // Show QR code container
            qrCodeContainer.style.display = 'block';
            console.log('QR code container set to display: block.');

            // Generate QR Code with session ID
            qrCode.innerHTML = ''; // Clear previous QR code
            console.log('Session ID used for QR code generation:', sessionId); // Log session ID for debugging

            if (typeof QRCodeStyling === 'undefined') {
                throw new Error('QRCodeStyling library not loaded. Check network or script tag.');
            }
            console.log('QRCodeStyling library is loaded.');

            // Use setTimeout to ensure qrCode element has rendered and has a clientWidth
            setTimeout(() => {
                // Calculate dynamic QR code size based on the actual rendered width of the qrCode element
                // This ensures the QR code is drawn with a concrete pixel size that fits its container.
                const finalQrCodeSize = 300; // Fixed size for QR code to match container's max-width
                console.log('Calculated QR code pixel size:', finalQrCodeSize);

                const qrCodeInstance = new QRCodeStyling({
                    data: sessionId,
                    type: "svg",
                    backgroundOptions: {
                        color: "transparent" // Set QR code background to transparent
                    }
                });
                
                // Append the QR code to the div
                qrCodeInstance.append(qrCode);
                console.log('QRCodeStyling appended with calculated pixel size:', finalQrCodeSize);
            }, 0); // Use setTimeout with 0 delay to defer execution
            
            // Update status text and hide loading indicator after QR code is generated
            statusText.textContent = 'Waiting for scan...';
            loadingIndicator.style.display = 'none';
            console.log('Status text updated, loading indicator hidden.');

            // Start polling for session status
            let pollTimeout;
            let currentPollInterval = 500; // Initial interval
            let pollStartTime = Date.now();
            let abortController; // Declare AbortController

            const pollSessionStatus = async () => {
                // Abort any previous ongoing request
                if (abortController) {
                    abortController.abort();
                }
                abortController = new AbortController();
                const signal = abortController.signal;

                try {
                    const statusResponse = await Promise.race([
                        fetch(`/api/session-status?sessionId=${sessionId}`, { signal }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), 3000)) // 3-second timeout
                    ]);
                    const statusData = await statusResponse.json();

                    if (statusData.status === 1 && statusData.imageUrl) {
                        // Stop polling
                        clearTimeout(pollTimeout);
                        // Display result
                        participantResultContainer.style.display = 'block';
                        resultImage.src = statusData.imageUrl;
                        resultMessage.textContent = 'Congratulations! Here is your prize!';
                        downloadImageBtn.style.display = 'block'; // Show download button
                        qrCodeContainer.style.display = 'none';
                        // localStorage.removeItem(SESSION_ID_KEY); // Removed to persist session for the day
                        loadingIndicator.style.display = 'none'; // Hide loading indicator
                        console.log('Polling successful, result displayed.');
                    } else if (statusData.status === 2) {
                        // Stop polling on error
                        clearTimeout(pollTimeout);
                        console.error('Polling error:', statusData.message);
                        alert(`Error checking status: ${statusData.message}. Please try again.`);
                        qrCodeContainer.style.display = 'none';
                        localStorage.removeItem(SESSION_ID_KEY);
                        loadingIndicator.style.display = 'none'; // Hide loading indicator
                    } else {
                        // Adjust polling interval based on elapsed time
                        const elapsedTime = Date.now() - pollStartTime;
                        let newInterval = 500;
                        if (elapsedTime > 60 * 1000) { // After 1 minute
                            newInterval = 3000;
                        } else if (elapsedTime > 30 * 1000) { // After 30 seconds
                            newInterval = 2000;
                        } else if (elapsedTime > 5 * 1000) { // After 5 seconds
                            newInterval = 1000;
                        }

                        if (newInterval !== currentPollInterval) {
                            currentPollInterval = newInterval;
                            console.log(`Polling interval adjusted to ${currentPollInterval}ms`);
                        }
                        // Add random jitter
                        const jitter = (Math.random() - 0.5) * 100; // ±50ms
                        const nextInterval = currentPollInterval + jitter;
                        // Schedule next poll with the new interval
                        pollTimeout = setTimeout(pollSessionStatus, nextInterval);
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        console.log('Fetch aborted (likely due to timeout or new poll)');
                    } else {
                        clearTimeout(pollTimeout);
                        console.error('Network error during polling:', error);
                        alert('Network error. Please check your connection and try again.');
                        qrCodeContainer.style.display = 'none';
                        localStorage.removeItem(SESSION_ID_KEY);
                        loadingIndicator.style.display = 'none'; // Hide loading indicator
                    }
                }
            };
            // Start the first poll
            pollSessionStatus();
        } catch (error) {
            console.error('Error generating QR code:', error);
            alert(`Failed to generate QR code: ${error.message}. Please try again.`);
            // Ensure elements are hidden/shown correctly on error
            qrCodeContainer.style.display = 'none';
            participantResultContainer.style.display = 'none';
            localStorage.removeItem(SESSION_ID_KEY); // Clear session ID on error
            loadingIndicator.style.display = 'none'; // Hide loading indicator on error
            // generateQrBtn.style.display = 'block'; // Button is removed from HTML
        }
    }

    // Call generateQrCodeAndConnect immediately if it's the participant interface
    if (path === '/' || path === '/index.html') { // Check if it's the main participant page
        generateQrCodeAndConnect();
    }
    
    // Download image functionality
    downloadImageBtn.addEventListener('click', async () => {
        const imageUrl = resultImage.src;
        if (imageUrl) {
            try {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                // Extract filename from URL or use a default
                const filename = imageUrl.substring(imageUrl.lastIndexOf('/') + 1) || 'prize_image.png';
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url); // Clean up the object URL
            } catch (error) {
                console.error('Error downloading image:', error);
                alert('圖片下載失敗，請稍後再試。');
            }
        } else {
            console.warn('No image URL found to download.');
        }
    });

});
