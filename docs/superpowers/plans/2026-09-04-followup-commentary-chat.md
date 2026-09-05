# Follow-up Commentary Chat Implementation Plan

> **For agentic workers:** Implement task-by-task with TDD. Do not commit unless the user asks.

**Goal:** Inline multi-turn follow-up Q&A under commentary in explore + lesson, with board highlight markers.

**Architecture:** Shared `FollowUpChat` + `buildFollowUpMessages`; thread map keyed by position/round; assistant replies via `AnnotatedCommentary`.

**Tech Stack:** TypeScript, Zustand, React, Vitest

**Spec:** `docs/superpowers/specs/2026-09-04-followup-commentary-chat-design.md`

## File map

| File | Responsibility |
|------|----------------|
| `src/llm/prompts.ts` | Follow-up prompts + `FOLLOW_UP_CHIPS` |
| `tests/prompts.test.ts` | Assert follow-up messages shape |
| `src/components/FollowUpChat.tsx` | UI |
| `src/store/explore.ts` | Explore threads + askFollowUp |
| `src/store/session.ts` | Lesson threads + askFollowUp |
| `src/pages/ExplorePage.tsx` | Wire explore |
| `src/pages/LessonPage.tsx` / `CommentaryPanel.tsx` | Wire lesson |

---

### Task 1: Prompts

- [ ] Add `FOLLOW_UP_CHIPS`, `buildFollowUpMessages`
- [ ] Tests in `tests/prompts.test.ts`

### Task 2: FollowUpChat UI

- [ ] Create component; chips, input, AnnotatedCommentary for assistant

### Task 3: Explore store + page

- [ ] `followUps`, `askFollowUp`, clear on regenerate / reset
- [ ] Wire ExplorePage

### Task 4: Lesson store + page

- [ ] Same for session rounds / intro
- [ ] Wire CommentaryPanel or LessonPage
- [ ] Full `npm test`
