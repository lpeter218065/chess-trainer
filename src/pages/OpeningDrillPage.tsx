import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import type { Color } from '../lessons/schema';
import { openingDrillById, type DrillStartMode, type OpeningDrill } from '../lessons/openingDrills';
import { drillToLesson } from '../lessons/drillLesson';
import { parseDrillLessonId } from '../lessons/openingDrills';
import { CUSTOM_DRILL_ID, CUSTOM_DRILL_STUB, generateCustomDrill } from '../lessons/customDrill';
import { OPENING_OPPONENTS, openingOpponentById, type DifficultyId } from '../engine/difficulty';
import { bootLessonSession } from '../store/sessionInstance';
import type { SessionState } from '../store/session';
import { useGameSessions } from '../store/gameSessions';
import { settingsLlmPort } from '../llm/port';
import { useSettings } from '../store/settings';
import { LessonView } from './LessonPage';
import { LoadingScreen } from '../components/LoadingScreen';
import { NavBack } from '../components/layout/NavBack';
import { originFromState, originLabel, originPath } from '../components/layout/navOrigin';
import { SettingsDialog } from '../components/SettingsDialog';
import { localizeContent, useLocale, useT } from '../i18n';

type Phase = 'setup' | 'play';

function sessionLabel(
  title: string,
  color: Color,
  startMode: DrillStartMode,
  oppLabel: string,
  t: ReturnType<typeof useT>,
): string {
  const side = color === 'w' ? t('drill.white') : t('drill.black');
  const start = startMode === 'from-start' ? t('drill.startPos') : t('drill.tabiyaPos');
  return `${title} · ${side} · ${start} · ${oppLabel}`;
}

