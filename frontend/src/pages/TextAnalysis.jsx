import { useState, useRef } from 'react';
import { Keyboard, CloudUpload, Search, ChartPie, Activity as WaveSquare } from 'lucide-react';

export default function TextAnalysis() {
    const [text, setText] = useState('');
    const [fileName, setFileName] = useState('');
    const [fileEntries, setFileEntries] = useState([]);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState([]);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer.files[0];
        if (file && (file.type === "text/plain" || file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json'))) {
            processFile(file);
        } else {
            alert("Please drop a valid text file (.txt, .csv, .json)");
        }
    };

    const processFile = (file) => {
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            let entries = [];

            if (file.name.endsWith('.json')) {
                try {
                    const json = JSON.parse(content);
                    if (Array.isArray(json)) {
                        entries = json.map(item => typeof item === 'string' ? item : item.text || JSON.stringify(item));
                    } else {
                        entries = [json.text || JSON.stringify(json)];
                    }
                } catch (err) {
                    alert("Invalid JSON file");
                    return;
                }
            } else if (file.name.endsWith('.csv')) {
                // Simple CSV parser (assumes one column or 'text' column)
                const lines = content.split('\n');
                entries = lines.map(line => line.trim()).filter(line => line.length > 0);
            } else {
                // TXT: Split by newlines
                entries = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            }

            setFileEntries(entries);
            setText(`${entries.length} entries loaded from ${file.name}`);
            setResults([]); // Clear previous results
        };
        reader.readAsText(file);
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            processFile(file);
        }
    };

    const handleAnalyze = async () => {
        let entriesToAnalyze = [];

        if (fileEntries.length > 0) {
            entriesToAnalyze = fileEntries;
        } else if (text.trim()) {
            entriesToAnalyze = [text];
        } else {
            alert("Please enter text or upload a file first.");
            return;
        }

        setLoading(true);
        setResults([]);
        setProgress(0);
        const backendUrl = `http://${window.location.hostname}:8000`;

        try {
            const newResults = [];
            for (let i = 0; i < entriesToAnalyze.length; i++) {
                const entry = entriesToAnalyze[i];
                try {
                    const response = await fetch(`${backendUrl}/api/analyze-text`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ text: entry }),
                    });

                    if (response.ok) {
                        const data = await response.json();
                        newResults.push({ ...data, text: entry });
                    } else {
                        newResults.push({ error: "Analysis failed", text: entry });
                    }
                } catch (error) {
                    newResults.push({ error: "Network error", text: entry });
                }

                // Update progress
                setProgress(Math.round(((i + 1) / entriesToAnalyze.length) * 100));
                // Optional: Update results incrementally if needed, but for performance we might batch updates
                // For now, let's update every 5 items or at the end to avoid too many re-renders
                if (i % 5 === 0 || i === entriesToAnalyze.length - 1) {
                    setResults([...newResults]);
                }
            }
        } catch (error) {
            console.error("Error analyzing text:", error);
            alert("Failed to analyze text. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const clearFile = () => {
        setFileName('');
        setFileEntries([]);
        setText('');
        setResults([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <main className="h-screen pt-20 pb-4 px-4 flex flex-col overflow-hidden">
            <div className="flex-none mb-4 text-center">
                <h2 className="text-2xl font-bold text-white">Emergency Text Analysis</h2>
                <p className="text-slate-400 text-sm">Analyze distress messages for urgency and authenticity.</p>
            </div>

            <div className="flex-grow grid md:grid-cols-2 gap-4 min-h-0">
                {/* Input Section */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col min-h-0">
                    <h3 className="flex-none text-lg font-bold text-white mb-2 flex items-center gap-2 justify-between">
                        <span className="flex items-center gap-2"><Keyboard className="text-blue-500 w-4 h-4" /> Input Data</span>
                        {fileName && (
                            <button onClick={clearFile} className="text-xs text-red-400 hover:text-red-300 underline">Clear File</button>
                        )}
                    </h3>

                    <div className="flex-grow flex flex-col gap-3 min-h-0">
                        {fileName ? (
                            <div className="flex-grow flex flex-col items-center justify-center bg-slate-800/50 rounded-lg border border-slate-700 p-6">
                                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-3">
                                    <CloudUpload className="text-blue-400 w-8 h-8" />
                                </div>
                                <h4 className="text-white font-bold text-lg mb-1">{fileName}</h4>
                                <p className="text-slate-400 text-sm">{fileEntries.length} entries loaded</p>
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col min-h-0">
                                <textarea
                                    className="flex-grow w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none text-sm"
                                    placeholder="Paste distress message here..."
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                ></textarea>
                            </div>
                        )}

                        {!fileName && (
                            <>
                                <div className="flex-none relative py-1">
                                    <div className="absolute inset-0 flex items-center">
                                        <div className="w-full border-t border-slate-800"></div>
                                    </div>
                                    <div className="relative flex justify-center text-xs">
                                        <span className="px-2 bg-slate-900 text-slate-500">OR</span>
                                    </div>
                                </div>

                                <div className="flex-none">
                                    <label
                                        className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-700 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-800 transition-colors group"
                                        onDragOver={handleDragOver}
                                        onDrop={handleDrop}
                                    >
                                        <div className="flex flex-col items-center justify-center pt-2 pb-3">
                                            <CloudUpload className="text-xl text-slate-500 mb-1 group-hover:text-blue-500 transition-colors" />
                                            <p className="text-xs text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                            <p className="text-[10px] text-slate-500">TXT, CSV, JSON</p>
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept=".txt,.csv,.json"
                                            ref={fileInputRef}
                                            onChange={handleFileChange}
                                        />
                                    </label>
                                </div>
                            </>
                        )}

                        <button
                            onClick={handleAnalyze}
                            disabled={loading || (!text.trim() && !fileName)}
                            className="flex-none w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Search className="w-4 h-4" />}
                            {loading ? `Analyzing ${progress > 0 ? `${progress}%` : ''}` : 'Analyze Text'}
                        </button>
                    </div>
                </div>

                {/* Results Section */}
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col min-h-0">
                    <h3 className="flex-none text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <ChartPie className="text-purple-500 w-4 h-4" /> Analysis Results
                    </h3>

                    {!loading && results.length === 0 && (
                        <div className="flex-grow flex flex-col items-center justify-center text-slate-500">
                            <WaveSquare className="w-12 h-12 mb-3 opacity-20" />
                            <p className="text-sm">Waiting for input...</p>
                        </div>
                    )}

                    {loading && results.length === 0 && (
                        <div className="flex-grow flex flex-col items-center justify-center">
                            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-3"></div>
                            <p className="text-blue-400 font-medium animate-pulse text-sm">Processing...</p>
                        </div>
                    )}

                    {results.length > 0 && (
                        <div className="flex-grow overflow-y-auto space-y-3 pr-2">
                            {results.map((res, index) => (
                                <div key={index} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                                    <div className="flex justify-between items-start mb-2">
                                        <p className="text-slate-300 text-xs line-clamp-2 flex-grow mr-2 italic">"{res.text}"</p>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${res.prediction === 'REAL DISASTER' ? 'bg-red-900/50 text-red-400 border border-red-500/50' : 'bg-slate-700 text-slate-400'
                                            }`}>
                                            {res.prediction || 'ERROR'}
                                        </span>
                                    </div>

                                    {!res.error && (
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-500 uppercase">Priority:</span>
                                                <span className={`text-xs font-bold ${res.priority.includes('HIGH') ? 'text-red-500' : res.priority.includes('MEDIUM') ? 'text-orange-500' : 'text-slate-300'}`}>
                                                    {res.priority}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-500 uppercase">Conf:</span>
                                                <span className="text-xs font-mono text-white">{Math.round(res.confidence * 100)}%</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
