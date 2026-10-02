import { describe, expect, it, vi } from 'vitest';
import { createEngineService, type StockfishEngineLike } from '../src/engine/engineService';
import type { Analysis } from '../src/engine/stockfishWorker';
import { difficultyById } from '../src/engine/difficulty';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** 假引擎：analyze 挂起直到 stop()，模拟 Stockfish 收到 stop 后以 bestmove (none) 结束搜索 */
class FakeEngine implements StockfishEngineLike {
  stop = vi.fn(() => {
    this.pending?.reject(new Error('no bestmove'));
    this.pending = null;
  });
  analyzeCalls: string[] = [];
  /** 最近一次 analyze 收到的进度回调 */
  progress: ((partial: Analysis) => void) | undefined;
  /** setOptions / analyze / bestMove 的调用顺序 */
  events: string[] = [];
  /** 设置后 bestMove 挂起，直到测试调用 releaseBestMove */
  holdBestMove = false;
  private pending: { resolve(a: Analysis): void; reject(e: Error): void } | null = null;
  private heldBestMove: (() => void) | null = null;

  init = vi.fn(async () => {});
  setOptions = vi.fn(async (opts: Record<string, string | number>) => {
    this.events.push(`setOptions ${JSON.stringify(opts)}`);
  });
  bestMove = vi.fn(async (fen: string) => {
    this.events.push(`bestMove ${fen}`);
    if (this.holdBestMove) await new Promise<void>((resolve) => (this.heldBestMove = resolve));
    return 'e2e4';
  });
  terminate = vi.fn();

  releaseBestMove() {
    this.heldBestMove?.();
    this.heldBestMove = null;
  }

  /** 与 StockfishEngine 一致：signal 在搜索期间被 abort 时调用 stop()，搜索结束后摘掉监听 */
  analyze(
    fen: string,
    _depth: number,
    _multiPv: number,
    _moveTimeMs?: number,
    signal?: AbortSignal,
    onProgress?: (partial: Analysis) => void,
  ): Promise<Analysis> {
    this.analyzeCalls.push(fen);
    this.progress = onProgress;
    this.events.push(`analyze ${fen}`);
    const onAbort = () => this.stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    return new Promise<Analysis>((resolve, reject) => {
      this.pending = { resolve, reject };
    }).finally(() => signal?.removeEventListener('abort', onAbort));
  }

  finish(fen: string) {
    this.pending?.resolve({ fen, bestMove: 'e2e4', lines: [] });
    this.pending = null;
  }
}