export function OpeningDrillPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const origin = originFromState(location.state);
  const rawId = decodeURIComponent(id ?? '');
  const isCustom = rawId === CUSTOM_DRILL_ID;
  const catalogDrill = openingDrillById(rawId);
  const locale = useLocale();
  const t = useT();
  const source: OpeningDrill | undefined = isCustom ? CUSTOM_DRILL_STUB : catalogDrill;
  const drill = source ? localizeContent(source, locale) : source;

  const [phase, setPhase] = useState<Phase>('setup');
  const [color, setColor] = useState<Color>('w');
  const [startMode, setStartMode] = useState<DrillStartMode>('from-start');
  const [oppId, setOppId] = useState<DifficultyId>('easy');
  const [requirement, setRequirement] = useState('');
  const [playDrill, setPlayDrill] = useState<OpeningDrill | null>(null);
  const [store, setStore] = useState<StoreApi<SessionState> | null>(null);
  const [status, setStatus] = useState(() => t('explore.loadingEngine'));
  const [startError, setStartError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expectedLessonId, setExpectedLessonId] = useState('');
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionParam = searchParams.get('session');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setPhase('setup');
    setStore(null);
    setPlayDrill(null);
    setColor('w');
    setStartMode('from-start');
    setOppId('easy');
    setRequirement('');
    setStartError(null);
    setBusy(false);
  }, [rawId]);

  // 从「我的分析」恢复某次练习会话：?session=<id>
  useEffect(() => {
    if (!sessionParam) return;
    let cancelled = false;
    (async () => {
      const gs = useGameSessions.getState();
      const meta = gs.metas[sessionParam];
      const parsed = meta?.kind === 'lesson' && meta.lessonId ? parseDrillLessonId(meta.lessonId) : null;
      if (!meta || !parsed || parsed.drillId !== rawId) { setStartError(t('drill.restoreFail')); return; }
      const restored = parsed.drillId === CUSTOM_DRILL_ID ? meta.drill : openingDrillById(parsed.drillId);
      if (!restored) { setStartError(t('drill.bookLost')); return; }
      setBusy(true);
      setStatus(t('drill.restoring'));
      try {
        const lesson = drillToLesson(restored, parsed.color, parsed.startMode);
        await gs.loadSnapshot(sessionParam);
        const snap = gs.getLessonSnapshot(sessionParam);
        const difficulty = openingOpponentById(snap?.difficultyId ?? oppId);
        gs.setActiveLesson(sessionParam);
        setColor(parsed.color);
        setStartMode(parsed.startMode);
        setOppId(difficulty.id);
        setPlayDrill(restored);
        setExpectedLessonId(lesson.id);
        const s = await bootLessonSession(lesson, difficulty);
        if (cancelled) return;
        setStore(s);
        setPhase('play');
        setSearchParams({}, { replace: true });
      } catch (e) {
        if (!cancelled) setStartError(String(e).replace(/^Error:\s*/, ''));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionParam, rawId]);

  if (!drill) {
    return (
      <div className="page-shell text-sm text-ink">
        <NavBack onClick={() => navigate(originPath(origin))}>{originLabel(origin)}</NavBack>
        <p className="mt-3">{t('drill.missing')}</p>
      </div>
    );
  }

  const start = async () => {
    setStartError(null);
    setBusy(true);
    setStatus(isCustom ? t('drill.generating') : t('drill.preparing'));
    try {
      let ready = drill;
      if (isCustom) {
        if (!hasKey) throw new Error(t('drill.needKey'));
        ready = localizeContent(await generateCustomDrill(requirement, color, settingsLlmPort), locale);
      }
      setPlayDrill(ready);
      setPhase('play');
      setStore(null);
      const lesson = drillToLesson(ready, color, startMode);
      const difficulty = openingOpponentById(oppId);
      setExpectedLessonId(lesson.id);
      const gs = useGameSessions.getState();
      gs.newLesson(
        lesson.id,
        sessionLabel(ready.title, color, startMode, t(difficulty.id === 'hard' ? 'difficulty.oppHard' : 'difficulty.oppEasy'), t),
        isCustom ? { drill: ready } : undefined,
      );
      const s = await bootLessonSession(lesson, difficulty);
      setStore(s);
    } catch (e) {
      setStartError(String(e).replace(/^Error:\s*/, ''));
      setPhase('setup');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'setup') {
    const selectCls = (on: boolean) =>
      `min-h-11 cursor-pointer rounded-xl border px-3 py-2.5 text-left text-sm transition-all duration-150 ${
        on ? 'border-walnut bg-cream text-ink font-medium shadow-xs' : 'border-line bg-ivory text-ink hover:border-walnut/30'
      }`;
    return (
      <div className="page-shell mx-auto w-full max-w-xl">
        <div className="mb-5 flex items-center gap-3 text-sm">
          <NavBack to={originPath(origin)}>{originLabel(origin)}</NavBack>
          <span className="text-muted">{t('home.drills')}</span>
        </div>
        <h1 className="page-title">{drill.title}</h1>
        <p className="mt-2 text-sm text-muted">{drill.summary}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink/80">{drill.theme}</p>

        {isCustom && (
          <section className="mt-8">
            <label htmlFor="drill-requirement" className="mb-2 block text-sm font-semibold text-ink">{t('drill.requirement')}</label>
            <textarea
              id="drill-requirement"
              className="field h-28 w-full resize-none p-3 text-sm leading-relaxed"
              placeholder={t('drill.placeholder')}
              value={requirement}
              disabled={busy}
              onChange={(e) => { setRequirement(e.target.value); setStartError(null); }}
            />
            <p className="mt-1.5 text-xs text-muted">{t('drill.hint')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                t('drill.chip.londonSicilian'),
                t('drill.chip.spanishEx'),
                t('drill.chip.najdorf'),
                t('drill.chip.french'),
              ] as const).map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`min-h-11 cursor-pointer rounded-full border px-3 text-sm transition-all duration-150 ${
                    requirement === chip ? 'border-walnut bg-walnut text-walnut-fg font-medium shadow-xs' : 'border-line bg-ivory text-muted hover:border-walnut/30 hover:text-ink'
                  }`}
                  onClick={() => { setRequirement(chip); setStartError(null); }}
                >
                  {chip}
                </button>
              ))}
            </div>
            {!hasKey && (
              <div className="mt-3 flex flex-col items-start gap-2">
                <p className="text-sm text-danger">{t('drill.needKeyCustom')}</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setSettingsOpen(true)}>
                  {t('missing.configure')}
                </button>
              </div>
            )}
          </section>
        )}

        {startError && <p className="mt-4 text-sm text-danger" role="alert">{startError}</p>}

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">{t('drill.side')}</h2>
          <div className="flex gap-2">
            {([
              ['w', t('drill.white')],
              ['b', t('drill.black')],
            ] as const).map(([c, label]) => (
              <button
                key={c}
                type="button"
                className={`min-w-0 flex-1 flex items-center justify-center gap-2 ${selectCls(color === c)}`}
                onClick={() => setColor(c)}
              >
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    c === 'w' ? 'bg-white border border-walnut' : 'bg-walnut'
                  }`}
                  aria-hidden="true"
                />
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">{t('drill.startMode')}</h2>
          <div className="flex flex-col gap-2">
            {([
              ['from-start', t('drill.fromStart'), t('drill.fromStartHint')],
              ['tabiya', t('drill.tabiya'), t('drill.tabiyaHint')],
            ] as const).map(([mode, label, hint]) => (
              <button
                key={mode}
                type="button"
                className={selectCls(startMode === mode)}
                onClick={() => setStartMode(mode)}
              >
                <span className="font-medium">{label}</span>
                <span className="mt-0.5 block text-xs text-muted">{hint}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">{t('drill.oppStrength')}</h2>
          <div className="flex gap-2">
            {OPENING_OPPONENTS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`min-w-0 flex-1 ${selectCls(oppId === o.id)}`}
                onClick={() => setOppId(o.id)}
              >
                <span className="font-medium">{t(o.id === 'hard' ? 'difficulty.oppHard' : 'difficulty.oppEasy')}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {o.id === 'easy' ? t('drill.oppEasyHint') : t('drill.oppHardHint')}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className="sticky-cta">
          <button
            type="button"
            className="btn btn-primary min-h-12 w-full"
            disabled={busy || (isCustom && !requirement.trim())}
            onClick={() => void start()}
          >
            {busy ? (isCustom ? t('drill.busyCustom') : t('drill.busy')) : t('drill.start')}
          </button>
        </div>
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      </div>
    );
  }

  if (!store) {
    return <LoadingScreen message={status} />;
  }

  const active = playDrill ?? drill;
  const lesson = drillToLesson(active, color, startMode);
  return (
    <LessonView
      store={store}
      lesson={lesson}
      expectedLessonId={expectedLessonId || lesson.id}
      difficultyId={oppId}
      difficultyOptions={OPENING_OPPONENTS}
      difficultyLabel={t('drill.opp')}
      onDifficulty={(did) => {
        setOppId(did);
        const next = drillToLesson(active, color, startMode);
        void store.getState().start(next, openingOpponentById(did)).then(() => {
          const snap = store.getState().exportSnapshot();
          const gs = useGameSessions.getState();
          if (snap && gs.activeLessonId) {
            gs.saveLessonSnapshot(
              gs.activeLessonId,
              snap,
              sessionLabel(active.title, color, startMode, t(did === 'hard' ? 'difficulty.oppHard' : 'difficulty.oppEasy'), t),
            );
          }
        });
      }}
      backLabel={origin === 'analyses' ? t('home.analyses') : localizeContent(active, locale).title}
      onBack={() => {
        if (origin === 'analyses') {
          navigate('/analyses');
          return;
        }
        setPhase('setup');
        setStore(null);
      }}
    />
  );
}
