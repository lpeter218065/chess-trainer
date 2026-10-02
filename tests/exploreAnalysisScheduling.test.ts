import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { createAnalysisScheduler } from '../src/engine/analysisScheduler';
import type { Analysis, AnalysisOptions, EnginePort } from '../src/engine/engineService';
import { GRADE_DEPTH, GRADE_MOVETIME_MS } from '../src/engine/difficulty';
import { createExploreStore } from '../src/store/explore';
import { START_FEN } from '../src/chess/pgn';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function result(fen: string): Analysis {
  const move = new Chess(fen).moves({ verbose: true })[0];
  const bestMove = move.from + move.to + (move.promotion ?? '');
  return { fen, bestMove, lines: [{ depth: 12, multipv: 1, score: { cp: 42 }, pv: [bestMove] }] };
}

function harness() {
  const calls: { fen: string; resolve: () => void; reject: (e: Error) => void }[] = [];
  const scheduler = createAnalysisScheduler((fen) => new Promise<Analysis>((resolve, reject) => {
    calls.push({ fen, resolve: () => resolve(result(fen)), reject });
  }));
  const requests: { fen: string; multiPv: number; options?: AnalysisOptions }[] = [];
  const engine: EnginePort = {
    ...scheduler,
    analyze(fen, multiPv, options) {
      requests.push({ fen, multiPv, options });
      return scheduler.analyze(fen, multiPv, options);
    },
    opponentMove: async () => 'e7e5',
  };
  const store = createExploreStore(engine, { async *stream() { yield ''; } });
  return { calls, requests, scheduler, store };
}

