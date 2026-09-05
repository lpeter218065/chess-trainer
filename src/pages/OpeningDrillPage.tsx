import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import type { Color } from '../lessons/schema';
import { drillToLesson, openingDrillById, type DrillStartMode, type OpeningDrill } from '../lessons/openingDrills';
import { CUSTOM_DRILL_ID, CUSTOM_DRILL_STUB, generateCustomDrill } from '../lessons/customDrill';
import { OPENING_OPPONENTS, openingOpponentById, type DifficultyId } from '../engine/difficulty';
import { bootLessonSession } from '../store/sessionInstance';
import type { SessionState } from '../store/session';
import { useGameSessions } from '../store/gameSessions';
import { settingsLlmPort } from '../llm/port';
import { useSettings } from '../store/settings';
import { LessonView } from './LessonPage';
import { LoadingScreen } from '../components/LoadingScreen';

type Phase = 'setup' | 'play';

function sessionLabel(title: string, color: Color, startMode: DrillStartMode, oppLabel: string): string {
  const side = color === 'w' ? '执白' : '执黑';
  const start = startMode === 'from-start' ? '起始局面' : '定式局面';
  return `${title} · ${side} · ${start} · ${oppLabel}`;
}

export function OpeningDrillPage() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  if (!drill) {
    return (
      <div className="p-8 text-sm text-ink">
        找不到该开局练习。
        <button type="button" className="ml-2 cursor-pointer text-felt underline" onClick={() => navigate('/')}>返回</button>
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
      gs.newLesson(lesson.id, sessionLabel(ready.title, color, startMode, difficulty.label));
      const s = await bootLessonSession(lesson, difficulty);
      await s.getState().start(lesson, difficulty);
      const snap = s.getState().exportSnapshot();
      if (snap && gs.activeLessonId) {
        gs.saveLessonSnapshot(
          gs.activeLessonId,
          snap,
          sessionLabel(ready.title, color, startMode, difficulty.label),
        );
      }
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
      `min-h-11 cursor-pointer rounded-xl border px-3 py-2.5 text-left text-sm transition duration-200 ${
        on ? 'border-felt bg-felt-fg text-ink shadow-[inset_0_0_0_1px_rgba(30,77,56,0.12)]' : 'border-line bg-white text-ink hover:border-wood/35'
      }`;
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-3 text-sm">
          <Link to="/" className="inline-flex min-h-11 cursor-pointer items-center text-felt underline-offset-4 hover:underline">← 返回</Link>
          <span className="text-muted">开局练习</span>
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{drill.title}</h1>
        <p className="mt-2 text-sm text-muted">{drill.summary}</p>
        <p className="mt-3 text-sm leading-relaxed text-ink/80">{drill.theme}</p>

        {isCustom && (
          <section className="mt-8">
            <label htmlFor="drill-requirement" className="mb-2 block text-sm font-semibold text-ink">对手怎么走</label>
            <textarea
              id="drill-requirement"
              className="h-28 w-full resize-none rounded-xl border border-line bg-white p-3 text-sm leading-relaxed text-ink outline-none transition duration-200 focus:border-felt"
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
                    requirement === chip ? 'border-felt bg-felt text-felt-fg' : 'border-line bg-white text-muted hover:border-felt/40 hover:text-ink'
                  }`}
                  onClick={() => { setRequirement(chip); setStartError(null); }}
                >
                  {chip}
                </button>
              ))}
            </div>
            {!hasKey && <p className="mt-3 text-sm text-danger">自定义开局需要 API Key，请先回首页打开设置。</p>}
            {startError && <p className="mt-3 text-sm text-danger" role="alert">{startError}</p>}
          </section>
        )}

        {!isCustom && startError && <p className="mt-4 text-sm text-danger" role="alert">{startError}</p>}

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

        <div className="sticky bottom-0 -mx-4 mt-8 border-t border-line bg-paper/95 px-4 py-3 shadow-[0_-8px_20px_rgba(28,25,23,0.06)] backdrop-blur sm:-mx-6 sm:px-6">
          <button
            type="button"
            className="btn btn-primary min-h-12 w-full rounded-xl"
            disabled={busy || (isCustom && !requirement.trim())}
            onClick={() => void start()}
          >
            {busy ? (isCustom ? '正在生成对手开局书…' : '正在准备对局…') : '开始练习'}
          </button>
        </div>
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
      onBack={() => {
        setPhase('setup');
        setStore(null);
      }}
    />
  );
}
