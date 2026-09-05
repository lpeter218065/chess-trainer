# Explore Variation Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let explore mode keep side variations when the user goes back and plays a different move, with a Lichess-style move list.

**Architecture:** Replace flat `history[]` with a move tree (`rootChildren` + `nodes`) plus an active `path` and `reviewDepth`. Branching appends siblings; analysis/commentary still follow the active path only.

**Tech Stack:** TypeScript, Zustand vanilla store, React, Vitest, chess.js

**Spec:** `docs/superpowers/specs/2026-09-04-explore-variation-tree-design.md`

## Global Constraints

- No PGN import/export of nested variations this round
- Lesson mode unchanged
- Do not commit unless the user asks

## File map

| File | Role |
|------|------|
| `src/chess/moveTree.ts` | Pure tree types + helpers |
| `tests/moveTree.test.ts` | Tree unit tests |
| `src/store/explore.ts` | Store uses tree; `makeMove` branches |
| `tests/exploreTree.test.ts` | Store branching behavior (mocked engine/llm) |
| `src/components/MoveList.tsx` | Render mainline + parenthetical variations |
| `src/pages/ExplorePage.tsx` | Interactive board while reviewing; wire path APIs |

---

### Task 1: Move tree helpers

**Files:**
- Create: `src/chess/moveTree.ts`
- Test: `tests/moveTree.test.ts`

**Produces:**
- `createEmptyTree()`, `treeFromSans(sans)`, `pathSans(tree, path)`, `pathQualities(tree, path)`
- `findChildBySan(tree, parentId | null, san)`, `appendChild(tree, parentId | null, san, quality)`
- `pathToNode(tree, nodeId)`, `mainlineIds(tree)`

- [ ] **Step 1: Write failing tests** for empty tree, linear from sans, append sibling, find by san, pathToNode
- [ ] **Step 2: Implement `moveTree.ts`**
- [ ] **Step 3: `npm test -- tests/moveTree.test.ts` passes**

---

### Task 2: Explore store branching

**Files:**
- Modify: `src/store/explore.ts`
- Test: `tests/exploreTree.test.ts`

**Produces:**
- State: `tree`, `path`, `reviewDepth` (replace `history`, `qualities`, `reviewPly`)
- Derived helpers: `activeSans()`, `viewedPly()`, `isLive()`, `selectNode(nodeId)`
- `makeMove` works when reviewing: fork or reuse child by SAN

- [ ] **Step 1: Failing tests** — branch after back, reuse same SAN, selectNode switches path
- [ ] **Step 2: Refactor explore store to tree**
- [ ] **Step 3: Tests pass**

---

### Task 3: Move list UI + page wiring

**Files:**
- Modify: `src/components/MoveList.tsx`
- Modify: `src/pages/ExplorePage.tsx`

**Produces:**
- Move list accepts tree + path + selected node/depth; shows `(variation…)`
- Board interactive while reviewing; hint text updated

- [ ] **Step 1: Render variations in MoveList**
- [ ] **Step 2: Wire ExplorePage**
- [ ] **Step 3: `npm test` + manual smoke checklist**

**Manual smoke:**
1. `e4 e5 Nf3` → back to after `e5` → `Bc4` → both lines in list
2. Click `Nf3` line → board restores
3. Replay `Bc4` at fork → no duplicate node
4. Import linear PGN still works
