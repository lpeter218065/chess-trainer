import { useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useViewportSize, type ViewportClass } from '../../platform';

const LEFT_TAB = '__left';
const STORAGE_PREFIX = 'trainer-segment:';

export interface TrainerPanel {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TrainerLayoutProps {
  header: ReactNode;
  board: ReactNode;
  leftPanel?: ReactNode;
  panels: TrainerPanel[];
  footer?: ReactNode;
  /** 只在该 panel 激活时显示 footer */
  footerPanelId?: string;
  storageKey: string;
}

function readStored(key: string, valid: string[], fallback: string): string {
  if (typeof sessionStorage === 'undefined') return fallback;
  try {
    const saved = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (saved && valid.includes(saved)) return saved;
  } catch {
    /* private mode */
  }
  return fallback;
}

function writeStored(key: string, id: string) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, id);
  } catch {
    /* private mode */
  }
}

function Segmented({
  tabs,
  active,
  onSelect,
  id,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
  id: string;
}) {
  return (
    <div className="trainer-tabs flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2" role="tablist" aria-label="训练面板">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`${id}-tab-${t.id}`}
          aria-controls={`${id}-panel-${t.id}`}
          aria-selected={t.id === active}
          tabIndex={t.id === active ? 0 : -1}
          className={`btn btn-sm ${t.id === active ? 'btn-on' : 'btn-ghost'}`}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => {
            const index = tabs.findIndex((tab) => tab.id === t.id);
            const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length
              : e.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
                : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
            if (next < 0) return;
            e.preventDefault();
            e.stopPropagation();
            onSelect(tabs[next].id);
            document.getElementById(`${id}-tab-${tabs[next].id}`)?.focus();
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FooterSlot({ children }: { children: ReactNode }) {
  return (
    <div
      className="shrink-0 border-t border-line bg-paper"
    >
      {children}
    </div>
  );
}

export function trainerLayoutMode(width: number, height: number): 'stacked' | 'split' | 'wide' {
  if (width >= 1024 && height >= 600 && (width >= height || width >= 1180)) return 'wide';
  if (width >= 700 && width > height) return 'split';
  return 'stacked';
}

export function boardSidePx(
  klass: ViewportClass,
  width: number,
  height: number,
  hasLeft: boolean,
  reservedBelowPx: number,
): number {
  if (klass === 'compact') {
    if (hasLeft) return 0;
    return Math.max(200, Math.min(width, height - reservedBelowPx));
  }
  if (klass === 'medium' && !hasLeft) {
    return Math.min(width * 0.6, height * 0.55);
  }
  return 0;
}

function boardWrapStyle(
  klass: ViewportClass,
  width: number,
  height: number,
  hasLeft: boolean,
  reservedBelowPx: number,
): CSSProperties | undefined {
  const side = boardSidePx(klass, width, height, hasLeft, reservedBelowPx);
  if (side <= 0) return undefined;
  return { width: side, maxWidth: '100%', marginInline: 'auto' };
}

export function TrainerLayout({
  header,
  board,
  leftPanel,
  panels,
  footer,
  footerPanelId,
  storageKey,
}: TrainerLayoutProps) {
  const { width, height, klass } = useViewportSize();
  const hasLeft = leftPanel != null;
  const mode = trainerLayoutMode(width, height);
  const tabId = useId();

  const tabs = useMemo(() => {
    if (mode !== 'wide' && hasLeft) {
      return [{ id: LEFT_TAB, label: '候选', content: leftPanel }, ...panels];
    }
    return panels;
  }, [mode, hasLeft, leftPanel, panels]);

  const validIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const validKey = validIds.join(',');
  const fallback = validIds[0] ?? '';
  const [segment, setSegment] = useState(() => readStored(storageKey, validIds, fallback));

  useEffect(() => {
    setSegment(readStored(storageKey, validKey.split(','), fallback));
  }, [validKey, fallback, storageKey]);

  const selectSegment = (id: string) => {
    setSegment(id);
    writeStored(storageKey, id);
  };

  const active = tabs.find((t) => t.id === segment) ?? tabs[0];
  const reservedBelowPx = klass === 'compact' ? 168 : 0;
  const boardStyle = mode === 'stacked' && klass === 'compact'
    ? boardWrapStyle(klass, width, height, hasLeft, reservedBelowPx)
    : undefined;
  const footerVisible = Boolean(footer) && (!footerPanelId || active?.id === footerPanelId);

  const shell: CSSProperties = {
    '--board-row-max': `${width + 64}px`,
    paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
    paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
    paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
    paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
  } as CSSProperties;

  return (
    <div
      className="trainer-shell box-border flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden"
      style={shell}
      data-vp={klass}
      data-layout={mode}
    >
      <div className="trainer-header mb-2 min-w-0 shrink-0">{header}</div>
      <div className="trainer-workspace" data-candidates={hasLeft}>
        {mode === 'wide' && hasLeft && (
          <aside className="trainer-candidates panel min-h-0 min-w-0 overflow-hidden p-2">{leftPanel}</aside>
        )}
        <main className="trainer-board min-h-0 min-w-0 overflow-hidden" style={boardStyle}>{board}</main>
        <aside className="trainer-detail panel flex min-h-0 min-w-0 flex-col overflow-hidden">
          <Segmented id={tabId} tabs={tabs} active={active?.id ?? ''} onSelect={selectSegment} />
          <div className="trainer-panel-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
            {tabs.map((panel) => (
              <div
                key={panel.id}
                id={`${tabId}-panel-${panel.id}`}
                role="tabpanel"
                aria-labelledby={`${tabId}-tab-${panel.id}`}
                hidden={panel.id !== active?.id}
                className="trainer-panel min-h-0 min-w-0 flex-1 overflow-y-auto"
                tabIndex={0}
              >
                {/* Candidate playback must stop while its tab is hidden. */}
                {(panel.id !== LEFT_TAB || panel.id === active?.id) && panel.content}
              </div>
            ))}
            {footer && (
              <div className="shrink-0" hidden={!footerVisible}>
                <FooterSlot>{footer}</FooterSlot>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
