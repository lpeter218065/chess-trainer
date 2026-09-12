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

type Phase = 'setup' | 'play';

function sessionLabel(title: string, color: Color, startMode: DrillStartMode, oppLabel: string): string {
  const side = color === 'w' ? '执白' : '执黑';
  const start = startMode === 'from-start' ? '起始局面' : '定式局面';
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
  const drill: OpeningDrill | undefined = isCustom ? CUSTOM_DRILL_STUB : catalogDrill;

  const [phase, setPhase] = useState<Phase>('setup');
  const [color, setColor] = useState<Color>('w');
  const [startMode, setStartMode] = useState<DrillStartMode>('from-start');
  const [oppId, setOppId] = useState<DifficultyId>('easy');
  const [requirement, setRequirement] = useState('');
  const [playDrill, setPlayDrill] = useState<OpeningDrill | null>(null);
  const [store, setStore] = useState<StoreApi<SessionState> | null>(null);
  const [status, setStatus] = useState('正在加载引擎…');
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
      if (!meta || !parsed || parsed.drillId !== rawId) { setStartError('该练习会话无法恢复'); return; }
      const source = parsed.drillId === CUSTOM_DRILL_ID ? meta.drill : openingDrillById(parsed.drillId);
      if (!source) { setStartError('该练习的开局书已丢失，无法恢复'); return; }
      setBusy(true);
      setStatus('正在恢复练习…');
      try {
        const lesson = drillToLesson(source, parsed.color, parsed.startMode);
        await gs.loadSnapshot(sessionParam);
        const snap = gs.getLessonSnapshot(sessionParam);
        const difficulty = openingOpponentById(snap?.difficultyId ?? oppId);
        gs.setActiveLesson(sessionParam);
        setColor(parsed.color);
        setStartMode(parsed.startMode);
        setOppId(difficulty.id);
        setPlayDrill(source);
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
        <p className="mt-3">找不到该开局练习。</p>
      </div>
    );
  }

  const start = async () => {
    setStartError(null);
    setBusy(true);
    setStatus(isCustom ? '正在按你的要求生成对手开局书…' : '正在准备对局…');
    try {
      let ready = drill;
      if (isCustom) {
        if (!hasKey) throw new Error('请先在设置中配置 API Key');
        ready = await generateCustomDrill(requirement, color, settingsLlmPort);
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
        sessionLabel(ready.title, color, startMode, difficulty.label),
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
      `min-h-11 cursor-pointer rounded-xl border px-3 py-2.5 text-left text-sm ${
        on ? 'border-walnut bg-cream text-ink' : 'border-line bg-ivory text-ink'
      }`;
    return (
      <div className="page-shell mx-auto w-full max-w-xl">
        <div className="mb-5 flex items-center gap-3 text-sm">
          <NavBack to={originPath(origin)}>{originLabel(origin)}</NavBack>
          <span className="text-muted">开局练习</span>
        </div>
        <h1 className="page-title">{drill.title}</h1>
        <p className="mt-2 text-sm text-muted">{drill.summary}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink/80">{drill.theme}</p>

        {isCustom && (
          <section className="mt-8">
            <label htmlFor="drill-requirement" className="mb-2 block text-sm font-semibold text-ink">对手怎么走</label>
            <textarea
              id="drill-requirement"
              className="field h-28 w-full resize-none p-3 text-sm leading-relaxed"
              placeholder="例如：伦敦应对西西里；对手走西班牙交换变例；黑棋走纳杰多夫"
              value={requirement}
              disabled={busy}
              onChange={(e) => { setRequirement(e.target.value); setStartError(null); }}
            />
            <p className="mt-1.5 text-xs text-muted">写开局名、变例，或「我走伦敦、对手走西西里」。</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {['伦敦应对西西里', '西班牙交换变例', '对手走纳杰多夫', '法兰西挺进变例'].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  className={`min-h-11 cursor-pointer rounded-full border px-3 text-sm transition duration-200 ${
                    requirement === chip ? 'border-walnut bg-walnut text-walnut-fg' : 'border-line bg-ivory text-muted'
                  }`}
                  onClick={() => { setRequirement(chip); setStartError(null); }}
                >
                  {chip}
                </button>
              ))}
            </div>
            {!hasKey && (
              <div className="mt-3 flex flex-col items-start gap-2">
                <p className="text-sm text-danger">自定义开局需要 API Key。</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setSettingsOpen(true)}>
                  去配置 Key
                </button>
              </div>
            )}
          </section>
        )}

        {startError && <p className="mt-4 text-sm text-danger" role="alert">{startError}</p>}

        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-ink">执棋方</h2>
          <div className="flex gap-2">
            {([
              ['w', '执白'],
              ['b', '执黑'],
            ] as const).map(([c, label]) => (
              <button
                key={c}
                type="button"
                className={`min-w-0 flex-1 ${selectCls(color === c)}`}
                onClick={() => setColor(c)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-ink">起步方式</h2>
          <div className="flex flex-col gap-2">
            {([
              ['from-start', '从起始局面', '空棋盘开局；对手按该开局体系行棋（执黑时先走白方第一步）'],
              ['tabiya', '对手先走出该开局前几步', '进入该开局的定式局面后再轮到你'],
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
          <h2 className="mb-2 text-sm font-semibold text-ink">对手强度</h2>
          <div className="flex gap-2">
            {OPENING_OPPONENTS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`min-w-0 flex-1 ${selectCls(oppId === o.id)}`}
                onClick={() => setOppId(o.id)}
              >
                <span className="font-medium">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted">
                  {o.id === 'easy' ? '会出软着，练习抓机会' : '接近正确续着，对抗压力'}
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
            {busy ? (isCustom ? '正在生成对手开局书…' : '正在准备对局…') : '开始练习'}
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
      difficultyLabel="对手"
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
              sessionLabel(active.title, color, startMode, openingOpponentById(did).label),
            );
          }
        });
      }}
      backLabel={origin === 'analyses' ? '我的分析' : active.title}
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
