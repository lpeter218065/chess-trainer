import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROGRESS_MIN_DEPTH, StockfishEngine, type Analysis } from '../src/engine/stockfishWorker';

const FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** 假 Worker：记录 postMessage；auto 模式下按 UCI 协议自动回送终止行，否则由测试调用 emit 驱动 */
class FakeWorker {
  static last: FakeWorker | null = null;
  posted: string[] = [];
  auto = true;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;

  constructor(_url: string) {
    FakeWorker.last = this;
  }

  postMessage(msg: string) {
    this.posted.push(msg);
    if (!this.auto) return;
    if (msg === 'uci') queueMicrotask(() => this.emit('uciok'));
    else if (msg === 'isready') queueMicrotask(() => this.emit('readyok'));
    else if (msg.startsWith('go')) {
      queueMicrotask(() => {
        this.emit('info depth 10 multipv 1 score cp 20 pv e2e4 e7e5');
        this.emit('bestmove e2e4');
      });
    }
  }

  emit(line: string) {
    this.onmessage?.({ data: line } as MessageEvent<string>);
  }

  terminate() {}
}

const realWorker = globalThis.Worker;

async function setup() {
  const engine = new StockfishEngine('stockfish.js');
  const worker = FakeWorker.last!;
  await engine.init();
  worker.posted = [];
  return { engine, worker };
}

async function flush() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('StockfishEngine option cache', () => {
  beforeEach(() => {
    (globalThis as { Worker: unknown }).Worker = FakeWorker;
  });

  afterEach(() => {
    (globalThis as { Worker: unknown }).Worker = realWorker;
    FakeWorker.last = null;
  });

  it('skips setoption and isready when MultiPV is unchanged between analyses', async () => {
    const { engine, worker } = await setup();
    await engine.analyze(FEN, 10, 3);
    expect(worker.posted).toEqual(['setoption name MultiPV value 3', 'isready', `position fen ${FEN}`, 'go depth 10']);

    worker.posted = [];
    const result = await engine.analyze(FEN, 10, 3, 500);
    expect(worker.posted).toEqual([`position fen ${FEN}`, 'go depth 10 movetime 500']);
    expect(result.bestMove).toBe('e2e4');
  });

  it('sends exactly one setoption plus isready when MultiPV changes', async () => {
    const { engine, worker } = await setup();
    await engine.analyze(FEN, 10, 3);
    worker.posted = [];

    await engine.analyze(FEN, 10, 1);
    expect(worker.posted.filter((m) => m.startsWith('setoption'))).toEqual(['setoption name MultiPV value 1']);
    expect(worker.posted.filter((m) => m === 'isready')).toHaveLength(1);
  });

  it('posts only the changed keys when options are mixed', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ 'Skill Level': 20, MultiPV: 3 });
    worker.posted = [];

    await engine.setOptions({ 'Skill Level': 20, MultiPV: 2 });
    expect(worker.posted).toEqual(['setoption name MultiPV value 2', 'isready']);
  });

  it('posts nothing and resolves without a readyok when no option changed', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ 'Skill Level': 5 });
    worker.posted = [];
    worker.auto = false;

    let resolved = false;
    void engine.setOptions({ 'Skill Level': 5 }).then(() => (resolved = true));
    await flush();
    expect(resolved).toBe(true);
    expect(worker.posted).toEqual([]);
  });

  it('forgets applied options after init', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ MultiPV: 3 });
    await engine.init();
    worker.posted = [];

    await engine.setOptions({ MultiPV: 3 });
    expect(worker.posted).toEqual(['setoption name MultiPV value 3', 'isready']);
  });

  it('computes the diff in queue order so overlapping calls stay correct', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ 'Skill Level': 5 });
    worker.posted = [];
    worker.auto = false;

    // 第一个调用尚未收到 readyok 时第二个调用已经入队：第二个必须基于第一个的结果重新比较
    const first = engine.setOptions({ 'Skill Level': 20 });
    const second = engine.setOptions({ 'Skill Level': 5 });
    await flush();
    expect(worker.posted).toEqual(['setoption name Skill Level value 20', 'isready']);
    worker.emit('readyok');
    await first;
    await flush();
    expect(worker.posted).toEqual([
      'setoption name Skill Level value 20',
      'isready',
      'setoption name Skill Level value 5',
      'isready',
    ]);
    worker.emit('readyok');
    await second;
  });
});

