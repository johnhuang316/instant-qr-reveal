document.addEventListener('DOMContentLoaded', () => {
    const qrCodeDisplay = document.getElementById('qr-code-display');
    const statusMessage = document.getElementById('status-message');
    const resultImage = document.getElementById('result-image');
    let pollingIntervalId = null;

    async function generateSessionAndPoll() {
        try {
            statusMessage.textContent = 'Generating session...';
            const response = await fetch('/api/generate-qr-session', {
                method: 'POST',
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Failed to generate session. Server returned an error.' }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const sessionId = data.sessionId;

            if (!sessionId) {
                throw new Error('Session ID not received from server.');
            }

            qrCodeDisplay.textContent = `Session ID: ${sessionId}`;
            statusMessage.textContent = 'Waiting for pastor to scan...';
            resultImage.style.display = 'none'; // Ensure image is hidden initially

            // Start polling
            pollingIntervalId = setInterval(() => {
                checkStatus(sessionId);
            }, 2000);

        } catch (error) {
            console.error('Error in generateSessionAndPoll:', error);
            statusMessage.textContent = `Error: ${error.message}`;
            if (pollingIntervalId) {
                clearInterval(pollingIntervalId);
            }
        }
    }

    async function checkStatus(sessionId) {
        try {
            const response = await fetch(`/api/check-status?sessionId=${sessionId}`);

            if (!response.ok) {
                // If session not found, stop polling as it's a permanent error for this session
                if (response.status === 404) {
                    statusMessage.textContent = 'Error: Session ID not found. Please refresh to start a new session.';
                    if (pollingIntervalId) {
                        clearInterval(pollingIntervalId);
                    }
                } else {
                    const errorData = await response.json().catch(() => ({ error: 'Failed to check status. Server returned an error.' }));
                    // For other errors, we might want to keep polling or display a specific message
                    statusMessage.textContent = `Error checking status: ${errorData.error || `HTTP error! status: ${response.status}`}`;
                }
                return; // Don't proceed further if there's an error
            }

            const data = await response.json();

            if (data.status === 'drawn') {
                statusMessage.textContent = 'Draw complete!';
                if (data.result_image_url) {
                    resultImage.src = data.result_image_url;
                    resultImage.style.display = 'block';
                } else {
                    resultImage.alt = 'Result image not available.';
                    resultImage.style.display = 'none';
                    statusMessage.textContent = 'Draw complete! (Image not available)';
                }
                if (pollingIntervalId) {
                    clearInterval(pollingIntervalId);
                }
            } else if (data.status === 'pending') {
                // Optional: Update status message if needed, for now, "Waiting for pastor to scan..." is fine.
                // statusMessage.textContent = 'Status: Pending...';
            } else {
                // Handle other potential statuses if any
                statusMessage.textContent = `Status: ${data.status || 'Unknown'}`;
            }

        } catch (error) {
            console.error('Error in checkStatus:', error);
            // Display a generic error or more specific if possible
            statusMessage.textContent = 'Error checking status. Please check your connection.';
            // Optionally stop polling on certain types of errors
            // if (pollingIntervalId) {
            //     clearInterval(pollingIntervalId);
            // }
        }
    }

    // Start the process when the page loads
    generateSessionAndPoll();
});
