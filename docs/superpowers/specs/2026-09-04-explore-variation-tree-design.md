# Explore Mode Variation Tree Design

## Goal

In free-explore mode, after navigating back along a line, the user can play a different move and continue analysis as a **side variation**, without discarding the original continuation. Engine analysis and LLM commentary still apply to the **current path** only.

## Non-goals (this round)

- Export PGN with nested variations
- Import PGN that contains variations (keep mainline-only import)
- Promote / delete / reorder variations
- Variation trees in lesson mode

## Current behavior

- State stores a flat `history: string[]` and `qualities`
- `makeMove` refuses when `!isLive()` (reviewing an earlier ply)
- Board is non-interactive while reviewing

## Proposed model

### Move tree

```ts
type MoveNodeId = string;

interface MoveNode {
  id: MoveNodeId;
  san: string;
  quality: Quality | null;
  children: MoveNodeId[]; // order = discovery order; first child = “main” continuation at this fork
}

interface ExploreTree {
  /** Virtual root before any move; children are first-ply alternatives */
  rootChildren: MoveNodeId[];
  nodes: Record<MoveNodeId, MoveNode>;
}
```

### Navigation state

- `path: MoveNodeId[]` — node ids from start to the tip of the **active line**
- `reviewDepth: number | null` — if `null`, viewing the tip (`path.length`); else viewing after `path.slice(0, reviewDepth)`
- Derived:
  - `viewedDepth()` = `reviewDepth ?? path.length`
  - `isLive()` = viewing the tip of the active path
  - Active SAN history = `path.map(id => nodes[id].san)` sliced to viewed depth for board/analysis

Id generation: short incremental or `crypto.randomUUID()`; tests can inject a counter.

### Branching rules

When the user plays a move at viewed depth `d` (from startFen after `path[0..d)`):

1. Resolve parent: if `d === 0`, parent is the virtual root (`rootChildren`); else parent is `path[d - 1]`.
2. Among that parent’s children, if a child with the same `san` exists → set `path` to `path.slice(0, d).concat(thatChild)` (reuse; do not duplicate).
3. Else create a new node, append to parent’s `children`, set `path` to `path.slice(0, d).concat(newId)`.
4. Clear `reviewDepth` (jump to tip of new/active path).
5. Classify quality and run engine analysis as today (on the new tip position).

Going back / forward only changes `reviewDepth` (or walks within `path`); it does **not** prune the tree.

Selecting a move in a side variation rebuilds `path` to that node (ancestor chain + that node) and sets `reviewDepth` to that depth.

### Main line vs variations (display)

- At each parent, `children[0]` is the **main continuation** for rendering the primary column.
- Other children are **variations**, shown inline in parentheses after the move where they fork, Lichess-style, e.g.  
  `1. e4 e5 2. Nf3 (2. Bc4 …) Nc6`
- Nested variations: indent or nest parentheses one level; depth capped in UI at a practical limit (e.g. show up to 2 nesting levels; deeper still selectable via path if needed).

Clicking any SAN in the list selects that node’s path + depth.

### Engine / commentary

Unchanged contract relative to current explore mode:

- Analyze FEN after the active path prefix of length `viewedDepth`
- Commentary button uses that FEN + path SAN history + qualities along the path
- Debounce on depth/path change remains

### Import / reset

- `loadStart` / `loadFen` / `importPgn`: rebuild tree as a **linear** chain of nodes (existing PGN mainline only)
- Qualities for imported moves stay `null` until re-played (same as today)

### UI copy

When reviewing: board remains interactive (enable moves). Hint text e.g.  
`回看中 · 走子将进入变着 · ← → 切换步数`

## File impact (expected)

| Area | Change |
|------|--------|
| `src/chess/moveTree.ts` (new) | Tree helpers: create, append, path from node, linearize mainline, find sibling by san |
| `src/store/explore.ts` | Replace flat history with tree + path + reviewDepth; branch in `makeMove` |
| `src/components/MoveList.tsx` (or `VariationMoveList.tsx`) | Render mainline + parenthetical variations |
| `src/pages/ExplorePage.tsx` | Wire interactive board while reviewing; update nav helpers |
| Tests | Unit tests for tree helpers + explore branch behavior |

## Success criteria

1. Play `1.e4 e5 2.Nf3`, go back to after `1.e4 e5`, play `2.Bc4` → both `Nf3` and `Bc4` lines exist; switching in the move list restores the correct board.
2. Replaying an existing SAN at a fork switches to that child instead of creating a duplicate.
3. Engine analysis updates for the current path position after branching.
4. Existing linear import PGN / FEN / start still work.
5. Existing explore commentary still works on the active path.
