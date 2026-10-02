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
