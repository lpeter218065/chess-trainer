import type { Analysis } from './stockfishWorker';

export type AnalysisPriority = 'foreground' | 'background';

export interface AnalysisLimits {
  depth?: number;
  moveTimeMs?: number;
}

export interface AnalysisOptions extends AnalysisLimits {
  priority?: AnalysisPriority;
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
};

function abortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('The operation was aborted', 'AbortError');
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function disposedError(): Error {
  return new Error('Analysis scheduler has been disposed');
}

/** Serializes complete analysis calls while allowing current positions to jump queued background work. */
export function createAnalysisScheduler(run: AnalysisRunner): AnalysisScheduler {
  const foreground: PendingRequest[] = [];
  const background: PendingRequest[] = [];
  let active: PendingRequest | null = null;
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
    // The worker search cannot be interrupted safely; only settle this caller.
    rejectRequest(request, abortError());
  };

  drain = () => {
    if (disposed || active) return;
    const request = foreground.shift() ?? background.shift();
    if (!request) return;
    if (request.settled) {
      drain();
      return;
    }

    request.started = true;
    active = request;
    let operation: Promise<Analysis>;
    try {
      // `run` is one complete operation: its internal option update and search
      // remain together before another request can acquire the worker slot.
      operation = Promise.resolve(run(request.fen, request.multiPv, {
        depth: request.depth,
        moveTimeMs: request.moveTimeMs,
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
        if (active === request) active = null;
        if (!disposed) drain();
      });
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
    if (active) rejectRequest(active, disposedError());
  };

  return { analyze, dispose };
}
