import { describe, expect, it } from 'vitest';
import { createAnalysisScheduler, type AnalysisRunner } from '../src/engine/analysisScheduler';
import type { Analysis } from '../src/engine/stockfishWorker';

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(reason?: unknown): void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function analysis(fen: string): Analysis {
  return { fen, bestMove: 'e2e4', lines: [] };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createAnalysisScheduler', () => {
  it('runs foreground requests before waiting background requests', async () => {
    const calls: string[] = [];
    const operations: Deferred<Analysis>[] = [];
    const run: AnalysisRunner = (fen) => {
      calls.push(fen);
      const operation = deferred<Analysis>();
      operations.push(operation);
      return operation.promise;
    };
    const scheduler = createAnalysisScheduler(run);
    const first = scheduler.analyze('active', 3, { priority: 'background' });
    const background = scheduler.analyze('background', 3, { priority: 'background' });
    const foreground = scheduler.analyze('foreground', 3);
    expect(calls).toEqual(['active']);
    operations[0].resolve(analysis('active'));
    await flush();
    expect(calls).toEqual(['active', 'foreground']);
    operations[1].resolve(analysis('foreground'));
    await flush();
    expect(calls).toEqual(['active', 'foreground', 'background']);
    operations[2].resolve(analysis('background'));
    await expect(first).resolves.toMatchObject({ fen: 'active' });
    await expect(foreground).resolves.toMatchObject({ fen: 'foreground' });
    await expect(background).resolves.toMatchObject({ fen: 'background' });
    scheduler.dispose();
  });

  it('forwards depth and moveTimeMs to the runner', async () => {
    const seen: Array<{ fen: string; limits?: { depth?: number; moveTimeMs?: number } }> = [];
    const scheduler = createAnalysisScheduler((fen, _multiPv, limits) => {
      seen.push({ fen, limits });
      return Promise.resolve(analysis(fen));
    });
    await scheduler.analyze('review', 2, { depth: 12, moveTimeMs: 300 });
    expect(seen[0]).toEqual({
      fen: 'review',
      limits: { depth: 12, moveTimeMs: 300, signal: expect.any(AbortSignal) },
    });
    scheduler.dispose();
  });

  it('keeps FIFO order within each priority', async () => {
    const calls: string[] = [];
    const operations: Deferred<Analysis>[] = [];
    const scheduler = createAnalysisScheduler((fen) => {
      calls.push(fen);
      const operation = deferred<Analysis>();
      operations.push(operation);
      return operation.promise;
    });
    const requests = [
      scheduler.analyze('one', 1),
      scheduler.analyze('two', 1),
      scheduler.analyze('three', 1),
    ];
    expect(calls).toEqual(['one']);
    for (let i = 0; i < operations.length; i++) {
      operations[i].resolve(analysis(['one', 'two', 'three'][i]));
      await flush();
    }
    await Promise.all(requests);
    expect(calls).toEqual(['one', 'two', 'three']);
    scheduler.dispose();
  });

  it('keeps one complete operation active until it settles', async () => {
    const operations: Deferred<Analysis>[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const scheduler = createAnalysisScheduler(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const operation = deferred<Analysis>();
      operations.push(operation);
      void operation.promise.finally(() => { inFlight--; });
      return operation.promise;
    });
    const first = scheduler.analyze('first', 1);
    const second = scheduler.analyze('second', 1);
    expect(maxInFlight).toBe(1);
    operations[0].resolve(analysis('first'));
    await flush();
    expect(maxInFlight).toBe(1);
    expect(operations).toHaveLength(2);
    operations[1].resolve(analysis('second'));
    await expect(first).resolves.toMatchObject({ fen: 'first' });
    await expect(second).resolves.toMatchObject({ fen: 'second' });
    expect(maxInFlight).toBe(1);
    scheduler.dispose();
  });

  it('removes an aborted queued request and does not run it', async () => {
    const calls: string[] = [];
    const operation = deferred<Analysis>();
    const scheduler = createAnalysisScheduler((fen) => {
      calls.push(fen);
      return operation.promise;
    });
    const active = scheduler.analyze('active', 1);
    const controller = new AbortController();
    const queued = scheduler.analyze('cancelled', 1, { signal: controller.signal });
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    operation.resolve(analysis('active'));
    await expect(active).resolves.toMatchObject({ fen: 'active' });
    expect(calls).toEqual(['active']);
    scheduler.dispose();
  });

  it('settles an aborted active caller without releasing the worker slot', async () => {
    const calls: string[] = [];
    const operations: Deferred<Analysis>[] = [];
    const scheduler = createAnalysisScheduler((fen) => {
      calls.push(fen);
      const operation = deferred<Analysis>();
      operations.push(operation);
      return operation.promise;
    });
    const controller = new AbortController();
    const active = scheduler.analyze('stale', 1, { signal: controller.signal });
    const next = scheduler.analyze('current', 1);
    controller.abort();
    await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toEqual(['stale']);
    operations[0].resolve(analysis('stale'));
    await flush();
    expect(calls).toEqual(['stale', 'current']);
    operations[1].resolve(analysis('current'));
    await expect(next).resolves.toMatchObject({ fen: 'current' });
    scheduler.dispose();
  });

  it('aborts the runner signal when a started request is aborted', async () => {
    const signals: AbortSignal[] = [];
    const operations: Deferred<Analysis>[] = [];
    const scheduler = createAnalysisScheduler((_fen, _multiPv, limits) => {
      signals.push(limits!.signal!);
      const operation = deferred<Analysis>();
      operations.push(operation);
      return operation.promise;
    });
    const controller = new AbortController();
    const active = scheduler.analyze('stale', 1, { signal: controller.signal });
    expect(signals[0].aborted).toBe(false);
    // 调用方的 signal 与交给 runner 的 signal 不是同一个对象
    expect(signals[0]).not.toBe(controller.signal);
    controller.abort();
    expect(signals[0].aborted).toBe(true);
    await expect(active).rejects.toMatchObject({ name: 'AbortError' });
    operations[0].resolve(analysis('stale'));
    scheduler.dispose();
  });

  it('starts the next request only after a stopped runner settles, ignoring its rejection', async () => {
    const calls: string[] = [];
    const signals: AbortSignal[] = [];
    const operations: Deferred<Analysis>[] = [];
    const scheduler = createAnalysisScheduler((fen, _multiPv, limits) => {
      calls.push(fen);
      signals.push(limits!.signal!);
      const operation = deferred<Analysis>();
      operations.push(operation);
      return operation.promise;
    });
    const controller = new AbortController();
    const stale = scheduler.analyze('stale', 1, { signal: controller.signal });
    const next = scheduler.analyze('current', 1);
    controller.abort();
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    await flush();
    expect(calls).toEqual(['stale']);
    // 被 stop 的搜索可能以 bestmove (none) 之类的错误结束：调用方已结算，错误应被吞掉
    operations[0].reject(new Error('no bestmove'));
    await flush();
    expect(calls).toEqual(['stale', 'current']);
    expect(signals[1].aborted).toBe(false);
    operations[1].resolve(analysis('current'));
    await expect(next).resolves.toMatchObject({ fen: 'current' });
    scheduler.dispose();
  });

  it('aborts the active runner signal on dispose', async () => {
    const signals: AbortSignal[] = [];
    const operation = deferred<Analysis>();
    const scheduler = createAnalysisScheduler((_fen, _multiPv, limits) => {
      signals.push(limits!.signal!);
      return operation.promise;
    });
    const active = scheduler.analyze('active', 1);
    expect(signals[0].aborted).toBe(false);
    scheduler.dispose();
    expect(signals[0].aborted).toBe(true);
    await expect(active).rejects.toThrow('disposed');
    operation.reject(new Error('terminated'));
    await flush();
  });

  it('recovers after a failed operation', async () => {
    const calls: string[] = [];
    const operations: Deferred<Analysis>[] = [];
    const scheduler = createAnalysisScheduler((fen) => {
      calls.push(fen);
      const operation = deferred<Analysis>();
      operations.push(operation);
      return operation.promise;
    });
    const failed = scheduler.analyze('failed', 1);
    const next = scheduler.analyze('next', 1);
    operations[0].reject(new Error('engine failure'));
    await expect(failed).rejects.toThrow('engine failure');
    await flush();
    expect(calls).toEqual(['failed', 'next']);
    operations[1].resolve(analysis('next'));
    await expect(next).resolves.toMatchObject({ fen: 'next' });
    scheduler.dispose();
  });

  it('rejects queued and active callers on dispose and dispatches nothing after it', async () => {
    const calls: string[] = [];
    const operation = deferred<Analysis>();
    const scheduler = createAnalysisScheduler((fen) => {
      calls.push(fen);
      return operation.promise;
    });
    const active = scheduler.analyze('active', 1);
    const queued = scheduler.analyze('queued', 1);
    scheduler.dispose();
    await expect(active).rejects.toThrow('disposed');
    await expect(queued).rejects.toThrow('disposed');
    operation.resolve(analysis('active'));
    await flush();
    expect(calls).toEqual(['active']);
    await expect(scheduler.analyze('after-dispose', 1)).rejects.toThrow('disposed');
  });
});

