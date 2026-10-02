import { parseBestMove, parseInfoLine, type InfoLine } from './uciParser';
import { tl } from '../i18n';

export interface Analysis {
  fen: string;
  lines: InfoLine[]; // 按 multipv 升序，每个 multipv 只保留最深的一条
  bestMove: string;
}

type Job = { resolve: (lines: string[]) => void; reject: (e: Error) => void; untilBestMove: boolean; lines: string[] };

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
    job.lines.push(line);
    const done = job.untilBestMove ? line.startsWith('bestmove') : line === 'readyok' || line === 'uciok';
    if (done) {
      this.current = null;
      job.resolve(job.lines);
    }
  }

  /**
   * 发送命令并等待终止行（readyok/uciok 或 bestmove）。
   * cmds 可为函数：轮到该任务执行时才求值（基于此刻的引擎状态）；返回空数组则不发送、直接完成。
   * onDone 在终止行到达时同步调用，早于队列中下一条命令。
   */
  private run(cmds: string[] | (() => string[]), untilBestMove: boolean, onDone?: () => void): Promise<string[]> {
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
      () => {
        for (const [k, v] of changed) this.applied.set(k, v);
      },
    );
  }

  async newGame(): Promise<void> {
    await this.run(['ucinewgame', 'isready'], false);
  }

  async analyze(fen: string, depth: number, multiPv: number, moveTimeMs?: number): Promise<Analysis> {
    await this.setOptions({ MultiPV: multiPv });
    const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
    const lines = await this.run([`position fen ${fen}`, go], true);
    const byPv = new Map<number, InfoLine>();
    for (const l of lines) {
      const info = parseInfoLine(l);
      if (info && (!byPv.has(info.multipv) || byPv.get(info.multipv)!.depth <= info.depth)) byPv.set(info.multipv, info);
    }
    const bestMove = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bestMove) throw new Error(tl('error.engineNoBestmoveOver'));
    return { fen, lines: [...byPv.values()].sort((a, b) => a.multipv - b.multipv), bestMove };
  }

  async bestMove(fen: string, depth: number, moveTimeMs?: number): Promise<string> {
    const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
    const lines = await this.run([`position fen ${fen}`, go], true);
    const bm = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bm) throw new Error(tl('error.engineNoBestmove'));
    return bm;
  }

  terminate() {
    this.worker.terminate();
  }
}
