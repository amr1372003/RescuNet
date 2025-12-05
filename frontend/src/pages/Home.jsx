import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Video, Map, Bot, Activity, Zap } from 'lucide-react';

export default function Home() {
    const [status, setStatus] = useState('checking'); // checking, online, offline

    useEffect(() => {
        const checkStatus = async () => {
            try {
                const backendUrl = `http://${window.location.hostname}:8000`;
                const response = await fetch(`${backendUrl}/api/health`);
                if (response.ok) {
                    setStatus('online');
                } else {
                    setStatus('offline');
                }
            } catch (error) {
                setStatus('offline');
            }
        };

        checkStatus();
        const interval = setInterval(checkStatus, 180000);
        return () => clearInterval(interval);
    }, []);

    return (
        <main className="flex-grow pt-16">
            {/* Hero Section */}
            <section className="hero-bg min-h-[80vh] flex items-center justify-center text-center px-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/50 to-slate-950"></div>

                <div className="relative z-10 max-w-4xl mx-auto">
                    <div
                        className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider mb-6 transition-all duration-300 ${status === 'online'
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            : status === 'offline'
                                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400'
                            }`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full ${status === 'online'
                                ? 'bg-blue-500 animate-pulse'
                                : status === 'offline'
                                    ? 'bg-red-500'
                                    : 'bg-yellow-500 animate-pulse'
                                }`}
                        ></span>
                        <span>
                            {status === 'online'
                                ? 'System Operational'
                                : status === 'offline'
                                    ? 'System Offline'
                                    : 'Checking Status...'}
                        </span>
                    </div>

                    <h2 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
                        Next-Gen <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Disaster Response</span>
                    </h2>
                    <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
                        Deploy AI-powered drone surveillance and graph-based routing to locate survivors and optimize rescue missions in real-time.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            to="/live-feed"
                            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold shadow-lg shadow-blue-500/25 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        >
                            <Video className="w-5 h-5" /> Launch Live Feed
                        </Link>
                        <Link
                            to="/route"
                            className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg font-semibold transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        >
                            <Map className="w-5 h-5" /> Plan Route
                        </Link>
                    </div>
                </div>
            </section>

            {/* Stats / Features Grid */}
            <section className="py-20 px-6 bg-slate-950">
                <div className="max-w-7xl mx-auto">
                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl hover:border-blue-500/30 transition-colors group">
                            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
                                <Bot className="text-blue-400 w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Aerial Intelligence</h3>
                            <p className="text-slate-400 leading-relaxed">
                                Real-time thermal and RGB analysis using AI to detect survivors and fire hazards from drone feeds.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl hover:border-green-500/30 transition-colors group">
                            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-green-500/20 transition-colors">
                                <Activity className="text-green-400 w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Graph Routing</h3>
                            <p className="text-slate-400 leading-relaxed">
                                An advanced GNN paired with a C++ engine optimizes rescue paths, accounting for blocked roads and urgency levels.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl hover:border-red-500/30 transition-colors group">
                            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-red-500/20 transition-colors">
                                <Zap className="text-red-400 w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">Instant Response</h3>
                            <p className="text-slate-400 leading-relaxed">
                                Low-latency WebSocket streaming and C++ backend ensure critical data is delivered instantly.
                            </p>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
