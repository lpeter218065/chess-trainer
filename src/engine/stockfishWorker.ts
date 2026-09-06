import { parseBestMove, parseInfoLine, type InfoLine } from './uciParser';

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

  constructor(workerUrl: string) {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (e: MessageEvent<string>) => this.onLine(String(e.data));
    this.worker.onerror = (e) => this.current?.reject(new Error(`引擎 worker 错误：${e.message}`));
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

  /** 发送命令并等待终止行（readyok/uciok 或 bestmove） */
  private run(cmds: string[], untilBestMove: boolean): Promise<string[]> {
    const p = this.queue.then(
      () =>
        new Promise<string[]>((resolve, reject) => {
          this.current = { resolve, reject, untilBestMove, lines: [] };
          for (const c of cmds) this.worker.postMessage(c);
        }),
    );
    this.queue = p.catch(() => undefined);
    return p;
  }

  async init(): Promise<void> {
    await this.run(['uci'], false);
    await this.run(['isready'], false);
  }

  async setOptions(opts: Record<string, string | number>): Promise<void> {
    const cmds = Object.entries(opts).map(([k, v]) => `setoption name ${k} value ${v}`);
    await this.run([...cmds, 'isready'], false);
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
    if (!bestMove) throw new Error('引擎没有返回 bestmove（可能已终局）');
    return { fen, lines: [...byPv.values()].sort((a, b) => a.multipv - b.multipv), bestMove };
  }

  async bestMove(fen: string, depth: number, moveTimeMs?: number): Promise<string> {
    const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
    const lines = await this.run([`position fen ${fen}`, go], true);
    const bm = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bm) throw new Error('引擎没有返回 bestmove');
    return bm;
  }

  terminate() {
    this.worker.terminate();
  }
}