describe('createAnalysisScheduler with several runners', () => {
  type Call = { slot: number; fen: string; signal: AbortSignal; operation: Deferred<Analysis> };

  function slots(count: number) {
    const calls: Call[] = [];
    const runners: AnalysisRunner[] = Array.from({ length: count }, (_, slot) => (fen, _multiPv, limits) => {
      const operation = deferred<Analysis>();
      calls.push({ slot, fen, signal: limits!.signal!, operation });
      return operation.promise;
    });
    const started = () => calls.map(({ slot, fen }) => `${slot}:${fen}`);
    return { calls, runners, started };
  }

  it.each([0, 1])('runs two foreground requests at once and the third when slot %i settles', async (settling) => {
    const { calls, runners, started } = slots(2);
    const scheduler = createAnalysisScheduler(runners);
    const one = scheduler.analyze('one', 1);
    const two = scheduler.analyze('two', 1);
    const three = scheduler.analyze('three', 1);
    expect(started()).toEqual(['0:one', '1:two']);

    calls[settling].operation.resolve(analysis(calls[settling].fen));
    await flush();
    expect(started()).toEqual(['0:one', '1:two', `${settling}:three`]);

    calls[1 - settling].operation.resolve(analysis(calls[1 - settling].fen));
    calls[2].operation.resolve(analysis('three'));
    await expect(Promise.all([one, two, three])).resolves.toMatchObject([
      { fen: 'one' },
      { fen: 'two' },
      { fen: 'three' },
    ]);
    scheduler.dispose();
  });

  it('gives a freed slot the next foreground request before waiting background work', async () => {
    const { calls, runners, started } = slots(2);
    const scheduler = createAnalysisScheduler(runners);
    const requests = [
      scheduler.analyze('bg-1', 1, { priority: 'background' }),
      scheduler.analyze('bg-2', 1, { priority: 'background' }),
      scheduler.analyze('bg-3', 1, { priority: 'background' }),
      scheduler.analyze('current', 1),
    ];
    expect(started()).toEqual(['0:bg-1', '1:bg-2']);
    calls[1].operation.resolve(analysis('bg-2'));
    await flush();
    expect(started()).toEqual(['0:bg-1', '1:bg-2', '1:current']);
    calls[0].operation.resolve(analysis('bg-1'));
    await flush();
    expect(started()).toEqual(['0:bg-1', '1:bg-2', '1:current', '0:bg-3']);
    calls[2].operation.resolve(analysis('current'));
    calls[3].operation.resolve(analysis('bg-3'));
    await Promise.all(requests);
    scheduler.dispose();
  });

  it('still serialises with a single runner given as an array', async () => {
    const { calls, runners, started } = slots(1);
    const scheduler = createAnalysisScheduler(runners);
    const first = scheduler.analyze('first', 1);
    const second = scheduler.analyze('second', 1);
    expect(started()).toEqual(['0:first']);
    calls[0].operation.resolve(analysis('first'));
    await flush();
    expect(started()).toEqual(['0:first', '0:second']);
    calls[1].operation.resolve(analysis('second'));
    await expect(first).resolves.toMatchObject({ fen: 'first' });
    await expect(second).resolves.toMatchObject({ fen: 'second' });
    scheduler.dispose();
  });

  it('keeps an aborted slot occupied until its runner settles while the other slot keeps working', async () => {
    const { calls, runners, started } = slots(2);
    const scheduler = createAnalysisScheduler(runners);
    const controller = new AbortController();
    const stale = scheduler.analyze('stale', 1, { signal: controller.signal });
    const other = scheduler.analyze('other', 1);
    const next = scheduler.analyze('next', 1);
    controller.abort();
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].signal.aborted).toBe(false);
    await flush();
    expect(started()).toEqual(['0:stale', '1:other']);

    calls[0].operation.reject(new Error('no bestmove'));
    await flush();
    expect(started()).toEqual(['0:stale', '1:other', '0:next']);
    calls[1].operation.resolve(analysis('other'));
    calls[2].operation.resolve(analysis('next'));
    await expect(other).resolves.toMatchObject({ fen: 'other' });
    await expect(next).resolves.toMatchObject({ fen: 'next' });
    scheduler.dispose();
  });

  it('aborts every active slot on dispose', async () => {
    const { calls, runners, started } = slots(2);
    const scheduler = createAnalysisScheduler(runners);
    const one = scheduler.analyze('one', 1);
    const two = scheduler.analyze('two', 1);
    const queued = scheduler.analyze('queued', 1);
    scheduler.dispose();
    expect(calls.map((call) => call.signal.aborted)).toEqual([true, true]);
    await expect(one).rejects.toThrow('disposed');
    await expect(two).rejects.toThrow('disposed');
    await expect(queued).rejects.toThrow('disposed');
    for (const call of calls) call.operation.reject(new Error('terminated'));
    await flush();
    expect(started()).toEqual(['0:one', '1:two']);
  });

  it('rejects an empty runner list', () => {
    expect(() => createAnalysisScheduler([])).toThrow();
  });
});

