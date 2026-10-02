import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StockfishEngine } from '../src/engine/stockfishWorker';

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
