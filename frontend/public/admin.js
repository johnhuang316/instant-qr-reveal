document.addEventListener('DOMContentLoaded', async () => {
    const displayR2Endpoint = document.getElementById('displayR2Endpoint');
    const imageUploadInput = document.getElementById('imageUploadInput');
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const uploadStatus = document.getElementById('uploadStatus');
    const imageGrid = document.getElementById('imageGrid');
    const imageGridStatus = document.getElementById('imageGridStatus');
    const backToMainBtn = document.getElementById('backToMain');

    let r2PublicEndpoint = ''; // Will be set dynamically

    // Function to fetch and display R2 public endpoint
    async function fetchR2PublicEndpoint() {
        try {
            const response = await fetch('/api/admin/r2/endpoint'); // New API endpoint for R2 endpoint
            if (response.ok) {
                const data = await response.json();
                r2PublicEndpoint = data.r2PublicEndpoint;
                displayR2Endpoint.textContent = r2PublicEndpoint;
            } else {
                displayR2Endpoint.textContent = `Error: ${response.statusText}`;
                displayR2Endpoint.style.color = 'red';
            }
        } catch (error) {
            console.error('Error fetching R2 public endpoint:', error);
            displayR2Endpoint.textContent = 'Error fetching R2 endpoint. Check console.';
            displayR2Endpoint.style.color = 'red';
        }
    }

    // Function to list images in R2
    async function listR2Images() {
        imageGrid.innerHTML = '';
        imageGridStatus.textContent = 'Loading images...';
        try {
            const response = await fetch('/api/admin/r2/list');
            if (response.ok) {
                const { images } = await response.json();
                if (images && images.length > 0) {
                    images.forEach(imageKey => {
                        const imageUrl = `${r2PublicEndpoint}/${imageKey}`; // Use dynamically obtained endpoint
                        const imageItem = document.createElement('div');
                        imageItem.className = 'image-item';
                        imageItem.innerHTML = `
                            <img src="${imageUrl}" alt="${imageKey}">
                            <div class="filename">${imageKey}</div>
                            <button data-key="${imageKey}">Delete</button>
                        `;
                        imageGrid.appendChild(imageItem);
                    });
                    imageGridStatus.textContent = `Loaded ${images.length} images.`;
                    imageGridStatus.style.color = 'green';
                } else {
                    imageGridStatus.textContent = 'No images found in R2 bucket.';
                    imageGridStatus.style.color = 'orange';
                }
            } else {
                imageGridStatus.textContent = `Error listing images: ${response.statusText}`;
                imageGridStatus.style.color = 'red';
            }
        } catch (error) {
            console.error('Error listing R2 images:', error);
            imageGridStatus.textContent = 'Error listing images. Check console.';
            imageGridStatus.style.color = 'red';
        }
    }

    // Function to upload images to R2
    uploadImageBtn.addEventListener('click', async () => {
        const files = imageUploadInput.files;
        if (files.length === 0) {
            uploadStatus.textContent = 'Please select files to upload.';
            uploadStatus.style.color = 'orange';
            return;
        }

        uploadStatus.textContent = 'Uploading...';
        uploadStatus.style.color = 'blue';

        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch(`/api/admin/r2/upload?filename=${encodeURIComponent(file.name)}`, {
                    method: 'POST',
                    body: formData
                });

                if (response.ok) {
                    uploadStatus.textContent = `Uploaded ${file.name} successfully!`;
                    uploadStatus.style.color = 'green';
                    await listR2Images(); // Refresh image list after upload
                } else {
                    const errorData = await response.json();
                    uploadStatus.textContent = `Error uploading ${file.name}: ${errorData.message || response.statusText}`;
                    uploadStatus.style.color = 'red';
                }
            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
                uploadStatus.textContent = `Error uploading ${file.name}. Check console.`;
                uploadStatus.style.color = 'red';
            }
        }
    });

    // Function to delete image from R2
    imageGrid.addEventListener('click', async (event) => {
        if (event.target.tagName === 'BUTTON' && event.target.dataset.key) {
            const imageKeyToDelete = event.target.dataset.key;
            if (!confirm(`Are you sure you want to delete ${imageKeyToDelete}?`)) {
                return;
            }

            imageGridStatus.textContent = `Deleting ${imageKeyToDelete}...`;
            imageGridStatus.style.color = 'blue';

            try {
                const response = await fetch(`/api/admin/r2/delete?filename=${encodeURIComponent(imageKeyToDelete)}`, {
                    method: 'DELETE',
                });

                if (response.ok) {
                    imageGridStatus.textContent = `${imageKeyToDelete} deleted successfully!`;
                    imageGridStatus.style.color = 'green';
                    await listR2Images(); // Refresh image list after deletion
                } else {
                    const errorData = await response.json();
                    imageGridStatus.textContent = `Error deleting ${imageKeyToDelete}: ${errorData.message || response.statusText}`;
                    imageGridStatus.style.color = 'red';
                }
            } catch (error) {
                console.error(`Error deleting ${imageKeyToDelete}:`, error);
                imageGridStatus.textContent = `Error deleting ${imageKeyToDelete}. Check console.`;
                imageGridStatus.style.color = 'red';
            }
        }
    });

    // Back to main application
    backToMainBtn.addEventListener('click', () => {
        window.location.href = '/'; // Navigate back to the main index.html
    });

    // Initial load
    await fetchR2PublicEndpoint(); // Fetch R2 endpoint first
    await listR2Images(); // Then list images
});