describe('StockfishEngine stop', () => {
  beforeEach(() => {
    (globalThis as { Worker: unknown }).Worker = FakeWorker;
  });

  afterEach(() => {
    (globalThis as { Worker: unknown }).Worker = realWorker;
    FakeWorker.last = null;
  });

  it('does nothing when no search is in flight', async () => {
    const { engine, worker } = await setup();
    engine.stop();
    expect(worker.posted).toEqual([]);

    // isready 等待中也不是搜索
    worker.auto = false;
    const ready = engine.newGame();
    await flush();
    engine.stop();
    expect(worker.posted).toEqual(['ucinewgame', 'isready']);
    worker.emit('readyok');
    await ready;
  });

  it('posts stop once during a go, then the job resolves on bestmove and the queue continues', async () => {
    const { engine, worker } = await setup();
    worker.auto = false;
    const search = engine.bestMove(FEN, 20, 1500);
    const next = engine.newGame();
    await flush();
    expect(worker.posted).toEqual([`position fen ${FEN}`, 'go depth 20 movetime 1500']);

    engine.stop();
    engine.stop();
    expect(worker.posted.filter((m) => m === 'stop')).toHaveLength(1);

    worker.emit('info depth 5 multipv 1 score cp 10 pv d2d4');
    worker.emit('bestmove d2d4');
    await expect(search).resolves.toBe('d2d4');
    await flush();
    expect(worker.posted.slice(-2)).toEqual(['ucinewgame', 'isready']);
    worker.emit('readyok');
    await next;

    // 搜索已结束，再次 stop 不发送
    engine.stop();
    expect(worker.posted.filter((m) => m === 'stop')).toHaveLength(1);
  });

  it('rejects analyze when a stopped search reports bestmove (none)', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ MultiPV: 1 });
    worker.auto = false;
    const search = engine.analyze(FEN, 20, 1, 1500);
    await flush();
    engine.stop();
    worker.emit('bestmove (none)');
    await expect(search).rejects.toThrow();
  });
});

describe('StockfishEngine analyze abort', () => {
  beforeEach(() => {
    (globalThis as { Worker: unknown }).Worker = FakeWorker;
  });

  afterEach(() => {
    (globalThis as { Worker: unknown }).Worker = realWorker;
    FakeWorker.last = null;
  });

  it('posts no go and rejects with AbortError when aborted during the option round-trip', async () => {
    const { engine, worker } = await setup();
    worker.auto = false;
    const controller = new AbortController();
    const search = engine.analyze(FEN, 20, 3, 1500, controller.signal);
    await flush();
    expect(worker.posted).toEqual(['setoption name MultiPV value 3', 'isready']);

    controller.abort();
    expect(worker.posted).not.toContain('stop');
    worker.emit('readyok');
    await expect(search).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(worker.posted).toEqual(['setoption name MultiPV value 3', 'isready']);

    // 选项仍已记入缓存，引擎可以继续使用
    worker.auto = true;
    worker.posted = [];
    await engine.analyze(FEN, 10, 3);
    expect(worker.posted).toEqual([`position fen ${FEN}`, 'go depth 10']);
  });

  it('sends stop through the signal while its own go is in flight', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ MultiPV: 1 });
    worker.auto = false;
    worker.posted = [];
    const controller = new AbortController();
    const search = engine.analyze(FEN, 20, 1, 1500, controller.signal);
    await flush();
    expect(worker.posted).toEqual([`position fen ${FEN}`, 'go depth 20 movetime 1500']);

    controller.abort();
    expect(worker.posted.filter((m) => m === 'stop')).toHaveLength(1);
    worker.emit('info depth 4 multipv 1 score cp 10 pv d2d4');
    worker.emit('bestmove d2d4');
    await expect(search).resolves.toMatchObject({ bestMove: 'd2d4' });
  });

  it('does not stop another queued search when aborted before its own go starts', async () => {
    const { engine, worker } = await setup();
    await engine.setOptions({ MultiPV: 1 });
    worker.auto = false;
    worker.posted = [];
    const other = engine.bestMove(FEN, 20, 1500);
    const controller = new AbortController();
    const search = engine.analyze(FEN, 20, 1, 1500, controller.signal);
    await flush();
    expect(worker.posted).toEqual([`position fen ${FEN}`, 'go depth 20 movetime 1500']);

    controller.abort();
    expect(worker.posted).not.toContain('stop');
    worker.emit('bestmove e2e4');
    await expect(other).resolves.toBe('e2e4');
    await expect(search).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(worker.posted).toEqual([`position fen ${FEN}`, 'go depth 20 movetime 1500']);
  });
});

