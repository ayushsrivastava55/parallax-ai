import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import { Shell } from './components/layout/Shell';
import Dashboard from './pages/Dashboard';
import Bots from './pages/Bots';
import BotDetail from './pages/BotDetail';
import Strategies from './pages/Strategies';
import StrategyDetail from './pages/StrategyDetail';
import Skills from './pages/Skills';
import Health from './pages/Health';
import Chat from './pages/Chat';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Dashboard shell */}
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/bots/:agentId" element={<BotDetail />} />
          <Route path="/strategies" element={<Strategies />} />
          <Route path="/strategies/:strategyId" element={<StrategyDetail />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/health" element={<Health />} />
          <Route path="/chat" element={<Chat />} />
        </Route>
        {/* Legacy landing page */}
        <Route path="/landing" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
