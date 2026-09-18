import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { HydrationGate } from './components/HydrationGate';
import { LoadingScreen } from './components/LoadingScreen';
import { DebugOverlay } from './debug/DebugOverlay';
import { htmlLang, t, useLocale } from './i18n';
import { isNative } from './platform';
import { parseAppRoute } from './platform/appRoute';

const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const AnalysesPage = lazy(() => import('./pages/AnalysesPage').then((m) => ({ default: m.AnalysesPage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const OpeningDrillPage = lazy(() =>
  import('./pages/OpeningDrillPage').then((m) => ({ default: m.OpeningDrillPage })),
);
const LicensesPage = lazy(() => import('./pages/LicensesPage').then((m) => ({ default: m.LicensesPage })));
const CampaignMapPage = lazy(() => import('./pages/CampaignMapPage').then((m) => ({ default: m.CampaignMapPage })));
const CampaignGate = lazy(() => import('./pages/CampaignGate').then((m) => ({ default: m.CampaignGate })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function LocaleSync() {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.title = t(locale, 'app.name');
  }, [locale]);
  return null;
}

function NativeDeepLinkHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNative()) return;
    let removed = false;
    let handle: { remove: () => Promise<void> | void } | undefined;
    void import('@capacitor/app').then(({ App }) => {
      if (removed) return;
      void (async () => {
        try {
          const launch = await App.getLaunchUrl();
          if (removed) return;
          if (launch?.url) {
            const route = parseAppRoute(launch.url);
            if (route) navigate(route);
          }
        } catch {
          /* getLaunchUrl unavailable */
        }
        if (removed) return;
        const h = await App.addListener('appUrlOpen', ({ url }) => {
          const route = parseAppRoute(url);
          if (route) navigate(route);
        });
        if (removed) {
          void h.remove();
          return;
        }
        handle = h;
      })();
    });
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <HashRouter>
      <HydrationGate>
        <LocaleSync />
        <NativeDeepLinkHandler />
        <div className="ios-status-bar-blur" aria-hidden="true" />
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analyses" element={<AnalysesPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/drill/:id" element={<OpeningDrillPage />} />
            <Route path="/lesson/:id" element={<LessonPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/campaign" element={<CampaignMapPage />} />
            <Route path="/campaign/:id" element={<CampaignGate />} />
            <Route path="/licenses" element={<LicensesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      </HydrationGate>
      <DebugOverlay />
    </HashRouter>
  );
}
