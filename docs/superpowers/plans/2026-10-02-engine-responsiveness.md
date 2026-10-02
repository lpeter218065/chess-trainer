# Engine responsiveness plan (2026-10-02)

Scope: `src/engine/` only, plus tests. Three tasks, implemented in order, one commit each on branch `optimize`.
Out of scope for now: progressive info parsing, shallower background grading, UI changes.

Baseline: `npm run verify` green (85 files / 637 tests).

## Task 1 — Option cache in `StockfishEngine.setOptions`

Problem: `StockfishEngine.analyze` (`src/engine/stockfishWorker.ts:63`) sends `setoption name MultiPV` + `isready` on every call even when unchanged; `createEngineService` keeps a separate `lastSkill` cache for the opponent.

Design:
- `StockfishEngine` keeps `private applied = new Map<string, string | number>()`.
- `setOptions(opts)` filters to entries whose value differs from `applied`. If none differ, return without posting anything. Otherwise post only the changed `setoption` lines + `isready`, then record them in `applied` (record after the `isready` resolves).
- `init()` clears `applied` (fresh `uci`).
- Remove the `lastSkill` variable in `src/engine/engineService.ts`; call `opponent.setOptions({ 'Skill Level': ... })` unconditionally and rely on the cache.

Tests (new `tests/stockfishWorker.test.ts`):
- Fake `Worker` installed on `globalThis` for the test: records `postMessage` payloads, test drives `onmessage` with lines (`uciok`, `readyok`, `info ...`, `bestmove ...`).
- `analyze` twice with same MultiPV → second call posts no `setoption`/extra `isready`, only `position` + `go`.
- Changing MultiPV posts exactly one `setoption` line + `isready`.
- `setOptions` with a mix of changed/unchanged keys posts only the changed ones.

Acceptance: `npm run verify` green; `engineService.ts` has no `lastSkill`.

## Task 2 — Interrupt the active search on abort

Problem: `analysisScheduler.ts:90` says the search cannot be interrupted; abort only settles the caller, the worker keeps searching up to `movetime` (1500 ms). Stepping through positions quickly waits on stale searches.

Design:
- `StockfishEngine` gains `stop(): void` — if `this.current` exists and `untilBestMove` is true, `postMessage('stop')`. Idempotent; no-op otherwise. The running job still resolves normally on `bestmove`, so the internal queue stays consistent.
- `AnalysisLimits` (scheduler) gains `signal?: AbortSignal`. The scheduler creates one `AbortController` per started request and passes `controller.signal` to the runner. `abortRequest` for a started request: reject the caller as today **and** `controller.abort()`. `dispose()` also aborts the active controller.
- The scheduler still waits for the runner promise to settle before draining the next request (existing `finally`). A rejected runner promise for an already-settled request is ignored (existing `rejectRequest` guard).
- `createEngineService` runner: `limits.signal?.addEventListener('abort', () => analyst.stop(), { once: true })` before calling `analyst.analyze`. If the signal is already aborted when the runner is invoked, skip the search and reject with an AbortError (scheduler never starts an aborted request, but keep the guard).
- `StockfishEngine.analyze` after a stop may see `bestmove (none)` or no `info` lines; it already throws in that case. That rejection reaches a settled request and is dropped. No unhandled rejection may escape — verify with a test.

Tests:
- `tests/analysisScheduler.test.ts`: aborting a started request calls `controller.abort()` seen by the runner's `limits.signal`; the next queued request only starts after the runner promise settles; disposing aborts the active signal.
- `tests/stockfishWorker.test.ts`: `stop()` posts `stop` only while a `go` is in flight; after `bestmove` arrives the job resolves and the next queued command runs.
- New `tests/engineService.test.ts` with an injectable engine factory (add optional second parameter `createEngineService(url, deps?: { createEngine?: (url) => StockfishEngineLike })`): aborting an in-flight `analyze` calls `stop()` on the analyst exactly once.

