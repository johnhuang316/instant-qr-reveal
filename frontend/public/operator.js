// Main JavaScript for operator interface
document.addEventListener('DOMContentLoaded', () => {
    const startScanBtn = document.getElementById('startScanBtn');
    const cameraContainer = document.getElementById('cameraContainer');
    const cameraPreview = document.getElementById('cameraPreview');
    const scanStatus = document.getElementById('scanStatus');
    const resultContainer = document.getElementById('resultContainer');
    const scanResultMessage = document.getElementById('scanResultMessage');
    const scanAgainBtn = document.getElementById('scanAgainBtn');
    let stream = null;
    let scanning = false;

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
        resultContainer.style.display = 'none';
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
            
            // Show result temporarily, then revert to scanning status
            resultContainer.style.display = 'block';
            if (result.status === 1) { // 1 for success
                scanResultMessage.textContent = `Scan successful: ${sessionId}. Result pushed to participant.`;
            } else if (result.status === 2) { // 2 for error
                scanResultMessage.textContent = `Error: ${result.message || 'Failed to process scan.'}`;
            }
            // Hide result message after a few seconds and resume scanning status
            setTimeout(() => {
                resultContainer.style.display = 'none';
                scanStatus.textContent = 'Scanning for QR Code...';
            }, 3000); // Display message for 3 seconds
        } catch (error) {
            console.error('Error processing scanned session:', error);
            scanResultMessage.textContent = 'Error: Failed to communicate with server.';
            resultContainer.style.display = 'block';
            setTimeout(() => {
                resultContainer.style.display = 'none';
                scanStatus.textContent = 'Scanning for QR Code...';
            }, 3000);
        }
    }
});
