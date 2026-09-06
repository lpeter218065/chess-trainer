import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { HydrationGate } from './components/HydrationGate';
import { LoadingScreen } from './components/LoadingScreen';
import { DebugOverlay } from './debug/DebugOverlay';

const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const AnalysesPage = lazy(() => import('./pages/AnalysesPage').then((m) => ({ default: m.AnalysesPage })));
const OpeningDrillPage = lazy(() =>
  import('./pages/OpeningDrillPage').then((m) => ({ default: m.OpeningDrillPage })),
);
const LicensesPage = lazy(() => import('./pages/LicensesPage').then((m) => ({ default: m.LicensesPage })));

export default function App() {
  return (
    <HashRouter>
      <HydrationGate>
        <Suspense fallback={<LoadingScreen message="正在加载…" />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analyses" element={<AnalysesPage />} />
            <Route path="/drill/:id" element={<OpeningDrillPage />} />
            <Route path="/lesson/:id" element={<LessonPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/licenses" element={<LicensesPage />} />
          </Routes>
        </Suspense>
      </HydrationGate>
      <DebugOverlay />
    </HashRouter>
  );
}
