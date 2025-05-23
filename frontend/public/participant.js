// Main JavaScript for participant interface
document.addEventListener('DOMContentLoaded', () => {
    const generateQrBtn = document.getElementById('generateQrBtn');
    const qrCodeContainer = document.getElementById('qrCodeContainer');
    const qrCode = document.getElementById('qrCode');
    const resultContainer = document.getElementById('resultContainer');
    const resultImage = document.getElementById('resultImage');
    const resultMessage = document.getElementById('resultMessage');
    const generateAgainBtn = document.getElementById('generateAgainBtn');
    let ws;

    generateQrBtn.addEventListener('click', async () => {
        try {
            // Request session ID from backend
            const response = await fetch('/api/generate-qr-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            const data = await response.json();
            const sessionId = data.sessionId;

            // Generate QR Code with session ID
            qrCode.innerHTML = '';
            const qrCodeInstance = new QRCodeStyling({
                text: sessionId,
                width: 200,
                height: 200
            });
            qrCodeInstance.append(qrCode);

            // Show QR code container and hide button
            qrCodeContainer.style.display = 'block';
            generateQrBtn.style.display = 'none';

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
                    resultContainer.style.display = 'block';
                    ws.close(); // Close WebSocket after receiving result
                }
            };
            ws.onclose = () => {
                console.log('WebSocket connection closed');
            };
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (error) {
            console.error('Error generating QR code:', error);
            alert('Failed to generate QR code. Please try again.');
        }
    });
    
    generateAgainBtn.addEventListener('click', () => {
        resultContainer.style.display = 'none';
        generateQrBtn.style.display = 'block';
    });
});