Acceptance: `npm run verify` green; no `unhandledrejection` in the test run output.

## Task 3 — Use both workers for analysis

Problem: review (`src/review/annotate.ts:141`) analyses up to 161 positions serially on the analyst while the opponent worker is idle.

Design:
- `createAnalysisScheduler(runners: AnalysisRunner | AnalysisRunner[])`: a single runner keeps today's behaviour. With several, each runner is a slot; `drain` assigns the next pending request to the first idle slot in array order (analyst first). Foreground-before-background ordering is unchanged.
- `createEngineService` passes `[analystRunner, opponentRunner]`. `opponentRunner` calls `opponent.setOptions({ 'Skill Level': 20 })` then `opponent.analyze(...)`; `opponentMove` keeps calling `opponent.setOptions({ 'Skill Level': difficulty.skillLevel })` first. With Task 1's cache both are cheap no-ops when unchanged. Because `StockfishEngine` serialises commands per worker, an `opponentMove` issued while the opponent slot is analysing simply queues behind it; this is accepted (bounded by one analysis's movetime) and documented in a comment.
- `stop()` wiring from Task 2 applies per slot: each runner stops its own engine.
- `dispose()` aborts every active slot.

Tests:
- `tests/analysisScheduler.test.ts`: two runners, three foreground requests → first two start immediately on slots 0 and 1, third starts when either settles; a single runner still serialises.
- `tests/engineService.test.ts`: two concurrent `analyze` calls hit both fake engines; the opponent fake receives `Skill Level: 20` before analysing and `opponentMove` afterwards re-applies the difficulty skill.
- `tests/reviewAnnotate.test.ts` must still pass unchanged.

Acceptance: `npm run verify` green.

## Review checklist (Fable)

- No change to `EnginePort` shape seen by stores (`analyze`, `opponentMove`, `dispose`).
- Abort paths never leave `active`/slot occupied; queue drains after a stopped search.
- No new unhandled rejections (watch vitest output).
- Comments in Chinese or English consistent with surrounding file.

---

# Phase 2 (2026-10-02, after Tasks 1–3 landed as b2b70c8..b8cf950)

## Task 4 — Quick limits for grading-only analyses

Problem: two analyses exist only to produce one cp value for move grading, yet run at the full display limits (depth 16 / 1500 ms):
- `src/store/session.ts:371` `deps.engine.analyze(fenAfterUser, 1)` inside `Promise.all` with `opponentMove` — the engine reply is held back until this finishes.
- `src/store/explore.ts:578` and `:587` background grading of the previous / resulting position.

Design:
- `src/engine/difficulty.ts`: add `GRADE_DEPTH = 12` and `GRADE_MOVETIME_MS = 500` (same depth the review grader uses).
- `session.ts`: pass `{ depth: GRADE_DEPTH, moveTimeMs: GRADE_MOVETIME_MS }` to the `fenAfterUser` eval at :371 and to the final-position eval in `finish()` (`analyze(chess.fen(), 1)`). Leave `prepareTurn` and `requestAssessment` at full limits (they feed PVs to the UI and the LLM).
- `explore.ts`: pass `{ priority: 'background', depth: GRADE_DEPTH, moveTimeMs: GRADE_MOVETIME_MS }` at :578 and :587. The displayed-position analysis (`analyzeDisplayedPosition`) stays at full limits. Where :586 falls back from `displayedAnalysis` to a fresh background analysis, use the quick limits too.
- No UI change. Grading inconsistency between depth 12 and the displayed depth 16 eval is accepted (review already grades at 12).

Tests: extend `tests/session.test.ts` (fake engine records `analyze` options) to assert the post-move eval and the finish eval carry the quick limits while `prepareTurn` does not; extend `tests/exploreAnalysisScheduling.test.ts` to assert the background grading calls carry `priority: 'background'` plus the quick limits and the displayed-position call does not.

Acceptance: `npm run verify` green. Commit `perf(engine): grade moves with shallow quick-eval limits`.

