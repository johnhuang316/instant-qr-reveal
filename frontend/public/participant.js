// Main JavaScript for participant interface
document.addEventListener('DOMContentLoaded', () => {
    const SESSION_ID_KEY = 'qrSessionId'; // Define key for localStorage

    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCode = document.getElementById('qrCode');
    const resultContainer = document.getElementById('resultContainer');
    const resultImage = document.getElementById('resultImage');
    const resultMessage = document.getElementById('resultMessage');
    const generateAgainBtn = document.getElementById('generateAgainBtn');
    const statusText = document.querySelector('#qrCodeContainer p'); // Get status text element
    const loadingIndicator = document.getElementById('loadingIndicator'); // Get loading indicator element

    async function generateQrCodeAndStartPolling() {
        let sessionId = localStorage.getItem(SESSION_ID_KEY);

        try {
            // Show loading indicator and update status text
            loadingIndicator.style.display = 'block';
            statusText.textContent = 'Generating QR Code...';

            if (!sessionId) {
                const response = await fetch('/api/generate-qr-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                sessionId = data.sessionId;
                localStorage.setItem(SESSION_ID_KEY, sessionId);
            } else {
                console.log('Reusing session ID from localStorage:', sessionId);
            }

            const statusResponse = await fetch(`/api/session-status?sessionId=${sessionId}`);
            if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                if (statusData.status === 1 && statusData.imageUrl) { // 1 for drawn, use imageUrl
                    resultImage.src = statusData.imageUrl;
                    resultMessage.textContent = 'Congratulations! Here is your prize!';
                    qrCodeContainer.style.display = 'none';
                    resultContainer.style.display = 'block';
                    loadingIndicator.style.display = 'none'; // Hide loading indicator
                    console.log('Session already drawn, displaying result.');
                    return;
                }
            } else {
                console.warn('Failed to fetch session status, proceeding with QR code generation and polling.');
            }

            qrCodeContainer.style.display = 'block';
            generateQrBtn.style.display = 'none';

            qrCode.innerHTML = '';
            const qrCodeInstance = new QRCodeStyling({
                text: sessionId,
                width: 200,
                height: 200,
                type: "svg"
            });
            qrCodeInstance.append(qrCode);

            // Update status text and hide loading indicator after QR code is generated
            statusText.textContent = 'Waiting for scan...';
            loadingIndicator.style.display = 'none';

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
                        clearTimeout(pollTimeout);
                        resultContainer.style.display = 'block';
                        resultImage.src = statusData.imageUrl;
                        resultMessage.textContent = 'Congratulations! Here is your prize!';
                        qrCodeContainer.style.display = 'none';
                        localStorage.removeItem(SESSION_ID_KEY);
                        loadingIndicator.style.display = 'none'; // Hide loading indicator
                    } else if (statusData.status === 2) {
                        clearTimeout(pollTimeout);
                        console.error('Polling error:', statusData.message);
                        alert(`Error checking status: ${statusData.message}. Please try again.`);
                        qrCodeContainer.style.display = 'none';
                        localStorage.removeItem(SESSION_ID_KEY);
                        loadingIndicator.style.display = 'none'; // Hide loading indicator
                    } else {
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
                        const jitter = (Math.random() - 0.5) * 100; // ±50ms
                        const nextInterval = currentPollInterval + jitter;
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
            pollSessionStatus();

        } catch (error) {
            console.error('Error generating QR code:', error);
            alert('Failed to generate QR code. Please try again.');
            qrCodeContainer.style.display = 'none';
            resultContainer.style.display = 'none';
            generateQrBtn.style.display = 'block';
            localStorage.removeItem(SESSION_ID_KEY);
            loadingIndicator.style.display = 'none'; // Hide loading indicator on error
        }
    }

    // Initial call or on button click
    generateQrBtn.addEventListener('click', generateQrCodeAndStartPolling);
    
    generateAgainBtn.addEventListener('click', () => {
        resultContainer.style.display = 'none';
        generateQrBtn.style.display = 'block';
        generateQrCodeAndStartPolling(); // Re-trigger generation and polling
    });

    // Automatically generate QR code and start polling on page load if a session exists or if it's the first load
    const existingSessionId = localStorage.getItem(SESSION_ID_KEY);
    if (existingSessionId) {
        generateQrCodeAndStartPolling();
    }
});
