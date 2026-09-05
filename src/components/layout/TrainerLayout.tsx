import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
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
  /** compact/medium 分段时，只在该 panel 激活时显示 footer */
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
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className={`btn btn-sm ${t.id === active ? 'btn-on' : 'btn-ghost'}`}
          onClick={() => onSelect(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function FooterSlot({ children, compact }: { children: ReactNode; compact: boolean }) {
  return (
    <div
      className="sticky bottom-0 z-10 border-t border-line bg-paper/95 backdrop-blur"
      style={{
        paddingBottom: compact ? 'max(0.5rem, env(safe-area-inset-bottom))' : undefined,
      }}
    >
      {children}
    </div>
  );
}

function boardWrapStyle(klass: ViewportClass, width: number, height: number, hasLeft: boolean): CSSProperties | undefined {
  if (klass === 'compact') {
    const availableHeight = Math.max(240, height - 72);
    const side = Math.max(160, Math.min(width, availableHeight - 240));
    return { width: side, maxWidth: '100%', marginInline: 'auto' };
  }
  if (klass === 'medium' && !hasLeft) {
    const side = Math.min(width * 0.6, height * 0.55);
    return { width: side, maxWidth: '100%', marginInline: 'auto' };
  }
  return undefined;
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

  const tabs = useMemo(() => {
    if (klass === 'compact' && hasLeft) {
      return [{ id: LEFT_TAB, label: '候选', content: leftPanel }, ...panels];
    }
    return panels;
  }, [klass, hasLeft, leftPanel, panels]);

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
  const boardStyle = boardWrapStyle(klass, width, height, hasLeft);
  const footerVisible = Boolean(footer) && (klass === 'wide' || !footerPanelId || active?.id === footerPanelId);

  const shell: CSSProperties = {
    paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
    paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
    paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
    paddingBottom: klass === 'compact' ? 0 : 'max(0.75rem, env(safe-area-inset-bottom))',
  };

  return (
    <div
      className="box-border flex h-dvh max-h-dvh flex-col overflow-hidden"
      style={shell}
      data-vp={klass}
    >
      <div className="mb-2 shrink-0">{header}</div>

      {klass === 'wide' && (
        <div
          className={`mx-auto grid w-full max-w-7xl min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-3 ${
            hasLeft
              ? 'grid-cols-[minmax(200px,0.9fr)_minmax(260px,1.1fr)_minmax(260px,1fr)]'
              : 'grid-cols-[minmax(260px,1.1fr)_minmax(260px,1fr)]'
          }`}
        >
          {hasLeft && (
            <aside className="panel min-h-0 overflow-hidden p-2">{leftPanel}</aside>
          )}
          <main className="min-h-0 self-stretch overflow-hidden">{board}</main>
          <aside className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {panels.map((p, i) => (
                <div
                  key={p.id}
                  className={i === 0 ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' : 'min-h-0 shrink-0 overflow-y-auto'}
                >
                  {p.content}
                </div>
              ))}
            </div>
            {footerVisible && <FooterSlot compact={false}>{footer}</FooterSlot>}
          </aside>
        </div>
      )}

      {klass === 'medium' && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex min-h-0 flex-[1.2] items-stretch justify-center gap-2 overflow-hidden">
            {hasLeft ? (
              <>
                <div className="flex h-full min-h-0 w-[55%] min-w-0 flex-col overflow-hidden">{board}</div>
                <aside className="panel h-full min-h-0 min-w-0 flex-1 overflow-hidden p-2">{leftPanel}</aside>
              </>
            ) : (
              <div className="flex h-full min-h-0 w-full max-w-[60%] flex-col overflow-hidden" style={boardStyle}>{board}</div>
            )}
          </div>
          <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
            <Segmented tabs={tabs} active={active?.id ?? ''} onSelect={selectSegment} />
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{active?.content}</div>
            {footerVisible && <FooterSlot compact={false}>{footer}</FooterSlot>}
          </div>
        </div>
      )}

      {klass === 'compact' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-[1.2] flex-col overflow-hidden" style={boardStyle}>{board}</div>
          <div className="panel mt-2 flex min-h-[10rem] flex-1 flex-col overflow-hidden">
            <Segmented tabs={tabs} active={active?.id ?? ''} onSelect={selectSegment} />
            <div className="min-h-0 flex-1 overflow-y-auto p-3">{active?.content}</div>
          </div>
          {footerVisible && <FooterSlot compact>{footer}</FooterSlot>}
        </div>
      )}
    </div>
  );
}
