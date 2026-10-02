import type { Analysis } from './stockfishWorker';

export type AnalysisPriority = 'foreground' | 'background';

export interface AnalysisLimits {
  depth?: number;
  moveTimeMs?: number;
  /** Aborted by the scheduler when the started request is cancelled or the scheduler is disposed. */
  signal?: AbortSignal;
}

export interface AnalysisOptions extends AnalysisLimits {
  priority?: AnalysisPriority;
  /** Caller's cancellation signal; the runner receives a separate, scheduler-owned one. */
  signal?: AbortSignal;
}

export type AnalysisRunner = (fen: string, multiPv: number, limits?: AnalysisLimits) => Promise<Analysis>;

export interface AnalysisScheduler {
  analyze(fen: string, multiPv: number, options?: AnalysisOptions): Promise<Analysis>;
  dispose(): void;
}

type PendingRequest = {
  fen: string;
  multiPv: number;
  priority: AnalysisPriority;
  depth?: number;
  moveTimeMs?: number;
  signal?: AbortSignal;
  resolve: (analysis: Analysis) => void;
  reject: (reason: unknown) => void;
  settled: boolean;
  started: boolean;
  abortListener?: () => void;
  /** Created when the request starts; its signal is handed to the runner. */
  controller?: AbortController;
};

export function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('The operation was aborted', 'AbortError');
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function disposedError(): Error {
  return new Error('Analysis scheduler has been disposed');
}

/** One runner (worker) and the request it is currently running, if any. */
type Slot = {
  run: AnalysisRunner;
  active: PendingRequest | null;
};

/**
 * Runs complete analysis calls on one or more runner slots while allowing current
 * positions to jump queued background work. Each slot runs one request at a time;
 * with several runners the next request goes to the first idle slot in array order.
 */
export function createAnalysisScheduler(runners: AnalysisRunner | AnalysisRunner[]): AnalysisScheduler {
  const slots: Slot[] = (Array.isArray(runners) ? runners : [runners]).map((run) => ({ run, active: null }));
  if (slots.length === 0) throw new Error('createAnalysisScheduler needs at least one runner');
  const foreground: PendingRequest[] = [];
  const background: PendingRequest[] = [];
  let disposed = false;

  const removePending = (request: PendingRequest) => {
    const queue = request.priority === 'foreground' ? foreground : background;
    const index = queue.indexOf(request);
    if (index >= 0) queue.splice(index, 1);
  };

  const removeAbortListener = (request: PendingRequest) => {
    if (request.signal && request.abortListener) {
      request.signal.removeEventListener('abort', request.abortListener);
      request.abortListener = undefined;
    }
  };

  const resolveRequest = (request: PendingRequest, analysis: Analysis) => {
    if (request.settled) return;
    request.settled = true;
    removeAbortListener(request);
    request.resolve(analysis);
  };

  const rejectRequest = (request: PendingRequest, reason: unknown) => {
    if (request.settled) return;
    request.settled = true;
    removeAbortListener(request);
    request.reject(reason);
  };

  let drain: () => void;
  const abortRequest = (request: PendingRequest) => {
    if (request.settled) return;
    if (!request.started) {
      removePending(request);
      rejectRequest(request, abortError());
      drain();
      return;
    }
    // Settle this caller now and ask the runner to cut its search short. The worker
    // slot stays occupied until the runner's promise settles, so the next request
    // never overlaps the stopped search; that late result or error is ignored.
    rejectRequest(request, abortError());
    request.controller?.abort();
  };

  const nextPending = (): PendingRequest | undefined => {
    for (;;) {
      const request = foreground.shift() ?? background.shift();
      if (!request || !request.settled) return request;
    }
  };

  const start = (slot: Slot, request: PendingRequest) => {
    request.started = true;
    request.controller = new AbortController();
    slot.active = request;
    let operation: Promise<Analysis>;
    try {
      // `run` is one complete operation: its internal option update and search
      // remain together before another request can acquire the worker slot.
      operation = Promise.resolve(slot.run(request.fen, request.multiPv, {
        depth: request.depth,
        moveTimeMs: request.moveTimeMs,
        signal: request.controller.signal,
      }));
    } catch (error) {
      operation = Promise.reject(error);
    }

    void operation
      .then(
        (analysis) => resolveRequest(request, analysis),
        (error: unknown) => rejectRequest(request, error),
      )
      .finally(() => {
        if (slot.active === request) slot.active = null;
        if (!disposed) drain();
      });
  };

  drain = () => {
    while (!disposed) {
      const slot = slots.find((candidate) => !candidate.active);
      if (!slot) return;
      const request = nextPending();
      if (!request) return;
      start(slot, request);
    }
  };

  const analyze = (fen: string, multiPv: number, options?: AnalysisOptions): Promise<Analysis> => {
    const signal = options?.signal;
    return new Promise<Analysis>((resolve, reject) => {
      if (disposed) {
        reject(disposedError());
        return;
      }
      if (signal?.aborted) {
        reject(abortError());
        return;
      }

      const request: PendingRequest = {
        fen,
        multiPv,
        priority: options?.priority ?? 'foreground',
        depth: options?.depth,
        moveTimeMs: options?.moveTimeMs,
        signal,
        resolve,
        reject,
        settled: false,
        started: false,
      };
      if (signal) {
        request.abortListener = () => abortRequest(request);
        signal.addEventListener('abort', request.abortListener, { once: true });
        // Cover an abort that races listener registration in unusual AbortSignal implementations.
        if (signal.aborted) {
          abortRequest(request);
          return;
        }
      }
      (request.priority === 'foreground' ? foreground : background).push(request);
      drain();
    });
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const queued = [...foreground, ...background];
    foreground.length = 0;
    background.length = 0;
    for (const request of queued) rejectRequest(request, disposedError());
    for (const slot of slots) {
      if (!slot.active) continue;
      rejectRequest(slot.active, disposedError());
      slot.active.controller?.abort();
    }
  };

  return { analyze, dispose };
}
