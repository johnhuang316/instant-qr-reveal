// frontend/public/participant.js
// Participant-specific JavaScript logic

document.addEventListener('DOMContentLoaded', () => {
    const SESSION_ID_KEY = 'qrSessionId'; // Key for storing session ID in localStorage

    // DOM elements for participant interface
    const participantInterface = document.getElementById('participantInterface');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCode = document.getElementById('qrCode');
    const participantResultContainer = document.getElementById('participantResultContainer');
    const resultImage = document.getElementById('resultImage');
    const resultMessage = document.getElementById('resultMessage');
    const statusText = document.querySelector('#qrCodeContainer .status-text'); // Get status text element
    const loadingIndicator = document.getElementById('loadingIndicator'); // Get loading indicator element

    // Ensure participant interface is visible if this script is loaded
    if (participantInterface) {
        participantInterface.style.display = 'block';
        document.title = 'InstaReveal QR Draw - Participant';
    }

    // Function to generate QR code and establish polling
    async function generateQrCodeAndConnect() {
        console.log('generateQrCodeAndConnect called.');
        let sessionId = localStorage.getItem(SESSION_ID_KEY);

        try {
            // Show loading indicator and update status text
            if (loadingIndicator) loadingIndicator.style.display = 'block';
            if (statusText) statusText.textContent = 'Generating QR Code...';
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
                    if (resultImage) resultImage.src = statusData.imageUrl;
                    if (qrCodeContainer) qrCodeContainer.style.display = 'none';
                    if (participantResultContainer) participantResultContainer.style.display = 'block';
                    if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator
                    console.log('Session already drawn, displaying result.');
                    return; // Exit function, no need for QR code or polling
                }
            }

            // Show QR code container
            if (qrCodeContainer) qrCodeContainer.style.display = 'block';
            console.log('QR code container set to display: block.');

            // Generate QR Code with session ID
            if (qrCode) qrCode.innerHTML = ''; // Clear previous QR code
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
                if (qrCode) qrCodeInstance.append(qrCode);
                console.log('QRCodeStyling appended with calculated pixel size:', finalQrCodeSize);
            }, 0); // Use setTimeout with 0 delay to defer execution

            // Update status text and hide loading indicator after QR code is generated
            if (statusText) statusText.textContent = 'Waiting for scan...';
            if (loadingIndicator) loadingIndicator.style.display = 'none';
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
                        if (participantResultContainer) participantResultContainer.style.display = 'block';
                        if (resultImage) resultImage.src = statusData.imageUrl;
                        if (resultMessage) resultMessage.textContent = 'Congratulations! Here is your prize!';
                        if (qrCodeContainer) qrCodeContainer.style.display = 'none';
                        // localStorage.removeItem(SESSION_ID_KEY); // Removed to persist session for the day
                        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator
                        console.log('Polling successful, result displayed.');
                    } else if (statusData.status === 2) {
                        // Stop polling on error
                        clearTimeout(pollTimeout);
                        console.error('Polling error:', statusData.message);
                        alert(`Error checking status: ${statusData.message}. Please try again.`);
                        if (qrCodeContainer) qrCodeContainer.style.display = 'none';
                        localStorage.removeItem(SESSION_ID_KEY);
                        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator
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
                        if (qrCodeContainer) qrCodeContainer.style.display = 'none';
                        localStorage.removeItem(SESSION_ID_KEY);
                        if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator
                    }
                }
            };
            // Start the first poll
            pollSessionStatus();
        } catch (error) {
            console.error('Error generating QR code:', error);
            alert(`Failed to generate QR code: ${error.message}. Please try again.`);
            // Ensure elements are hidden/shown correctly on error
            if (qrCodeContainer) qrCodeContainer.style.display = 'none';
            if (participantResultContainer) participantResultContainer.style.display = 'none';
            localStorage.removeItem(SESSION_ID_KEY); // Clear session ID on error
            if (loadingIndicator) loadingIndicator.style.display = 'none'; // Hide loading indicator
        }
    }

    // Initial call or on button click
    const generateQrBtn = document.getElementById('generateQrBtn');
    if (generateQrBtn) {
        generateQrBtn.addEventListener('click', generateQrCodeAndConnect);
    }

    // Automatically generate QR code and start polling on page load if a session exists or if it's the first load
    const existingSessionId = localStorage.getItem(SESSION_ID_KEY);
    if (existingSessionId) {
        generateQrCodeAndConnect();
    }
});
