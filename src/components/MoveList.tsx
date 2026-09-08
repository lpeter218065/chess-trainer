import { memo, useEffect, useRef, type ReactNode } from 'react';
import type { Quality } from '../chess/quality';
import { QUALITY_LABEL } from '../chess/quality';
import type { MoveNodeId, MoveTree } from '../chess/moveTree';
import { sideToMove } from '../chess/notation';

const QUALITY_CLASS: Record<Quality, string> = {
  best: 'text-emerald-700', good: 'text-green-600', inaccuracy: 'text-yellow-600', mistake: 'text-orange-600', blunder: 'text-red-600',
};

function MoveListImpl({
  history,
  startMoveNumber,
  blackFirst,
  selectedPly,
  onSelectPly,
  qualities,
}: {
  history: string[];
  startMoveNumber: number;
  blackFirst: boolean;
  selectedPly: number;
  onSelectPly: (ply: number) => void;
  qualities?: (Quality | null)[];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    const scroller = list?.parentElement;
    const selected = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!scroller || !selected || scroller.scrollWidth <= scroller.clientWidth) return;
    const item = selected.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (item.left < box.left) scroller.scrollLeft += item.left - box.left;
    else if (item.right > box.right) scroller.scrollLeft += item.right - box.right;
  }, [selectedPly]);

  const cells: { num: number; white?: { san: string; ply: number }; black?: { san: string; ply: number } }[] = [];
  let i = 0;
  let ply = 1;
  let num = startMoveNumber;
  if (blackFirst && history.length) {
    cells.push({ num, black: { san: history[0], ply: 1 } });
    i = 1;
    ply = 2;
    num++;
  }
  for (; i < history.length; i += 2, num++) {
    const white = { san: history[i], ply };
    ply++;
    const black = history[i + 1] !== undefined ? { san: history[i + 1], ply } : undefined;
    if (black) ply++;
    cells.push({ num, white, black });
  }

  const cell = (move: { san: string; ply: number } | undefined, placeholder: string) => {
    if (!move) return <span className="text-line">{placeholder}</span>;
    const selected = selectedPly === move.ply;
    const q = qualities?.[move.ply - 1];
    return (
      <button
        type="button"
        aria-current={selected ? 'step' : undefined}
        className={`touch-row min-h-8 rounded px-1.5 text-left ${selected ? 'bg-select' : 'hover:bg-cream/50'}`}
        onClick={() => onSelectPly(move.ply)}
      >
        {move.san}
        {q && <span className={`ml-1 text-[10px] ${QUALITY_CLASS[q]}`}>{QUALITY_LABEL[q]}</span>}
      </button>
    );
  };

  return (
    <div ref={listRef} className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-0.5 font-mono text-sm">
      {cells.map((c) => (
        <div key={c.num} className="contents">
          <span className="text-muted">{c.num}.</span>
          {cell(c.white, blackFirst && c.num === startMoveNumber ? '…' : '')}
          {cell(c.black, '')}
        </div>
      ))}
    </div>
  );
}

function depthOf(tree: MoveTree, id: MoveNodeId): number {
  let d = 0;
  let cur: MoveNodeId | null = id;
  while (cur) {
    d++;
    cur = tree.nodes[cur].parentId;
  }
  return d;
}

/** Ply depth → "1." / "1..." style label */
function moveNumberLabel(startFen: string, depth: number): string {
  const startNum = Number(startFen.split(' ')[5] ?? '1');
  const blackFirst = sideToMove(startFen) === 'b';
  const plyIndex = depth - 1;
  if (blackFirst) {
    if (plyIndex === 0) return `${startNum}...`;
    const after = plyIndex - 1;
    const fullMove = startNum + 1 + Math.floor(after / 2);
    return after % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
  }
  const fullMove = startNum + Math.floor(plyIndex / 2);
  return plyIndex % 2 === 0 ? `${fullMove}.` : `${fullMove}...`;
}

function isWhitePly(startFen: string, depth: number): boolean {
  return !moveNumberLabel(startFen, depth).endsWith('...');
}

