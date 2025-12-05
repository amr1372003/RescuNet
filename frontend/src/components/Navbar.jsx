import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = () => {
        setIsOpen(!isOpen);
        document.body.style.overflow = !isOpen ? 'hidden' : 'auto';
    };

    const closeMenu = () => {
        setIsOpen(false);
        document.body.style.overflow = 'auto';
    };

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'Live Feed', path: '/live-feed' },
        { name: 'Route Planner', path: '/route' },
        { name: 'Text Analysis', path: '/text-analysis' },
    ];

    return (
        <header className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 fixed w-full z-50">
            <div className="max-w-7xl mx-auto flex justify-between items-center px-6 py-4">
                {/* Logo */}
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center">
                        <img src="/static/images/logo.png" alt="RescuNet" className="h-8 w-auto" />
                    </div>
                    <h1 className="text-xl font-bold text-white tracking-wide">
                        Rescu<span className="text-blue-500">Net</span>
                    </h1>
                </div>

                {/* Desktop Menu */}
                <nav className="hidden md:block">
                    <ul className="flex space-x-8 text-sm font-medium">
                        {navLinks.map((link) => (
                            <li key={link.path}>
                                <NavLink
                                    to={link.path}
                                    className={({ isActive }) =>
                                        isActive
                                            ? "text-blue-400 relative after:content-[''] after:absolute after:-bottom-1 after:left-0 after:w-full after:h-0.5 after:bg-blue-500"
                                            : "text-slate-400 hover:text-white transition-colors"
                                    }
                                >
                                    {link.name}
                                </NavLink>
                            </li>
                        ))}
                    </ul>
                </nav>

                {/* Mobile Menu Button */}
                <button
                    onClick={toggleMenu}
                    className="md:hidden text-slate-300 hover:text-white transition"
                >
                    <Menu className="w-6 h-6" />
                </button>

                {/* Mobile Menu Overlay */}
                <div
                    className={`fixed inset-0 z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                        } md:hidden bg-slate-900/95 backdrop-blur-3xl`}
                >
                    <div className="flex flex-col h-full">
                        <div className="flex justify-end p-6">
                            <button onClick={toggleMenu} className="text-slate-300 hover:text-white transition">
                                <X className="w-8 h-8" />
                            </button>
                        </div>

                        <nav className="flex-1 flex items-center justify-center">
                            <ul className="space-y-8 text-center">
                                {navLinks.map((link) => (
                                    <li key={link.path}>
                                        <NavLink
                                            to={link.path}
                                            onClick={closeMenu}
                                            className={({ isActive }) =>
                                                isActive
                                                    ? "text-2xl font-bold text-blue-400 block py-2 transition-colors"
                                                    : "text-2xl font-bold text-slate-300 hover:text-white block py-2 transition-colors"
                                            }
                                        >
                                            {link.name}
                                        </NavLink>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>
                </div>
            </div>
        </header>
    );
}
