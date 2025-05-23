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
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCode = document.getElementById('qrCode');
    const participantResultContainer = document.getElementById('participantResultContainer');
    const resultImage = document.getElementById('resultImage');
    const resultMessage = document.getElementById('resultMessage');
    const generateAgainBtn = document.getElementById('generateAgainBtn');
    const adminPanelBtn = document.getElementById('adminPanelBtn'); // Get the new admin button
    let ws;
    
    // Check URL path to determine which interface to show
    const path = window.location.pathname;
    if (path === '/operator' || path === '/operator/') {
        participantInterface.style.display = 'none';
        operatorInterface.style.display = 'block';
        adminPanelBtn.style.display = 'block'; // Show admin button
        document.title = 'InstaReveal QR Draw - Operator';
    } else if (path === '/admin' || path === '/admin/') {
        // This path is handled by admin.html directly, but ensure main interfaces are hidden
        participantInterface.style.display = 'none';
        operatorInterface.style.display = 'none';
        adminPanelBtn.style.display = 'none'; // Hide admin button on admin page itself
        // The admin.html will load its own admin.js
    }
    else {
        participantInterface.style.display = 'block';
        operatorInterface.style.display = 'none';
        adminPanelBtn.style.display = 'block'; // Show admin button
        document.title = 'InstaReveal QR Draw - Participant';
    }

    // Event listener for the admin panel button
    adminPanelBtn.addEventListener('click', () => {
        window.location.href = '/admin';
    });
    
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
            if (result.status === 'success') {
                scanResultMessage.textContent = 'Scan successful. Result processed and pushed to participant.';
            } else {
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
        let sessionId = localStorage.getItem(SESSION_ID_KEY);

        try {
            if (!sessionId) {
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
            } else {
                console.log('Reusing session ID from localStorage:', sessionId);
            }

            // Check session status from backend
            const statusResponse = await fetch(`/api/session-status?sessionId=${sessionId}`);
            if (!statusResponse.ok) {
                console.warn('Failed to fetch session status, proceeding with new WebSocket connection.');
                // Fallback: if status cannot be fetched, assume pending and proceed with WebSocket
            } else {
                const statusData = await statusResponse.json();
                if (statusData.sessionStatus === 'drawn' && statusData.resultImageUrl) {
                    // Session already drawn, display result immediately
                    resultImage.src = statusData.resultImageUrl;
                    resultMessage.textContent = statusData.message || 'Congratulations!';
                    qrCodeContainer.style.display = 'none';
                    participantResultContainer.style.display = 'block';
                    console.log('Session already drawn, displaying result from KV.');
                    return; // Exit function, no need for QR code or WebSocket
                }
            }

            // Show QR code container
            qrCodeContainer.style.display = 'block';
            // generateQrBtn.style.display = 'none'; // Button is removed from HTML

            // Generate QR Code with session ID
            qrCode.innerHTML = ''; // Clear previous QR code
            console.log('Session ID used:', sessionId); // Log session ID for debugging

            if (typeof QRCodeStyling === 'undefined') {
                throw new Error('QRCodeStyling library not loaded. Check network or script tag.');
            }

            // Calculate dynamic QR code size based on container width
            // Get the actual computed style of qrCodeContainer to account for its padding
            const computedStyle = window.getComputedStyle(qrCodeContainer);
            const paddingLeft = parseFloat(computedStyle.paddingLeft);
            const paddingRight = parseFloat(computedStyle.paddingRight);
            const paddingTop = parseFloat(computedStyle.paddingTop);
            const paddingBottom = parseFloat(computedStyle.paddingBottom);

            // Calculate available width/height for the QR code itself
            // Use Math.min to ensure it fits within the container's actual dimensions
            // Subtract a buffer to account for potential internal margins/quiet zones of the QR code library
            const qrCodeSize = Math.min(
                qrCodeContainer.offsetWidth - paddingLeft - paddingRight,
                qrCodeContainer.offsetHeight - paddingTop - paddingBottom
            ) - 20; // Subtract 20px buffer

            // Ensure qrCodeSize doesn't go below a reasonable minimum
            const finalQrCodeSize = Math.max(qrCodeSize, 100); // Minimum 100px

            const qrCodeInstance = new QRCodeStyling({
                data: sessionId,
                width: qrCodeSize, // Dynamic width
                height: qrCodeSize, // Dynamic height
                type: "svg"
            });
            
            // Append the QR code to the div
            qrCodeInstance.append(qrCode);
            console.log('QRCodeStyling append called with size:', qrCodeSize);
            
            // Establish WebSocket connection
            ws = new WebSocket(`wss://${window.location.host}/ws?sessionId=${sessionId}`);
            ws.onopen = () => {
                console.log('WebSocket connection established');
            };
            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                if (message.type === 'drawResult') {
                    // Display the result
                    resultImage.src = message.imageUrl;
                    resultMessage.textContent = message.message || 'Congratulations!';
                    qrCodeContainer.style.display = 'none';
                    participantResultContainer.style.display = 'block';
                    ws.close(); // Close WebSocket after receiving result
                    localStorage.removeItem(SESSION_ID_KEY); // Clear session ID after draw
                }
            };
            ws.onclose = () => {
                console.log('WebSocket connection closed');
            };
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                alert('WebSocket error. Please check console for details.');
            };
        } catch (error) {
            console.error('Error generating QR code:', error);
            alert(`Failed to generate QR code: ${error.message}. Please try again.`);
            // Ensure elements are hidden/shown correctly on error
            qrCodeContainer.style.display = 'none';
            participantResultContainer.style.display = 'none';
            localStorage.removeItem(SESSION_ID_KEY); // Clear session ID on error
            // generateQrBtn.style.display = 'block'; // Button is removed from HTML
        }
    }

    // Call generateQrCodeAndConnect immediately if it's the participant interface
    if (path === '/' || path === '/index.html') { // Check if it's the main participant page
        generateQrCodeAndConnect();
    }
    
    generateAgainBtn.style.display = 'none'; // Ensure the button is hidden if it somehow appears

    // No longer need generateAgainBtn event listener as it's removed from HTML
    // generateAgainBtn.addEventListener('click', () => {
    //     participantResultContainer.style.display = 'none';
    //     generateQrCodeAndConnect(); // Regenerate QR code on click
    // });
});
