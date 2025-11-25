document.addEventListener('DOMContentLoaded', () => {
    const imageInput = document.getElementById('image-input');
    const textInput = document.getElementById('text-input');
    const embedButton = document.getElementById('embed-button');
    const extractButton = document.getElementById('extract-button');
    const imagePreview = document.getElementById('image-preview');
    const log = document.getElementById('log');
    const downloadLink = document.getElementById('download-link');

    let image = null;

    imageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                image = new Image();
                image.onload = () => {
                    imagePreview.src = image.src;
                    downloadLink.style.display = 'none';
                };
                image.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });

    embedButton.addEventListener('click', () => {
        if (image && textInput.value) {
            try {
                const steganography = new SimpleStegano();
                const stegoDataURL = steganography.embed(image, textInput.value);
                image.src = stegoDataURL;
                imagePreview.src = stegoDataURL;
                downloadLink.href = stegoDataURL;
                downloadLink.download = 'stego-image.png';
                downloadLink.style.display = 'block';
                log.textContent = 'Text embedded successfully.';
            } catch (error) {
                log.textContent = `Error: ${error.message}`;
            }
        } else {
            log.textContent = 'Please select an image and enter text to embed.';
        }
    });

    extractButton.addEventListener('click', () => {
        if (image) {
            try {
                const steganography = new SimpleStegano();
                const extractedText = steganography.extract(image);
                log.textContent = `Extracted text: ${extractedText}`;
            } catch (error) {
                log.textContent = `Error: ${error.message}`;
            }
        } else {
            log.textContent = 'Please select an image to extract text from.';
        }
    });
});
