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
import { AppMark } from '../components/layout/AppMark';
import { getEngine } from '../engine/getEngine';

const SECTIONS: Section[] = ['opening', 'middlegame', 'endgame'];

const BANNER_DISMISS_KEY = 'trainer-key-banner-dismissed';

export function HomePage() {
  const records = useProgress((s) => s.records);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const metas = useGameSessions((s) => s.metas);
  const sessionCount = useMemo(() => Object.keys(metas).length, [metas]);
  const [open, setOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const showKeyBanner = !hasKey && !bannerDismissed;
  const dismissBanner = () => {
    setBannerDismissed(true);
    try {
      sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
    } catch {
      /* private mode */
    }
  };
  // 空闲时预热引擎 Worker/WASM，进课程页时 getEngine() 直接复用同一个单例 Promise
  useEffect(() => {
    const warm = () => { void getEngine().catch(() => undefined); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm);
    else setTimeout(warm, 0);
  }, []);
  return (
    <div className="page-shell">
      <header className="mb-8 flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-3">
            <AppMark size={36} />
            <h1 className="page-title">国际象棋训练</h1>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-pretty text-muted">
            对着引擎练开局与课题。讲解和判断都贴着当前局面。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/explore" state={{ from: 'home' }} className="btn btn-primary text-sm">
            自由探索
          </Link>
          <Link to="/analyses" className="btn text-sm">
            我的分析{sessionCount > 0 ? ` (${sessionCount})` : ''}
          </Link>
          <button
            type="button"
            className="btn text-sm"
            onClick={() => setOpen(true)}
          >
            设置
          </button>
        </div>
        {showKeyBanner && (
          <div className="key-banner" role="status">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
              讲解需要 API Key，只存在本机。
            </p>
            <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={() => setOpen(true)}>
              去配置
            </button>
            <button type="button" className="btn btn-ghost btn-sm min-w-11 px-0 shrink-0" aria-label="关闭提示" onClick={dismissBanner}>
              ×
            </button>
          </div>
        )}
      </header>

      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-ink">开局练习</h2>
        <p className="mt-1 mb-4 text-sm text-muted">选开局，或自己写对手该走的变例。执白/执黑都可以练。</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {OPENING_DRILLS.map((d) => (
            <Link
              key={d.id}
              to={`/drill/${encodeURIComponent(d.id)}`}
              state={{ from: 'home' }}
              className="card-link"
            >
              <h3 className="font-medium text-ink">{d.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{d.summary}</p>
            </Link>
          ))}
          <Link
            to="/drill/custom"
            state={{ from: 'home' }}
            className="card-link border-dashed border-walnut/30"
          >
            <p className="text-xs font-medium text-walnut">自定义</p>
            <h3 className="mt-0.5 font-medium text-ink">按要求练习</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">写对手开局或变例，例如「伦敦应对西西里」</p>
          </Link>
        </div>
      </section>

      <div className="grid gap-8 md:grid-cols-3">
        {SECTIONS.map((sec) => (
          <section key={sec}>
            <h2 className="font-display mb-3 text-lg font-semibold text-ink">{SECTION_LABEL[sec]}</h2>
            <div className="flex flex-col gap-2.5">
              {lessonsBySection(sec).map((l) => <LessonCard key={l.id} lesson={l} record={records[l.id]} />)}
            </div>
          </section>
        ))}
      </div>
      <footer className="mt-12 border-t border-line pt-4 text-sm text-muted">
        <Link to="/licenses" className="text-walnut underline-offset-4 hover:underline">开源许可</Link>
      </footer>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
