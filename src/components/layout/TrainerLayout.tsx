import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import type { ViewportClass } from '../../platform';
import { useTrainerViewport } from '../../platform/trainerViewport';

const LEFT_TAB = '__left';
const STORAGE_PREFIX = 'trainer-segment:';

export interface TrainerPanel {
  id: string;
  label: string;
  content: ReactNode;
  /** 无 API Key 时把「讲解」降成次级，避免和「去配置 Key」抢主行动 */
  disabled?: boolean;
}

export type DetailSize = 'collapsed' | 'half' | 'expanded' | 'free';

export interface TrainerLayoutProps {
  header: ReactNode;
  board: ReactNode;
  leftPanel?: ReactNode;
  panels: TrainerPanel[];
  footer?: ReactNode;
  /** 只在该 panel 激活时显示 footer */
  footerPanelId?: string;
  storageKey: string;
  /** stacked 讲解区初始高度。half = 现有棋盘优先比例 */
  detailDefault?: 'collapsed' | 'half' | 'expanded';
  /** 折叠条上的附加操作（例如「去配置 Key」） */
  collapsedAction?: ReactNode;
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
  tabs: { id: string; label: string; disabled?: boolean }[];
  active: string;
  onSelect: (id: string) => void;
  id: string;
}) {
  return (
    <div className="trainer-tabs" role="tablist" aria-label="训练面板">
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${id}-tab-${t.id}`}
            aria-controls={`${id}-panel-${t.id}`}
            aria-selected={selected}
            aria-disabled={t.disabled || undefined}
            tabIndex={selected ? 0 : -1}
            className={`trainer-tab${selected && !t.disabled ? ' is-active' : ''}${t.disabled ? ' is-disabled' : ''}`}
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
        );
      })}
    </div>
  );
}

function FooterSlot({ children }: { children: ReactNode }) {
  return <div className="trainer-footer">{children}</div>;
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
  detailDefault = 'half',
  collapsedAction,
}: TrainerLayoutProps) {
  const { width, height, layoutHeight, offsetTop, keyboardOpen, klass } = useTrainerViewport();
  const hasLeft = leftPanel != null;
  const mode = trainerLayoutMode(width, layoutHeight);
  const tabId = useId();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean } | null>(null);
  const [detailMode, setDetailMode] = useState<DetailSize>(detailDefault);
  const [detailPx, setDetailPx] = useState<number | null>(null);
  const prevDetailDefault = useRef(detailDefault);
  useEffect(() => {
    if (prevDetailDefault.current === 'collapsed' && detailDefault === 'half') {
      setDetailMode('half');
      setDetailPx(null);
    }
    prevDetailDefault.current = detailDefault;
  }, [detailDefault]);

  const tabs = useMemo((): TrainerPanel[] => {
    if (mode !== 'wide' && hasLeft) {
      return [{ id: LEFT_TAB, label: '候选', content: leftPanel }, ...panels];
    }
    return panels;
  }, [mode, hasLeft, leftPanel, panels]);

  const validIds = useMemo(() => tabs.map((t) => t.id), [tabs]);
  const validKey = validIds.join(',');
  const fallback = useMemo(
    () => validIds.find((id) => id !== LEFT_TAB) ?? validIds[0] ?? '',
    [validIds],
  );
  const [segment, setSegment] = useState(() => readStored(storageKey, validIds, fallback));

  useEffect(() => {
    setSegment(readStored(storageKey, validKey.split(','), fallback));
  }, [validKey, fallback, storageKey]);

  const selectSegment = (id: string) => {
    setSegment(id);
    writeStored(storageKey, id);
    if (mode === 'stacked' && detailMode === 'collapsed') setDetailMode('half');
  };

  const active = tabs.find((t) => t.id === segment) ?? tabs[0];
  const detailCollapsed = mode === 'stacked' && detailMode === 'collapsed';
  const reservedBelowPx = klass === 'compact' ? (detailCollapsed ? 72 : 168) : 0;
  const boardStyle = mode === 'stacked' && klass === 'compact'
    ? boardWrapStyle(klass, width, height, hasLeft, reservedBelowPx)
    : undefined;
  const footerVisible = Boolean(footer) && !detailCollapsed && (
    !footerPanelId
    || active?.id === footerPanelId
    || active?.id === LEFT_TAB
  );

  const snapDetail = (heightPx: number, workspaceH: number) => {
    if (heightPx < 96) {
      setDetailMode('collapsed');
      setDetailPx(null);
      return;
    }
    if (heightPx < workspaceH * 0.55) {
      setDetailMode('half');
      setDetailPx(null);
      return;
    }
    setDetailMode('expanded');
    setDetailPx(null);
  };

  const onHandlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (mode !== 'stacked') return;
    const el = detailRef.current;
    if (!el) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: el.getBoundingClientRect().height, moved: false };
  };

  const onHandlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startY - e.clientY;
    if (!drag.moved && Math.abs(delta) < 8) return;
    drag.moved = true;
    const workspaceH = workspaceRef.current?.getBoundingClientRect().height ?? 600;
    const next = Math.round(drag.startH + delta);
    const min = 52;
    const max = Math.round(workspaceH * 0.78);
    setDetailMode('free');
    setDetailPx(Math.max(min, Math.min(max, next)));
  };

  const onHandlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (!drag.moved) {
      setDetailMode((cur) => (cur === 'collapsed' ? 'half' : 'collapsed'));
      setDetailPx(null);
      return;
    }
    const h = detailRef.current?.getBoundingClientRect().height ?? 0;
    const workspaceH = workspaceRef.current?.getBoundingClientRect().height ?? 600;
    snapDetail(h, workspaceH);
  };

  const shell: CSSProperties = {
    '--board-row-max': `${width + 64}px`,
    paddingTop: keyboardOpen ? '0.35rem' : 'max(0.5rem, env(safe-area-inset-top))',
    paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
    paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
    paddingBottom: keyboardOpen ? '0.25rem' : 'max(0.5rem, env(safe-area-inset-bottom))',
    ...(keyboardOpen ? { position: 'fixed', top: offsetTop, left: 0, right: 0, height, maxHeight: height, minHeight: 0 } : {}),
  } as CSSProperties;

  const detailStyle = mode === 'stacked' && (detailMode === 'free' || detailMode === 'expanded')
    ? { '--detail-h': detailMode === 'free' && detailPx != null ? `${detailPx}px` : '68%' } as CSSProperties
    : undefined;

  return (
    <div
      className="trainer-shell box-border flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden"
      style={shell}
      data-vp={klass}
      data-layout={mode}
      data-detail={mode === 'stacked' ? detailMode : undefined}
      data-keyboard={keyboardOpen}
    >
      <div className="trainer-header mb-1.5 min-w-0 shrink-0">{header}</div>
      <div ref={workspaceRef} className="trainer-workspace" data-candidates={hasLeft}>
        {mode === 'wide' && hasLeft && (
          <aside className="trainer-candidates panel min-h-0 min-w-0 overflow-hidden p-2">{leftPanel}</aside>
        )}
        <main className="trainer-board min-h-0 min-w-0 overflow-hidden" style={boardStyle}>{board}</main>
        <aside
          ref={detailRef}
          className="trainer-detail panel flex min-h-0 min-w-0 flex-col overflow-hidden"
          style={detailStyle}
        >
          {mode === 'stacked' && (
            <button
              type="button"
              className="detail-handle"
              aria-label={detailCollapsed ? '展开讲解区' : '折叠讲解区'}
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
            >
              <span className="sheet-handle" />
            </button>
          )}
          {(tabs.length > 1 || !tabs[0]?.disabled) && (
            <Segmented id={tabId} tabs={tabs} active={active?.id ?? ''} onSelect={selectSegment} />
          )}
          {detailCollapsed && collapsedAction}
          <div
            className="trainer-panel-scroll flex min-h-0 flex-1 flex-col overflow-y-auto"
            hidden={detailCollapsed}
          >
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
          </div>
          {footer && (
            <div className="shrink-0" hidden={!footerVisible} data-testid="trainer-footer">
              <FooterSlot>{footer}</FooterSlot>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