async function setup() {
  const engines: FakeEngine[] = [];
  const port = await createEngineService('stockfish.js', {
    createEngine: () => {
      const engine = new FakeEngine();
      engines.push(engine);
      return engine;
    },
  });
  const [analyst, opponent] = engines;
  return { port, analyst, opponent };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('createEngineService abort wiring', () => {
  it('stops the analyst exactly once when an in-flight analyze is aborted', async () => {
    const { port, analyst, opponent } = await setup();
    const controller = new AbortController();
    const stale = port.analyze(FEN, 3, { signal: controller.signal });
    // 占住 opponent 槽位，使 next 只能等 analyst
    const busy = port.analyze('busy', 3);
    const next = port.analyze('next', 3);
    await flush();
    expect(analyst.analyzeCalls).toEqual([FEN]);
    expect(opponent.analyzeCalls).toEqual(['busy']);

    controller.abort();
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(analyst.stop).toHaveBeenCalledTimes(1);
    expect(opponent.stop).not.toHaveBeenCalled();

    // 被 stop 的搜索以错误结束后，下一个请求才开始
    await flush();
    expect(analyst.analyzeCalls).toEqual([FEN, 'next']);
    analyst.finish('next');
    await expect(next).resolves.toMatchObject({ fen: 'next' });
    // 已结束搜索的 signal 不会再触发 stop
    expect(analyst.stop).toHaveBeenCalledTimes(1);
    opponent.finish('busy');
    await expect(busy).resolves.toMatchObject({ fen: 'busy' });
    port.dispose();
  });

  it('does not stop the analyst after the search finished normally', async () => {
    const { port, analyst } = await setup();
    const controller = new AbortController();
    const request = port.analyze(FEN, 3, { signal: controller.signal });
    await flush();
    analyst.finish(FEN);
    await expect(request).resolves.toMatchObject({ fen: FEN });
    controller.abort();
    expect(analyst.stop).not.toHaveBeenCalled();
    port.dispose();
  });

  it('stops the active search on dispose', async () => {
    const { port, analyst } = await setup();
    const request = port.analyze(FEN, 3);
    await flush();
    port.dispose();
    await expect(request).rejects.toThrow('disposed');
    expect(analyst.stop).toHaveBeenCalledTimes(1);
    expect(analyst.terminate).toHaveBeenCalled();
  });

  it('stops both engines on dispose when both slots are analysing', async () => {
    const { port, analyst, opponent } = await setup();
    const one = port.analyze('one', 3);
    const two = port.analyze('two', 3);
    await flush();
    port.dispose();
    await expect(one).rejects.toThrow('disposed');
    await expect(two).rejects.toThrow('disposed');
    expect(analyst.stop).toHaveBeenCalledTimes(1);
    expect(opponent.stop).toHaveBeenCalledTimes(1);
  });
});

describe('createEngineService two analysis slots', () => {
  it('runs two concurrent analyze calls on both engines', async () => {
    const { port, analyst, opponent } = await setup();
    const one = port.analyze('one', 3);
    const two = port.analyze('two', 2);
    await flush();
    expect(analyst.analyzeCalls).toEqual(['one']);
    expect(opponent.analyzeCalls).toEqual(['two']);
    opponent.finish('two');
    analyst.finish('one');
    await expect(one).resolves.toMatchObject({ fen: 'one' });
    await expect(two).resolves.toMatchObject({ fen: 'two' });
    port.dispose();
  });

  it('streams progress from either engine to the caller until the request settles', async () => {
    const { port, analyst, opponent } = await setup();
    const seen: string[] = [];
    const one = port.analyze('one', 3, { onProgress: (p) => seen.push(`one ${p.bestMove}`) });
    const two = port.analyze('two', 3, { onProgress: (p) => seen.push(`two ${p.bestMove}`) });
    await flush();
    analyst.progress!({ fen: 'one', bestMove: 'd2d4', lines: [] });
    opponent.progress!({ fen: 'two', bestMove: 'c2c4', lines: [] });
    expect(seen).toEqual(['one d2d4', 'two c2c4']);

    analyst.finish('one');
    opponent.finish('two');
    await Promise.all([one, two]);
    analyst.progress!({ fen: 'one', bestMove: 'g1f3', lines: [] });
    expect(seen).toEqual(['one d2d4', 'two c2c4']);
    port.dispose();
  });

  it('analyses on the opponent at Skill Level 20 and re-applies the difficulty skill for opponentMove', async () => {
    const { port, analyst, opponent } = await setup();
    const one = port.analyze('one', 3);
    const two = port.analyze('two', 3);
    await flush();
    expect(opponent.events).toEqual(['setOptions {"Skill Level":20}', 'analyze two']);
    opponent.finish('two');
    analyst.finish('one');
    await Promise.all([one, two]);

    const easy = difficultyById('easy');
    await expect(port.opponentMove(FEN, easy)).resolves.toBe('e2e4');
    expect(opponent.events.slice(2)).toEqual([
      `setOptions {"Skill Level":${easy.skillLevel},"MultiPV":1}`,
      `bestMove ${FEN}`,
    ]);
    port.dispose();
  });

  it('queues an opponentMove behind an analysis already running on the opponent', async () => {
    const { port, analyst, opponent } = await setup();
    const one = port.analyze('one', 3);
    const two = port.analyze('two', 3);
    await flush();
    const easy = difficultyById('easy');
    const move = port.opponentMove(FEN, easy);
    await flush();
    expect(opponent.bestMove).not.toHaveBeenCalled();

    opponent.finish('two');
    await expect(move).resolves.toBe('e2e4');
    expect(opponent.events).toEqual([
      'setOptions {"Skill Level":20}',
      'analyze two',
      `setOptions {"Skill Level":${easy.skillLevel},"MultiPV":1}`,
      `bestMove ${FEN}`,
    ]);
    analyst.finish('one');
    await Promise.all([one, two]);
    port.dispose();
  });

  it('does not change the opponent options while an opponentMove is searching', async () => {
    const { port, analyst, opponent } = await setup();
    opponent.holdBestMove = true;
    const easy = difficultyById('easy');
    const move = port.opponentMove(FEN, easy);
    const one = port.analyze('one', 3);
    const two = port.analyze('two', 3);
    await flush();
    expect(opponent.events).toEqual([`setOptions {"Skill Level":${easy.skillLevel},"MultiPV":1}`, `bestMove ${FEN}`]);

    opponent.releaseBestMove();
    await expect(move).resolves.toBe('e2e4');
    await flush();
    expect(opponent.events.slice(2)).toEqual(['setOptions {"Skill Level":20}', 'analyze two']);
    analyst.finish('one');
    opponent.finish('two');
    await Promise.all([one, two]);
    port.dispose();
  });

  it('stops the opponent, not the analyst, when a request on the opponent slot is aborted', async () => {
    const { port, analyst, opponent } = await setup();
    const controller = new AbortController();
    const one = port.analyze('one', 3);
    const stale = port.analyze('stale', 3, { signal: controller.signal });
    await flush();
    expect(opponent.analyzeCalls).toEqual(['stale']);

    controller.abort();
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(opponent.stop).toHaveBeenCalledTimes(1);
    expect(analyst.stop).not.toHaveBeenCalled();

    analyst.finish('one');
    await expect(one).resolves.toMatchObject({ fen: 'one' });
    port.dispose();
  });

  it('skips the analysis when it is aborted while waiting for an opponentMove', async () => {
    const { port, analyst, opponent } = await setup();
    opponent.holdBestMove = true;
    const move = port.opponentMove(FEN, difficultyById('easy'));
    const one = port.analyze('one', 3);
    const controller = new AbortController();
    const waiting = port.analyze('waiting', 3, { signal: controller.signal });
    await flush();
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });

    opponent.releaseBestMove();
    await move;
    await flush();
    expect(opponent.analyzeCalls).toEqual([]);
    expect(opponent.events.some((e) => e.includes('"Skill Level":20'))).toBe(false);
    analyst.finish('one');
    await one;
    port.dispose();
  });
});
