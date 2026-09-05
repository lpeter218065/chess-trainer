import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { lessonsBySection } from '../lessons';
import { OPENING_DRILLS } from '../lessons/openingDrills';
import { SECTION_LABEL, type Section } from '../lessons/schema';
import { useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { useGameSessions } from '../store/gameSessions';
import { LessonCard } from '../components/LessonCard';
import { SettingsDialog } from '../components/SettingsDialog';
import { getEngine } from '../engine/getEngine';

const SECTIONS: Section[] = ['opening', 'middlegame', 'endgame'];

export function HomePage() {
  const records = useProgress((s) => s.records);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const metas = useGameSessions((s) => s.metas);
  const sessionCount = useMemo(() => Object.keys(metas).length, [metas]);
  const [open, setOpen] = useState(false);
  // 空闲时预热引擎 Worker/WASM，进课程页时 getEngine() 直接复用同一个单例 Promise
  useEffect(() => {
    const warm = () => { void getEngine().catch(() => undefined); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm);
    else setTimeout(warm, 0);
  }, []);
  return (
    <div
      className="mx-auto max-w-6xl px-4 py-8 sm:px-6"
      style={{
        paddingTop: 'max(2rem, env(safe-area-inset-top))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
        paddingBottom: 'max(2rem, env(safe-area-inset-bottom))',
      }}
    >
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-[0.16em] text-felt uppercase">Chess study</p>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight text-ink">国际象棋训练</h1>
          <p className="mt-2 w-full max-w-xl text-sm leading-relaxed text-pretty text-muted">对着引擎练开局与课题。讲解和判断都贴着当前局面。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/analyses" className="btn text-sm">
            我的分析{sessionCount > 0 ? ` (${sessionCount})` : ''}
          </Link>
          <Link to="/explore" className="btn btn-primary text-sm">
            自由探索
          </Link>
          <button
            type="button"
            className="btn text-sm"
            onClick={() => setOpen(true)}
          >
            {hasKey ? '设置' : '设置 · 未配置 Key'}
          </button>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-xl font-semibold text-ink">开局练习</h2>
        <p className="mt-1 mb-4 text-sm text-muted">选开局，或自己写对手该走的变例。执白/执黑都可以练。</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OPENING_DRILLS.map((d) => (
            <Link
              key={d.id}
              to={`/drill/${encodeURIComponent(d.id)}`}
              className="block cursor-pointer rounded-xl border border-line bg-white p-4 shadow-[0_1px_0_rgba(28,25,23,0.04)] transition duration-200 hover:-translate-y-0.5 hover:border-felt/30 hover:shadow-sm"
            >
              <h3 className="font-medium text-ink">{d.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d.summary}</p>
            </Link>
          ))}
          <Link
            to="/drill/custom"
            className="block cursor-pointer rounded-xl border border-dashed border-felt/35 bg-felt-fg/60 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-felt"
          >
            <p className="text-[11px] font-medium tracking-wide text-felt uppercase">自定义</p>
            <h3 className="mt-0.5 font-medium text-ink">按要求练习</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">写对手开局或变例，例如「伦敦应对西西里」</p>
          </Link>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-3">
        {SECTIONS.map((sec) => (
          <section key={sec}>
            <h2 className="font-display mb-3 text-xl font-semibold text-ink">{SECTION_LABEL[sec]}</h2>
            <div className="flex flex-col gap-2.5">
              {lessonsBySection(sec).map((l) => <LessonCard key={l.id} lesson={l} record={records[l.id]} />)}
            </div>
          </section>
        ))}
      </div>
      <footer className="mt-12 border-t border-line pt-4 text-sm text-muted">
        <Link to="/licenses" className="text-felt underline-offset-4 hover:underline">开源许可</Link>
      </footer>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
