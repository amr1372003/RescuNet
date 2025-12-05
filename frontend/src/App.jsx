import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import LiveFeed from './pages/LiveFeed';
import RoutePlanner from './pages/RoutePlanner';
import TextAnalysis from './pages/TextAnalysis';
import DroneSimulation from './pages/DroneSimulation';

function AppContent() {
  const location = useLocation();
  const isFullScreenPage = location.pathname === '/live-feed' || location.pathname === '/route';

  return (
    <div className={`flex flex-col ${isFullScreenPage ? 'h-screen overflow-hidden' : 'min-h-screen'} bg-slate-950 text-slate-200 font-sans selection:bg-blue-500 selection:text-white`}>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/live-feed" element={<LiveFeed />} />
        <Route path="/route" element={<RoutePlanner />} />
        <Route path="/text-analysis" element={<TextAnalysis />} />
        <Route path="/drone-simulation" element={<DroneSimulation />} />
      </Routes>
      {!isFullScreenPage && <Footer />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
