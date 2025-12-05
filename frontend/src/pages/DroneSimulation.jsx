import { useState, useRef, useEffect } from 'react';
import { Camera, FileVideo, Play, Square, Upload, VideoOff, Wifi, WifiOff, AlertCircle } from 'lucide-react';

export default function DroneSimulation() {
    const [mode, setMode] = useState('camera'); // 'camera' | 'file'
    const [status, setStatus] = useState({ msg: 'Idle', type: 'neutral' }); // type: neutral, success, error, active
    const [isStreaming, setIsStreaming] = useState(false);
    const [fileName, setFileName] = useState(null);

    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const wsRef = useRef(null);
    const streamIntervalRef = useRef(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        return () => {
            stopStream();
        };
    }, []);

    const updateStatus = (msg, type) => {
        setStatus({ msg, type });
    };

    const connectWebSocket = () => {
        if (wsRef.current) return;

        const wsUrl = `ws://${window.location.hostname}:8000/ws/drone`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            updateStatus('Connected to Backend', 'success');
            if (mode === 'camera') startCameraStream();
            else startFileStream();
        };

        ws.onclose = () => {
            updateStatus('Disconnected', 'neutral');
            stopStream();
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            updateStatus('Connection Error', 'error');
        };

        wsRef.current = ws;
    };

    const startCameraStream = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }

            setIsStreaming(true);
            updateStatus('Streaming Camera...', 'active');

            streamIntervalRef.current = setInterval(() => sendFrame(), 100);
        } catch (err) {
            console.error("Camera Error:", err);
            updateStatus('Camera Access Denied', 'error');
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        }
    };

    const startFileStream = () => {
        if (videoRef.current) {
            videoRef.current.play();
            videoRef.current.loop = true;
        }

        setIsStreaming(true);
        updateStatus('Streaming File...', 'active');

        streamIntervalRef.current = setInterval(() => sendFrame(), 100);
    };

    const stopStream = () => {
        if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
        }

        if (videoRef.current) {
            const stream = videoRef.current.srcObject;
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                videoRef.current.srcObject = null;
            }
            videoRef.current.pause();
            if (mode === 'file') {
                videoRef.current.currentTime = 0;
            }
        }

        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }

        setIsStreaming(false);
        updateStatus('Idle', 'neutral');
    };

    const sendFrame = () => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Set canvas dimensions to match video
        if (canvas.width !== videoRef.current.videoWidth || canvas.height !== videoRef.current.videoHeight) {
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
        }

        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
            if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(blob);
            }
        }, 'image/jpeg', 0.7);
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            if (videoRef.current) {
                videoRef.current.src = url;
            }
            setFileName(file.name);
        }
    };

    const handleModeChange = (newMode) => {
        if (isStreaming) stopStream();
        setMode(newMode);
        setFileName(null);
        if (videoRef.current) {
            videoRef.current.src = "";
            videoRef.current.srcObject = null;
        }
    };

    const getStatusColor = () => {
        switch (status.type) {
            case 'success': return 'bg-emerald-500';
            case 'error': return 'bg-red-500';
            case 'active': return 'bg-blue-500 animate-pulse';
            default: return 'bg-slate-500';
        }
    };

    return (
        <main className="flex-grow flex flex-col items-center justify-center p-6 pt-24 min-h-screen bg-slate-950">
            <div className="max-w-4xl w-full space-y-8">

                {/* Header */}
                <div className="text-center">
                    <h2 className="text-3xl font-bold text-white mb-2">Drone Feed Simulator</h2>
                    <p className="text-slate-400">Simulate a drone connection by streaming from your camera or a video file.</p>
                </div>

                {/* Controls */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">

                    {/* Source Selection */}
                    <div className="flex justify-center mb-8 border-b border-slate-800 pb-6">
                        <div className="inline-flex bg-slate-800 rounded-lg p-1">
                            <button
                                onClick={() => handleModeChange('camera')}
                                className={`px-6 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'camera' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                            >
                                <Camera className="w-4 h-4" /> Camera Source
                            </button>
                            <button
                                onClick={() => handleModeChange('file')}
                                className={`px-6 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${mode === 'file' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
                            >
                                <FileVideo className="w-4 h-4" /> File Source
                            </button>
                        </div>
                    </div>

                    {/* Camera Controls */}
                    {mode === 'camera' && (
                        <div className="flex justify-center gap-4">
                            <button
                                onClick={connectWebSocket}
                                disabled={isStreaming}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Play className="w-4 h-4" /> Start Camera Stream
                            </button>
                            <button
                                onClick={stopStream}
                                disabled={!isStreaming}
                                className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-red-500/20 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Square className="w-4 h-4" /> Stop Stream
                            </button>
                        </div>
                    )}

                    {/* File Controls */}
                    {mode === 'file' && (
                        <div className="flex flex-col items-center gap-4">
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept="video/*"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isStreaming}
                                className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded-lg font-medium border border-slate-600 transition flex items-center gap-2 disabled:opacity-50"
                            >
                                <Upload className="w-4 h-4" /> Select Video File
                            </button>
                            {fileName && <p className="text-sm text-slate-400 italic">{fileName}</p>}

                            <div className="flex gap-4 mt-2">
                                <button
                                    onClick={connectWebSocket}
                                    disabled={isStreaming || !fileName}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-emerald-500/20 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Play className="w-4 h-4" /> Start File Stream
                                </button>
                                <button
                                    onClick={stopStream}
                                    disabled={!isStreaming}
                                    className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-lg font-medium shadow-lg shadow-red-500/20 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Square className="w-4 h-4" /> Stop Stream
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Status */}
                    <div className="mt-6 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800 text-slate-400 text-sm font-mono border border-slate-700">
                            <div className={`w-2 h-2 rounded-full ${getStatusColor()}`}></div>
                            Status: {status.msg}
                        </div>
                    </div>
                </div>

                {/* Preview */}
                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video flex items-center justify-center shadow-2xl">
                    <div className="absolute top-4 left-4 z-10 px-2 py-1 bg-slate-900/80 text-slate-300 text-xs font-mono rounded border border-slate-700">
                        SIMULATOR PREVIEW
                    </div>

                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-full object-contain ${(!isStreaming && !fileName) ? 'hidden' : ''}`}
                    />

                    {(!isStreaming && !fileName) && (
                        <div className="text-slate-600 flex flex-col items-center">
                            <VideoOff className="w-12 h-12 mb-3 opacity-50" />
                            <p className="text-sm font-medium">No active source</p>
                        </div>
                    )}
                </div>

            </div>

            {/* Hidden Canvas */}
            <canvas ref={canvasRef} className="hidden" />
        </main>
    );
}
