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
