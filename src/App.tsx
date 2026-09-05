import { HashRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';
import { ExplorePage } from './pages/ExplorePage';
import { AnalysesPage } from './pages/AnalysesPage';
import { OpeningDrillPage } from './pages/OpeningDrillPage';
import { LicensesPage } from './pages/LicensesPage';
import { HydrationGate } from './components/HydrationGate';

export default function App() {
  return (
    <HashRouter>
      <HydrationGate>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyses" element={<AnalysesPage />} />
          <Route path="/drill/:id" element={<OpeningDrillPage />} />
          <Route path="/lesson/:id" element={<LessonPage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/licenses" element={<LicensesPage />} />
        </Routes>
      </HydrationGate>
    </HashRouter>
  );
}
