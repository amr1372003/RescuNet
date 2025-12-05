import { Github, Twitter } from 'lucide-react';

export default function Footer() {
    return (
        <footer className="bg-slate-900 border-t border-slate-800 py-12">
            <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-2">
                    <img src="/static/images/logo.png" alt="RescuNet" className="h-6 w-auto" />
                    <span className="text-slate-300 font-semibold">Rescu<span className="text-blue-500">Net</span></span>
                </div>
                <p className="text-slate-500 text-sm">© 2025 RescuNet. Built for the future of emergency response.</p>
                <div className="flex gap-4">
                    <a href="https://github.com/YoussefElebiary/RescuNet" className="text-slate-400 hover:text-white transition-colors"><Github className="w-5 h-5" /></a>
                    {/* <a href="#" className="text-slate-400 hover:text-white transition-colors"><Twitter className="w-5 h-5" /></a> */}
                </div>
            </div>
        </footer>
    );
}
