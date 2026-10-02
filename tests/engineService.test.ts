import { describe, expect, it, vi } from 'vitest';
import { createEngineService, type StockfishEngineLike } from '../src/engine/engineService';
import type { Analysis } from '../src/engine/stockfishWorker';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** 假引擎：analyze 挂起直到 stop()，模拟 Stockfish 收到 stop 后以 bestmove (none) 结束搜索 */
class FakeEngine implements StockfishEngineLike {
  stop = vi.fn(() => {
    this.pending?.reject(new Error('no bestmove'));
    this.pending = null;
  });
  analyzeCalls: string[] = [];
  private pending: { resolve(a: Analysis): void; reject(e: Error): void } | null = null;

  init = vi.fn(async () => {});
  setOptions = vi.fn(async (_opts: Record<string, string | number>) => {});
  bestMove = vi.fn(async () => 'e2e4');
  terminate = vi.fn();

  /** 与 StockfishEngine 一致：signal 在搜索期间被 abort 时调用 stop()，搜索结束后摘掉监听 */
  analyze(fen: string, _depth: number, _multiPv: number, _moveTimeMs?: number, signal?: AbortSignal): Promise<Analysis> {
    this.analyzeCalls.push(fen);
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
    const next = port.analyze('next', 3);
    await flush();
    expect(analyst.analyzeCalls).toEqual([FEN]);

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
});