describe('explore analysis scheduling', () => {
  it('publishes the latest position before historical grades, discards stale queued display work, then fills all grades', async () => {
    const { calls, scheduler, store } = harness();
    store.getState().loadStart();
    await store.getState().makeMove('e2', 'e4');
    await store.getState().makeMove('e7', 'e5');
    const chess = new Chess();
    chess.move('e4');
    chess.move('e5');
    const latestFen = chess.fen();

    expect(calls.map((call) => call.fen)).toEqual([START_FEN]);
    calls[0].resolve();
    await flush();
    expect(calls.map((call) => call.fen)).toEqual([START_FEN, latestFen]);

    calls[1].resolve();
    await flush();
    expect(store.getState().analysis?.fen).toBe(latestFen);
    expect(store.getState().analyzing).toBe(false);
    expect(store.getState().qualities()).toEqual([null, null]);

    for (let index = 2; index < calls.length; index++) {
      expect(index).toBeLessThan(10);
      calls[index].resolve();
      await flush();
    }
    expect(store.getState().qualities().every((quality) => quality !== null)).toBe(true);
    expect(store.getState().analysis?.fen).toBe(latestFen);
    expect(store.getState().evalCp).toBe(42);
    expect(store.getState().error).toBeNull();
    scheduler.dispose();
  });

  it('does not leave current analysis busy when a separate historical grade fails', async () => {
    const { calls, scheduler, store } = harness();
    store.getState().loadStart();
    await store.getState().makeMove('e2', 'e4');
    calls[0].resolve();
    await flush();
    calls[1].resolve();
    await flush();
    const latestFen = calls[1].fen;
    calls[2].reject(new Error('grade unavailable'));
    await flush();
    expect(store.getState().analysis?.fen).toBe(latestFen);
    expect(store.getState().analyzing).toBe(false);
    expect(store.getState().error).toContain('着法评分失败');
    scheduler.dispose();
  });

  it('grades moves in the background with shallow limits while the displayed position keeps full limits', async () => {
    const { calls, requests, scheduler, store } = harness();
    store.getState().loadStart();
    await store.getState().makeMove('e2', 'e4');
    await store.getState().makeMove('e7', 'e5');
    for (let index = 0; index < calls.length; index++) {
      expect(index).toBeLessThan(10);
      calls[index].resolve();
      await flush();
    }
    expect(store.getState().qualities().every((quality) => quality !== null)).toBe(true);

    const background = requests.filter((request) => request.options?.priority === 'background');
    const displayed = requests.filter((request) => request.options?.priority !== 'background');
    expect(background.length).toBeGreaterThan(0);
    expect(displayed.length).toBeGreaterThan(0);
    for (const request of background) {
      expect(request.options).toMatchObject({ depth: GRADE_DEPTH, moveTimeMs: GRADE_MOVETIME_MS });
    }
    for (const request of displayed) {
      expect(request.options?.depth).toBeUndefined();
      expect(request.options?.moveTimeMs).toBeUndefined();
    }
    scheduler.dispose();
  });

  it('shows partial analysis while the displayed search deepens and keeps analyzing until the final result', async () => {
    const { calls, requests, scheduler, store } = harness();
    store.getState().loadStart();
    expect(calls.map((call) => call.fen)).toEqual([START_FEN]);
    expect(store.getState().analyzing).toBe(true);

    const partial: Analysis = {
      fen: START_FEN,
      bestMove: 'd2d4',
      lines: [{ depth: 6, multipv: 1, score: { cp: 15 }, pv: ['d2d4'] }],
    };
    requests[0].options!.onProgress!(partial);
    expect(store.getState().analysis).toEqual(partial);
    expect(store.getState().evalCp).toBe(15);
    expect(store.getState().analyzing).toBe(true);

    calls[0].resolve();
    await flush();
    expect(store.getState().analysis?.lines[0].depth).toBe(12);
    expect(store.getState().evalCp).toBe(42);
    expect(store.getState().analyzing).toBe(false);
    scheduler.dispose();
  });

  it('ignores progress from a superseded displayed analysis', async () => {
    const { requests, scheduler, store } = harness();
    store.getState().loadStart();
    const staleProgress = requests[0].options!.onProgress!;
    await store.getState().makeMove('e2', 'e4');
    expect(store.getState().analysis).toBeNull();

    // 直接调用 store 交给引擎的回调（绕过调度器的 settled 过滤），验证 store 自己的 token 守卫
    staleProgress({ fen: START_FEN, bestMove: 'd2d4', lines: [{ depth: 8, multipv: 1, score: { cp: 99 }, pv: ['d2d4'] }] });
    expect(store.getState().analysis).toBeNull();
    expect(store.getState().evalCp).not.toBe(99);
    expect(store.getState().analyzing).toBe(true);
    scheduler.dispose();
  });

  it('does not grade a move against a partial analysis of the position it was played from', async () => {
    const { requests, scheduler, store } = harness();
    store.getState().loadStart();
    requests[0].options!.onProgress!({
      fen: START_FEN,
      bestMove: 'e2e4',
      lines: [{ depth: 6, multipv: 1, score: { cp: 15 }, pv: ['e2e4'] }],
    });
    await store.getState().makeMove('e2', 'e4');
    // 部分结果不作数：不立刻标「最佳」，走子前局面另行后台评估
    expect(store.getState().qualities()).toEqual([null]);
    expect(requests.some((r) => r.fen === START_FEN && r.options?.priority === 'background')).toBe(true);
    scheduler.dispose();
  });

  it('falls back to a shallow background grade when the displayed analysis of the resulting position fails', async () => {
    const { calls, requests, scheduler, store } = harness();
    store.getState().loadStart();
    await store.getState().makeMove('e2', 'e4');
    calls[0].resolve();
    await flush();
    const afterE4 = calls[1].fen;
    calls[1].reject(new Error('display failed'));
    await flush();
    for (let index = 2; index < calls.length; index++) {
      expect(index).toBeLessThan(10);
      calls[index].resolve();
      await flush();
    }
    const fallback = requests.filter((request) => request.fen === afterE4 && request.options?.priority === 'background');
    expect(fallback).toHaveLength(1);
    expect(fallback[0]).toMatchObject({ multiPv: 1, options: { depth: GRADE_DEPTH, moveTimeMs: GRADE_MOVETIME_MS } });
    expect(store.getState().qualities()).not.toContain(null);
    scheduler.dispose();
  });
});