function MoveButton({
  tree,
  id,
  selectedId,
  onSelect,
}: {
  tree: MoveTree;
  id: MoveNodeId;
  selectedId: MoveNodeId | null;
  onSelect: (id: MoveNodeId) => void;
}) {
  const node = tree.nodes[id];
  const q = node.quality;
  return (
    <button
      type="button"
      className={`touch-row min-h-8 rounded px-1 font-mono text-sm ${selectedId === id ? 'bg-select' : 'hover:bg-cream/50'}`}
      onClick={() => onSelect(id)}
    >
      {node.san}
      {q && <span className={`ml-0.5 text-[10px] ${QUALITY_CLASS[q]}`}>{QUALITY_LABEL[q]}</span>}
    </button>
  );
}

function VariationBranch({
  tree,
  nodeId,
  startFen,
  selectedId,
  onSelect,
  nest,
}: {
  tree: MoveTree;
  nodeId: MoveNodeId;
  startFen: string;
  selectedId: MoveNodeId | null;
  onSelect: (id: MoveNodeId) => void;
  nest: number;
}) {
  const parts: ReactNode[] = [];
  let id: MoveNodeId | undefined = nodeId;
  let first = true;
  while (id) {
    const depth = depthOf(tree, id);
    if (first || isWhitePly(startFen, depth)) {
      parts.push(
        <span key={`n-${id}`} className="text-muted">
          {moveNumberLabel(startFen, depth)}{' '}
        </span>,
      );
    }
    parts.push(<MoveButton key={id} tree={tree} id={id} selectedId={selectedId} onSelect={onSelect} />);
    parts.push(<span key={`sp-${id}`}> </span>);
    if (nest < 2) {
      const childVars = tree.nodes[id].children.slice(1);
      for (const vid of childVars) {
        parts.push(
          <span key={`vv-${vid}`} className="text-muted">
            {' '}(
            <VariationBranch
              tree={tree}
              nodeId={vid}
              startFen={startFen}
              selectedId={selectedId}
              onSelect={onSelect}
              nest={nest + 1}
            />
            )
          </span>,
        );
      }
    }
    id = tree.nodes[id].children[0];
    first = false;
  }
  return <>{parts}</>;
}

function MainLine({
  tree,
  startFen,
  selectedId,
  onSelect,
}: {
  tree: MoveTree;
  startFen: string;
  selectedId: MoveNodeId | null;
  onSelect: (id: MoveNodeId) => void;
}) {
  const parts: ReactNode[] = [];
  let id: MoveNodeId | undefined = tree.rootChildren[0];
  while (id) {
    const depth = depthOf(tree, id);
    if (isWhitePly(startFen, depth) || parts.length === 0) {
      parts.push(
        <span key={`n-${id}`} className="text-muted">
          {moveNumberLabel(startFen, depth)}{' '}
        </span>,
      );
    }
    parts.push(<MoveButton key={id} tree={tree} id={id} selectedId={selectedId} onSelect={onSelect} />);

    const parent = tree.nodes[id].parentId;
    const vars = (parent === null ? tree.rootChildren : tree.nodes[parent].children).filter((c) => c !== id);
    for (const vid of vars) {
      parts.push(
        <span key={`v-${vid}`} className="text-muted">
          {' '}(
          <VariationBranch
            tree={tree}
            nodeId={vid}
            startFen={startFen}
            selectedId={selectedId}
            onSelect={onSelect}
            nest={1}
          />
          )
        </span>,
      );
    }

    parts.push(<span key={`sp-${id}`}> </span>);
    id = tree.nodes[id].children[0];
  }
  return <>{parts}</>;
}

function VariationMoveListImpl({
  tree,
  startFen,
  selectedNodeId,
  onSelectNode,
}: {
  tree: MoveTree;
  startFen: string;
  selectedNodeId: MoveNodeId | null;
  onSelectNode: (id: MoveNodeId) => void;
}) {
  if (tree.rootChildren.length === 0) {
    return <p className="text-sm text-muted">尚无着法</p>;
  }
  return (
    <div className="flex flex-wrap items-baseline gap-y-1 font-mono text-sm leading-relaxed">
      <MainLine tree={tree} startFen={startFen} selectedId={selectedNodeId} onSelect={onSelectNode} />
    </div>
  );
}

export const MoveList = memo(MoveListImpl);
export const VariationMoveList = memo(VariationMoveListImpl);