## Task 5 — Incremental info parsing and progressive analysis updates

Problem: `StockfishEngine.run` (`stockfishWorker.ts`) buffers every `info` line until `bestmove`, then parses them all. Nothing is visible until the search ends (up to 1500 ms). Parsing incrementally lets the eval bar, arrows and PV panel update as depth grows.

Design:
- `stockfishWorker.ts`
  - `Job` gains optional `onLine?: (line: string) => void`. When present, `onLine` is invoked for each incoming line and `info` lines are **not** pushed to `job.lines` (only non-info lines such as `bestmove` are kept). `run()` accepts it as an option.
  - `analyze(fen, depth, multiPv, moveTimeMs?, signal?, onProgress?: (partial: Analysis) => void)`: maintain the `byPv` map incrementally in `onLine` using `parseInfoLine` (same "keep deepest per multipv" rule). After each update, if `onProgress` is given and the line completes a depth iteration — i.e. `info.multipv === multiPv` (the last PV of that depth) or `multiPv === 1` — and `info.depth >= PROGRESS_MIN_DEPTH` (export const, 6) and depth increased since the last emit, call `onProgress({ fen, lines: sorted copy, bestMove: byPv.get(1)!.pv[0] })`. Never emit after `bestmove` has been handled; never emit if `byPv` lacks multipv 1. The final returned `Analysis` is built the same way as today (bestMove from the `bestmove` line).
  - `onProgress` exceptions must not break the search: wrap in try/catch.
- `analysisScheduler.ts`: `AnalysisLimits`/`AnalysisOptions` gain `onProgress?: (partial: Analysis) => void`; the scheduler forwards it to the runner, and stops forwarding once the request is settled (wrap: `(a) => { if (!request.settled) options.onProgress(a); }`).
- `engineService.ts`: `analyzeOn` passes `limits.onProgress` through to `engine.analyze`.
- `src/store/explore.ts` `analyzeDisplayedPosition`: pass `onProgress` that, when `token === analyzeToken && !controller.signal.aborted`, does `set({ analysis: partial, evalCp: whiteEval(partial) })` **without** touching `analyzing` (stays true until the final result). Final result path unchanged.
- `src/store/session.ts` `prepareTurn`: pass `onProgress` that, when `get().fen === fen`, sets `analysisBefore: partial, evalCp: playerCp(partial, lesson)` (phase untouched). `playUserMove` already tolerates a partial `analysisBefore` (it only needs `fen`, `bestMove`, `lines`). `requestAssessment` and `finish` do not use progress.
- UI: no new components. Optional one-liner: in `ExplorePage` `BoardStatus`, when `analyzing && analysis`, append the current depth (`analysis.lines[0]?.depth`) to the existing analysing text via a new chrome key `explore.analyzingDepth` in `src/i18n/chrome.ts` with zh/en values. If adding the key is more than a few lines, skip it and say so.

Tests:
- `tests/stockfishWorker.test.ts`: feeding `info depth 6 multipv 1 … pv e2e4`, `info depth 6 multipv 2 …`, `info depth 7 multipv 1 …` with `multiPv = 2` emits progress exactly once after the depth-6 multipv-2 line (for multiPv=1, once per depth ≥ 6); info lines are not retained in `job.lines`; the final result still comes from `bestmove`; a throwing `onProgress` does not reject the search.
- `tests/analysisScheduler.test.ts`: progress callbacks are forwarded while pending and dropped after abort.
- `tests/exploreAnalysisScheduling.test.ts` or `tests/exploreTree.test.ts`: a progress callback updates `analysis`/`evalCp` while `analyzing` remains true; a stale token's progress is ignored.
- `tests/session.test.ts`: progress during `prepareTurn` updates `analysisBefore` and is ignored after `fen` changes.

Acceptance: `npm run verify` green, no unhandled rejections. Commit `perf(engine): stream partial analysis while the search deepens`.