describe('StockfishEngine progressive analysis', () => {
  beforeEach(() => {
    (globalThis as { Worker: unknown }).Worker = FakeWorker;
  });

  afterEach(() => {
    (globalThis as { Worker: unknown }).Worker = realWorker;
    FakeWorker.last = null;
  });

  async function searching(multiPv: number, onProgress: (partial: Analysis) => void) {
    const { engine, worker } = await setup();
    await engine.setOptions({ MultiPV: multiPv });
    worker.auto = false;
    const search = engine.analyze(FEN, 20, multiPv, 1500, undefined, onProgress);
    await flush();
    expect(worker.posted.slice(-1)).toEqual(['go depth 20 movetime 1500']);
    return { engine, worker, search };
  }

  it('reports once per completed depth with MultiPV 2, after the last PV of that depth', async () => {
    const progress: Analysis[] = [];
    const { worker, search } = await searching(2, (p) => progress.push(p));

    worker.emit('info depth 5 multipv 1 score cp 5 pv d2d4');
    worker.emit('info depth 5 multipv 2 score cp 3 pv e2e4');
    expect(progress).toHaveLength(0); // 低于 PROGRESS_MIN_DEPTH

    worker.emit('info depth 6 multipv 1 score cp 20 pv e2e4 e7e5');
    expect(progress).toHaveLength(0); // 该深度还没出齐
    worker.emit('info depth 6 multipv 2 score cp 10 pv d2d4 d7d5');
    expect(progress).toHaveLength(1);
    expect(progress[0]).toEqual({
      fen: FEN,
      bestMove: 'e2e4',
      lines: [
        { depth: 6, multipv: 1, score: { cp: 20 }, pv: ['e2e4', 'e7e5'] },
        { depth: 6, multipv: 2, score: { cp: 10 }, pv: ['d2d4', 'd7d5'] },
      ],
    });

    worker.emit('info depth 7 multipv 1 score cp 25 pv g1f3');
    expect(progress).toHaveLength(1);

    worker.emit('bestmove c2c4');
    const result = await search;
    expect(progress).toHaveLength(1);
    // 最终结果的 bestMove 来自 bestmove 行，每条 PV 取最深的一条
    expect(result.bestMove).toBe('c2c4');
    expect(result.lines.map((l) => [l.multipv, l.depth])).toEqual([[1, 7], [2, 6]]);
  });

  it('reports once per depth from PROGRESS_MIN_DEPTH with MultiPV 1, never repeating a depth', async () => {
    expect(PROGRESS_MIN_DEPTH).toBe(6);
    const depths: number[] = [];
    const { worker, search } = await searching(1, (p) => depths.push(p.lines[0].depth));

    for (const d of [4, 5, 6, 6, 7, 8]) worker.emit(`info depth ${d} multipv 1 score cp ${d} pv e2e4`);
    worker.emit('info depth 8 seldepth 10 multipv 1 score cp 8 upperbound pv e2e4');
    worker.emit('bestmove e2e4');
    await search;
    expect(depths).toEqual([6, 7, 8]);
  });

  it('does not report after bestmove', async () => {
    const progress: Analysis[] = [];
    const { worker, search } = await searching(1, (p) => progress.push(p));
    worker.emit('bestmove e2e4');
    // 迟到的行（理论上不会出现）也不能触发回报
    worker.emit('info depth 9 multipv 1 score cp 9 pv e2e4');
    await search.catch(() => undefined);
    expect(progress).toHaveLength(0);
  });

  it('keeps searching when onProgress throws', async () => {
    const { worker, search } = await searching(1, () => {
      throw new Error('ui exploded');
    });
    worker.emit('info depth 6 multipv 1 score cp 6 pv e2e4');
    worker.emit('info depth 7 multipv 1 score cp 7 pv d2d4');
    worker.emit('bestmove d2d4');
    await expect(search).resolves.toMatchObject({ bestMove: 'd2d4', lines: [{ depth: 7, pv: ['d2d4'] }] });
  });

  it('does not retain info lines when a line handler is present', async () => {
    const { engine, worker } = await setup();
    worker.auto = false;
    const seen: string[] = [];
    // run 是私有方法：直接验证 Job 在有 onLine 时只保留非 info 行
    const run = (engine as unknown as {
      run(cmds: string[], untilBestMove: boolean, opts: { onLine(line: string): void }): Promise<string[]>;
    }).run.bind(engine);
    const done = run(['go depth 5'], true, { onLine: (l) => seen.push(l) });
    await flush();
    worker.emit('info depth 1 multipv 1 score cp 1 pv e2e4');
    worker.emit('info string NNUE evaluation enabled');
    worker.emit('bestmove e2e4');
    await expect(done).resolves.toEqual(['bestmove e2e4']);
    expect(seen).toEqual([
      'info depth 1 multipv 1 score cp 1 pv e2e4',
      'info string NNUE evaluation enabled',
      'bestmove e2e4',
    ]);
  });
});
