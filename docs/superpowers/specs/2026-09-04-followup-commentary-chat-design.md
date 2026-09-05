# Follow-up Commentary Chat Design

## Goal

After primary AI commentary (explore + lesson), users can ask follow-up questions in an **inline** chat under the commentary. Answers stream, keep multi-turn context for that position/round, and use `{{square}}` / `{{from-to}}` markers so hover highlights the board (same as explore annotated commentary).

## Decisions (approved)

- Scope: **both** explore and lesson
- UI: **inline** under commentary (not modal)
- Input: **free text + 3–4 suggested chips**
- Board: follow-up answers use **AnnotatedCommentary** + existing marker protocol
- Architecture: shared component + per-context chat threads

## Non-goals

- Persist threads to localStorage
- Voice / multimodal
- Changing primary commentary structure
- Auto-ask on every move

## Data model

```ts
interface FollowUpTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Explore: keyed by `${pathIdsJoined}#${ply}` ; Lesson: keyed by `round:${index}` or `intro` */
type FollowUpThreadId = string;

// In explore / session state:
followUps: Record<FollowUpThreadId, FollowUpTurn[]>;
followUpStreaming: boolean;
followUpError: string | null;
```

## Lifecycle

| Event | Behavior |
|-------|----------|
| Primary commentary finishes | Show follow-up UI for current thread (empty or prior turns) |
| User sends question / chip | Append user turn; stream assistant; append on complete |
| Navigate ply / variation / round | Switch thread key; previous threads kept in memory |
| Regenerate primary commentary | Clear that thread’s follow-ups |
| Reset game / new lesson | Clear all follow-ups |

## Prompts

- Reuse marker rules from explore system (or shared `MARKER_RULES` snippet).
- `buildFollowUpMessages({ fen, moveHistorySan, evalCp, bestLinesSan, primaryCommentary, turns, question })`:
  - system: coach + markers + cite engine only
  - user: board context + primary commentary
  - then prior turns as user/assistant
  - final user: new question
- Suggested chips (static Chinese, same in both modes): e.g. 对方计划？ / 关键弱点在哪？ / 若走引擎次选会怎样？ / 我该优先改善哪颗子？

## UI

- `FollowUpChat`: message list (user plain text; assistant `AnnotatedCommentary` with `onFocus`), chips, textarea + send
- Disabled while `llmStreaming` (primary) or `followUpStreaming`
- Explore: below 局面讲解; Lesson: below current round / intro commentary when viewing that segment

## Files (expected)

| File | Role |
|------|------|
| `src/components/FollowUpChat.tsx` | Shared UI |
| `src/llm/prompts.ts` | `buildFollowUpMessages`, chip list, shared marker rules |
| `src/store/explore.ts` | threads + `askFollowUp` |
| `src/store/session.ts` | threads + `askFollowUp` |
| `ExplorePage` / `LessonPage` / `CommentaryPanel` | Wire UI + hover focus |
| Tests | prompts + store follow-up |

## Success criteria

1. After explore「显示讲解」, can ask a chip or free question; answer streams with markers; hover highlights board.
2. Multi-turn on same ply keeps prior Q/A in the request.
3. Changing ply shows a different (or empty) thread; returning restores prior thread.
4. Lesson round commentary supports the same follow-up UX.
5. Regenerating primary commentary clears that thread.
