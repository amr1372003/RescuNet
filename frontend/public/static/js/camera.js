document.addEventListener('DOMContentLoaded', () => {
    const uploadBtn = document.getElementById('uploadBtn');
    const videoUpload = document.getElementById('videoUpload');
    const livePreviewBtn = document.getElementById('livePreviewBtn');
    const stopPreviewBtn = document.getElementById('stopPreviewBtn');
    const videoPlaceholder = document.getElementById('videoPlaceholder');
    const cameraFeed = document.getElementById('cameraFeed');
    const processedStream = document.getElementById('processedStream');
    const modeToggle = document.getElementById('modeToggle');

    let clientWebsocket;
    let droneWebsocket;
    let uploadStreamInterval;

    // Hidden elements for processing upload
    const hiddenVideo = document.createElement('video');
    hiddenVideo.autoplay = true;
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    const hiddenCanvas = document.createElement('canvas');
    const hiddenCtx = hiddenCanvas.getContext('2d');

    // Handle File Upload
    uploadBtn.addEventListener('click', () => {
        videoUpload.click();
    });

    let currentFileUploadUrl = null;

    videoUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            if (currentFileUploadUrl) {
                URL.revokeObjectURL(currentFileUploadUrl);
            }
            currentFileUploadUrl = URL.createObjectURL(file);
            console.log("File selected:", file.name);
            startUploadStream(currentFileUploadUrl);
        }
    });

    // Handle Live Preview
    livePreviewBtn.addEventListener('click', () => {
        startLivePreview();
    });

    function startLivePreview() {
        const wsUrl = `ws://${window.location.hostname}:8000/ws/client`;
        console.log('Connecting to live stream at ' + wsUrl);

        clientWebsocket = new WebSocket(wsUrl);

        clientWebsocket.onopen = () => {
            console.log("Connected to stream");
            videoPlaceholder.classList.add('hidden');
            cameraFeed.classList.add('hidden');
            processedStream.classList.remove('hidden');

            // Toggle buttons
            livePreviewBtn.classList.add('hidden');
            stopPreviewBtn.classList.remove('hidden');

            // Send initial mode
            sendMode();
        };

        clientWebsocket.onmessage = (event) => {
            const blob = event.data;
            const url = URL.createObjectURL(blob);
            processedStream.src = url;

            // Clean up old URL to prevent memory leaks
            processedStream.onload = () => {
                URL.revokeObjectURL(url);
            };
        };

        clientWebsocket.onclose = () => {
            console.log("Stream disconnected");
            stopStream();
        };

        clientWebsocket.onerror = (err) => {
            console.error("Stream error:", err);
            stopStream();
        };
    }

    function startUploadStream(videoUrl) {
        // 1. Start playing video in background
        hiddenVideo.src = videoUrl;
        hiddenVideo.onloadedmetadata = () => {
            hiddenCanvas.width = 640; // Resize to match model input
            hiddenCanvas.height = 640;
            hiddenVideo.play();

            // 2. Connect as Drone
            const wsUrl = `ws://${window.location.hostname}:8000/ws/drone`;
            droneWebsocket = new WebSocket(wsUrl);

            droneWebsocket.onopen = () => {
                console.log("Connected as Drone (Upload)");

                // 3. Start sending frames
                uploadStreamInterval = setInterval(() => {
                    if (hiddenVideo.paused || hiddenVideo.ended) return;

                    hiddenCtx.drawImage(hiddenVideo, 0, 0, hiddenCanvas.width, hiddenCanvas.height);
                    hiddenCanvas.toBlob((blob) => {
                        if (droneWebsocket && droneWebsocket.readyState === WebSocket.OPEN) {
                            droneWebsocket.send(blob);
                        }
                    }, 'image/jpeg', 0.7);
                }, 100); // 10 FPS

                // 4. Automatically start viewing
                startLivePreview();
            };

            droneWebsocket.onerror = (err) => {
                console.error("Drone WS Error:", err);
                alert("Failed to connect to backend for processing.");
            };
        };
    }

    stopPreviewBtn.addEventListener('click', () => {
        stopStream();
    });

    function stopStream() {
        // Close Client WS
        if (clientWebsocket) {
            clientWebsocket.close();
            clientWebsocket = null;
        }

        // Close Drone WS (if active)
        if (droneWebsocket) {
            droneWebsocket.close();
            droneWebsocket = null;
        }

        // Stop Upload Interval
        if (uploadStreamInterval) {
            clearInterval(uploadStreamInterval);
            uploadStreamInterval = null;
        }

        // Stop Hidden Video
        hiddenVideo.pause();
        hiddenVideo.src = "";

        processedStream.src = "";
        processedStream.classList.add('hidden');
        videoPlaceholder.classList.remove('hidden');

        livePreviewBtn.classList.remove('hidden');
        stopPreviewBtn.classList.add('hidden');

        // Reset file input so the same file can be selected again
        videoUpload.value = "";

        if (currentFileUploadUrl) {
            URL.revokeObjectURL(currentFileUploadUrl);
            currentFileUploadUrl = null;
        }
    }

    // Handle Mode Toggle
    modeToggle.addEventListener('change', () => {
        sendMode();
    });

    function sendMode() {
        if (clientWebsocket && clientWebsocket.readyState === WebSocket.OPEN) {
            const mode = modeToggle.checked ? 'thermal' : 'rgb';
            console.log("Sending mode:", mode);
            clientWebsocket.send(JSON.stringify({ mode: mode }));
        }
    }
});
