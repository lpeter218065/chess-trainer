import { parseBestMove, parseInfoLine, type InfoLine } from './uciParser';
import { tl } from '../i18n';
import { abortError } from './analysisScheduler';

export interface Analysis {
  fen: string;
  lines: InfoLine[]; // 按 multipv 升序，每个 multipv 只保留最深的一条
  bestMove: string;
}

/** 进度回调的最低深度：更浅的迭代转瞬即逝且不可靠，不值得刷新界面 */
export const PROGRESS_MIN_DEPTH = 6;

type Job = {
  resolve: (lines: string[]) => void;
  reject: (e: Error) => void;
  untilBestMove: boolean;
  lines: string[];
  /** 设置后每一行都交给它；info 行不再存入 lines（只保留 bestmove 等非 info 行） */
  onLine?: (line: string) => void;
  stopSent?: boolean;
};

type RunOptions = {
  /** 终止行到达时同步调用，早于队列中下一条命令 */
  onDone?: () => void;
  onLine?: (line: string) => void;
};

/** 单个 Stockfish Worker 的 Promise 封装。命令串行执行。 */
export class StockfishEngine {
  private worker: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private current: Job | null = null;
  /** 已被引擎确认（isready → readyok）的 UCI 选项值，用于跳过重复的 setoption 往返 */
  private applied = new Map<string, string | number>();

  constructor(workerUrl: string) {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (e: MessageEvent<string>) => this.onLine(String(e.data));
    this.worker.onerror = (e) => this.current?.reject(new Error(tl('error.engineWorker', { msg: e.message })));
  }

  private onLine(line: string) {
    const job = this.current;
    if (!job) return;
    if (job.onLine) {
      job.onLine(line);
      if (!line.startsWith('info')) job.lines.push(line);
    } else {
      job.lines.push(line);
    }
    const done = job.untilBestMove ? line.startsWith('bestmove') : line === 'readyok' || line === 'uciok';
    if (done) {
      this.current = null;
      job.resolve(job.lines);
    }
  }

  /**
   * 发送命令并等待终止行（readyok/uciok 或 bestmove）。
   * cmds 可为函数：轮到该任务执行时才求值（基于此刻的引擎状态）；返回空数组则不发送、直接完成。
   * onDone 在终止行到达时同步调用，早于队列中下一条命令；onLine 逐行接收输出（见 Job.onLine）。
   */
  private run(cmds: string[] | (() => string[]), untilBestMove: boolean, opts: RunOptions = {}): Promise<string[]> {
    const { onDone, onLine } = opts;
    const p = this.queue.then(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const list = typeof cmds === 'function' ? cmds() : cmds;
          if (list.length === 0) {
            resolve([]);
            return;
          }
          this.current = {
            resolve: (lines) => {
              onDone?.();
              resolve(lines);
            },
            reject,
            untilBestMove,
            lines: [],
            onLine,
          };
          for (const c of list) this.worker.postMessage(c);
        }),
    );
    this.queue = p.catch(() => undefined);
    return p;
  }

  async init(): Promise<void> {
    // 新的 uci 握手：引擎选项回到默认值，缓存作废
    await this.run(() => {
      this.applied.clear();
      return ['uci'];
    }, false);
    await this.run(['isready'], false);
  }

  /**
   * 只发送与已生效值不同的选项（外加 isready）；全部未变则什么也不发。
   * 差异在轮到该任务执行时计算，因此并发调用也按队列顺序得到正确结果；
   * 收到 readyok 后才记入缓存，失败时不记录，下次会重发。
   */
  async setOptions(opts: Record<string, string | number>): Promise<void> {
    let changed: [string, string | number][] = [];
    await this.run(
      () => {
        changed = Object.entries(opts).filter(([k, v]) => this.applied.get(k) !== v);
        if (changed.length === 0) return [];
        return [...changed.map(([k, v]) => `setoption name ${k} value ${v}`), 'isready'];
      },
      false,
      {
        onDone: () => {
          for (const [k, v] of changed) this.applied.set(k, v);
        },
      },
    );
  }

  async newGame(): Promise<void> {
    await this.run(['ucinewgame', 'isready'], false);
  }

  /**
   * signal 被 abort 时：若本次的 go 正在进行则发送 stop（只停自己的搜索，不影响队列里其他任务）；
   * 若 go 尚未发出（例如还在等 setoption 的 readyok），则不再发送 position/go，直接以 AbortError 拒绝。
   *
   * info 行边到边解析（每个 multipv 保留最深的一条）。给了 onProgress 时，每完成一层迭代
   * （收到该深度最后一条 PV，即 multipv === multiPv）且深度 ≥ PROGRESS_MIN_DEPTH、比上次回报更深，
   * 就回报一次当前的部分结果；bestmove 之后或被取消后不再回报。onProgress 抛错不影响搜索。
   */
  async analyze(
    fen: string,
    depth: number,
    multiPv: number,
    moveTimeMs?: number,
    signal?: AbortSignal,
    onProgress?: (partial: Analysis) => void,
  ): Promise<Analysis> {
    const byPv = new Map<number, InfoLine>();
    const sortedLines = () => [...byPv.values()].sort((a, b) => a.multipv - b.multipv);
    let finished = false;
    let lastProgressDepth = 0;
    const onLine = (line: string) => {
      if (finished) return;
      if (line.startsWith('bestmove')) {
        finished = true;
        return;
      }
      const info = parseInfoLine(line);
      if (!info) return;
      const prev = byPv.get(info.multipv);
      if (!prev || prev.depth <= info.depth) byPv.set(info.multipv, info);
      if (!onProgress || signal?.aborted) return;
      const completesDepth = multiPv === 1 || info.multipv === multiPv;
      const top = byPv.get(1);
      if (!completesDepth || info.depth < PROGRESS_MIN_DEPTH || info.depth <= lastProgressDepth || !top) return;
      lastProgressDepth = info.depth;
      try {
        onProgress({ fen, lines: sortedLines(), bestMove: top.pv[0] });
      } catch {
        // 进度只是锦上添花：回调出错不能打断搜索
      }
    };
    let searching = false;
    const onAbort = () => {
      if (searching) this.stop();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    let lines: string[];
    try {
      await this.setOptions({ MultiPV: multiPv });
      if (signal?.aborted) throw abortError();
      const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
      lines = await this.run(
        () => {
          // 轮到该任务时再检查一次：等待队列期间被取消则不发送
          if (signal?.aborted) throw abortError();
          searching = true;
          return [`position fen ${fen}`, go];
        },
        true,
        {
          onDone: () => {
            searching = false;
          },
          onLine,
        },
      );
    } finally {
      searching = false;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
    }
    const bestMove = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bestMove) throw new Error(tl('error.engineNoBestmoveOver'));
    return { fen, lines: sortedLines(), bestMove };
  }

  async bestMove(fen: string, depth: number, moveTimeMs?: number): Promise<string> {
    const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
    const lines = await this.run([`position fen ${fen}`, go], true);
    const bm = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bm) throw new Error(tl('error.engineNoBestmove'));
    return bm;
  }

  /**
   * 中断正在进行的搜索：仅当当前任务是 go（等待 bestmove）时发送 stop，否则什么也不做；
   * 同一次搜索只发送一次，可重复调用。
   * 引擎收到 stop 后仍会回送 bestmove，正在运行的任务照常完成，队列保持一致。
   */
  stop(): void {
    const job = this.current;
    if (!job?.untilBestMove || job.stopSent) return;
    job.stopSent = true;
    this.worker.postMessage('stop');
  }

  terminate() {
    this.worker.terminate();
  }
}
