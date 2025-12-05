import { useState, useRef, useEffect } from 'react';
import { Satellite, Upload, Play, Square, VideoOff } from 'lucide-react';

export default function LiveFeed() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [mode, setMode] = useState('rgb');
    const [uploadUrl, setUploadUrl] = useState(null);

    const videoUploadRef = useRef(null);
    const processedStreamRef = useRef(null); // The processed image

    // Hidden elements for processing
    const hiddenVideoRef = useRef(document.createElement('video'));
    const hiddenCanvasRef = useRef(document.createElement('canvas'));

    const clientWsRef = useRef(null);
    const droneWsRef = useRef(null);
    const uploadIntervalRef = useRef(null);

    useEffect(() => {
        // Setup hidden video properties
        const vid = hiddenVideoRef.current;
        vid.autoplay = true;
        vid.muted = true;
        vid.playsInline = true;

        return () => {
            stopStream();
        };
    }, []);

    const handleUploadClick = () => {
        videoUploadRef.current?.click();
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (uploadUrl) URL.revokeObjectURL(uploadUrl);
            const url = URL.createObjectURL(file);
            setUploadUrl(url);
            startUploadStream(url);
        }
    };

    const startUploadStream = (url) => {
        const vid = hiddenVideoRef.current;
        vid.src = url;

        vid.onloadedmetadata = () => {
            const canvas = hiddenCanvasRef.current;
            canvas.width = 640;
            canvas.height = 640;
            vid.play();

            // Connect as Drone
            const wsUrl = `ws://${window.location.hostname}:8000/ws/drone`;
            droneWsRef.current = new WebSocket(wsUrl);

            droneWsRef.current.onopen = () => {
                console.log("Connected as Drone (Upload)");

                // Start sending frames
                uploadIntervalRef.current = setInterval(() => {
                    if (vid.paused || vid.ended) return;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        if (droneWsRef.current?.readyState === WebSocket.OPEN) {
                            droneWsRef.current.send(blob);
                        }
                    }, 'image/jpeg', 0.7);
                }, 100); // 10 FPS

                // Auto start viewing
                startLivePreview();
            };

            droneWsRef.current.onerror = (err) => {
                console.error("Drone WS Error:", err);
                alert("Failed to connect to backend for processing.");
            };
        };
    };

    const startLivePreview = () => {
        const wsUrl = `ws://${window.location.hostname}:8000/ws/client`;
        clientWsRef.current = new WebSocket(wsUrl);

        clientWsRef.current.onopen = () => {
            console.log("Connected to stream");
            setIsPlaying(true);
            sendMode(mode);
        };

        clientWsRef.current.onmessage = (event) => {
            const blob = event.data;
            const url = URL.createObjectURL(blob);
            if (processedStreamRef.current) {
                processedStreamRef.current.src = url;
                processedStreamRef.current.onload = () => URL.revokeObjectURL(url);
            }
        };

        clientWsRef.current.onclose = () => {
            console.log("Stream disconnected");
            stopStream();
        };
    };

    const stopStream = () => {
        if (clientWsRef.current) {
            clientWsRef.current.close();
            clientWsRef.current = null;
        }
        if (droneWsRef.current) {
            droneWsRef.current.close();
            droneWsRef.current = null;
        }
        if (uploadIntervalRef.current) {
            clearInterval(uploadIntervalRef.current);
            uploadIntervalRef.current = null;
        }

        hiddenVideoRef.current.pause();
        hiddenVideoRef.current.src = "";

        if (processedStreamRef.current) {
            processedStreamRef.current.src = "";
        }

        setIsPlaying(false);
        if (uploadUrl) {
            URL.revokeObjectURL(uploadUrl);
            setUploadUrl(null);
        }
        if (videoUploadRef.current) {
            videoUploadRef.current.value = "";
        }
    };

    const toggleMode = () => {
        const newMode = mode === 'rgb' ? 'thermal' : 'rgb';
        setMode(newMode);
        sendMode(newMode);
    };

    const sendMode = (m) => {
        if (clientWsRef.current?.readyState === WebSocket.OPEN) {
            clientWsRef.current.send(JSON.stringify({ mode: m }));
        }
    };

    return (
        <main className="flex-grow flex flex-col w-full max-w-7xl mx-auto px-6 py-6 overflow-hidden relative pt-20">
            <div className="flex-none mb-6 z-20 relative">
                <div className="flex flex-col md:flex-row gap-4 justify-between items-center">
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Satellite className="text-blue-500 w-6 h-6" /> Surveillance Feed
                    </h2>

                    <div className="flex flex-col md:flex-row gap-3 items-center">
                        <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            ref={videoUploadRef}
                            onChange={handleFileChange}
                        />

                        <button
                            onClick={handleUploadClick}
                            className="bg-slate-800 text-slate-300 px-4 py-2.5 rounded-lg font-medium shadow-lg hover:bg-slate-700 hover:text-white transition flex items-center justify-center gap-2 text-sm border border-slate-700"
                        >
                            <Upload className="w-4 h-4" /> Upload Source
                        </button>

                        {!isPlaying ? (
                            <button
                                onClick={startLivePreview}
                                className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition flex items-center justify-center gap-2 text-sm"
                            >
                                <Play className="w-4 h-4" /> Connect to Feed
                            </button>
                        ) : (
                            <button
                                onClick={stopStream}
                                className="bg-red-600 text-white px-6 py-2.5 rounded-lg font-medium shadow-lg shadow-red-500/20 hover:bg-red-500 transition flex items-center justify-center gap-2 text-sm"
                            >
                                <Square className="w-4 h-4 fill-current" /> Stop Stream
                            </button>
                        )}

                        {/* Mode Toggle */}
                        <div className="flex items-center bg-slate-800 rounded-lg shadow-lg border border-slate-700 px-3 py-1.5 ml-2">
                            <span className="mr-3 text-xs font-bold uppercase tracking-wider text-slate-400">RGB</span>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={mode === 'thermal'}
                                    onChange={toggleMode}
                                />
                                <div className="w-11 h-6 bg-blue-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600 peer-checked:after:bg-white"></div>
                            </label>
                            <span className="ml-3 text-xs font-bold uppercase tracking-wider text-orange-500">Thermal</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Video Container */}
            <div className="relative h-full max-w-full aspect-square mx-auto rounded-2xl shadow-2xl shadow-black/50 overflow-hidden border border-slate-800 bg-black flex items-center justify-center group">

                {/* Overlay UI */}
                <div className="absolute top-4 left-4 z-10 flex gap-2">
                    <div className="px-2 py-1 bg-red-600/90 text-white text-xs font-bold rounded animate-pulse flex items-center gap-1">
                        <div className="w-2 h-2 bg-white rounded-full"></div> LIVE
                    </div>
                    <div className="px-2 py-1 bg-slate-900/80 text-slate-300 text-xs font-mono rounded border border-slate-700">
                        CAM-01
                    </div>
                </div>

                {/* Grid Overlay */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-10"
                    style={{
                        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                        backgroundSize: '100px 100px'
                    }}
                ></div>

                {/* Crosshairs */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-20">
                    <div className="w-8 h-8 border-2 border-white/50 rounded-full"></div>
                    <div className="absolute w-full h-[1px] bg-white/20"></div>
                    <div className="absolute h-full w-[1px] bg-white/20"></div>
                </div>

                {!isPlaying && (
                    <div className="text-slate-600 flex flex-col items-center z-0">
                        <VideoOff className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg font-medium tracking-wide">SIGNAL LOST</p>
                        <p className="text-xs text-slate-700 mt-2">Waiting for source connection...</p>
                    </div>
                )}

                <img
                    ref={processedStreamRef}
                    className={`w-auto h-full max-w-full object-contain z-10 ${!isPlaying ? 'hidden' : ''}`}
                    alt="Processed Stream"
                />
            </div>
        </main>
    );
}
