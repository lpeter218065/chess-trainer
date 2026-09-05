# Game Session Persistence Design

## Goal

Persist explore and lesson analysis state so refresh resumes where the user left off. Support **autosave of the active session** plus a **named session list** (save-as, rename, switch, delete).

## Storage

- `localStorage` key `chess-trainer-game-sessions` via zustand `persist`
- Namespaces: explore vs lesson sessions in one store
- Engine analysis is **not** persisted; recomputed on restore

## Data

```ts
type SessionKind = 'explore' | 'lesson';

interface SessionMeta {
  id: string;
  kind: SessionKind;
  title: string;
  updatedAt: string; // ISO
  lessonId?: string;
}

interface ExploreSnapshot {
  startFen: string;
  tree: MoveTree;
  path: MoveNodeId[];
  reviewDepth: number | null;
  orientation: 'white' | 'black';
  commentary: string;
  commentaryPly: number | null;
  followUps: Record<string, FollowUpTurn[]>;
}

interface LessonSnapshot {
  lessonId: string;
  difficultyId: DifficultyId;
  fen: string;
  history: string[];
  rounds: Round[]; // including commentary text
  evalHistory: number[];
  evalCp: number;
  intro: string;
  summary: string;
  hintUsed: boolean;
  usedPrincipleIds: string[];
  angleHistory: Angle[];
  followUps: Record<string, FollowUpTurn[]>;
  phase: Phase;
  result: SessionState['result'];
}
```

## Behavior

| Action | Result |
|--------|--------|
| Edit explore/lesson | Debounced (~400ms) write to active session snapshot |
| Refresh `/explore` | Load `activeExploreId` snapshot; re-analyze current ply |
| Refresh `/lesson/:id` | If active lesson session matches id → restore; else start fresh (optionally keep other lesson sessions) |
| 另存为 | Clone active → new id + title |
| 切换会话 | Set active + hydrate store |
| 新对局 / 重开 | New empty (or new lesson) session; previous remains in list if named/autosaved |
| 删除 | Remove from list; if was active, create/select another |

## UI

- Explore header: session title, 「另存为」, 「会话」dropdown/list
- Lesson header: same
- Default titles: `探索 · HH:mm` / `{lesson.title} · HH:mm`

## Non-goals

- Cloud sync
- Persisting live engine lines / wasm state
- File export (later)
