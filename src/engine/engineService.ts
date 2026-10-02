import { StockfishEngine, type Analysis } from './stockfishWorker';
import { ANALYSIS_DEPTH, ANALYSIS_MOVETIME_MS, type Difficulty } from './difficulty';
import {
  abortError,
  createAnalysisScheduler,
  type AnalysisLimits,
  type AnalysisOptions,
  type AnalysisRunner,
} from './analysisScheduler';

export type { Analysis };
export { createAnalysisScheduler } from './analysisScheduler';
export type { AnalysisOptions } from './analysisScheduler';

export interface EnginePort {
  analyze(fen: string, multiPv: number, options?: AnalysisOptions): Promise<Analysis>;
  opponentMove(fen: string, difficulty: Difficulty): Promise<string>;
  dispose(): void;
}

/** createEngineService 用到的 StockfishEngine 能力，便于测试注入假引擎 */
export type StockfishEngineLike = Pick<
  StockfishEngine,
  'init' | 'setOptions' | 'analyze' | 'bestMove' | 'stop' | 'terminate'
>;

export interface EngineServiceDeps {
  createEngine?: (workerUrl: string) => StockfishEngineLike;
}

/**
 * 两个 worker：analyst 满力 MultiPV；opponent 走棋时受 Skill Level 与深度限制，空闲时也作为第二个分析槽位。
 * 分析请求交给第一个空闲的槽位（analyst 优先）。
 */
export async function createEngineService(workerUrl: string, deps: EngineServiceDeps = {}): Promise<EnginePort> {
  const createEngine = deps.createEngine ?? ((url: string) => new StockfishEngine(url));
  const analyst = createEngine(workerUrl);
  const opponent = createEngine(workerUrl);
  await Promise.all([analyst.init(), opponent.init()]);
  await analyst.setOptions({ 'Skill Level': 20, MultiPV: 3 });

  // 请求被取消时 analyze 自己负责发送 stop（或在 go 发出前放弃）；只停传入的那台引擎
  const analyzeOn = (engine: StockfishEngineLike, fen: string, multiPv: number, limits?: AnalysisLimits) => {
    const signal = limits?.signal;
    if (signal?.aborted) throw abortError();
    return engine.analyze(
      fen,
      limits?.depth ?? ANALYSIS_DEPTH,
      multiPv,
      limits?.moveTimeMs ?? ANALYSIS_MOVETIME_MS,
      signal,
    );
  };

  // opponent 同时服务 opponentMove 与分析槽位，两者都是「setOptions + 搜索」两步。
  // StockfishEngine 只串行单条命令，两步之间另一方的 setoption 可能插进来（例如分析在 Skill Level 3 下跑、
  // 或走棋在满力下跑），所以这里把每个两步操作整体串行。
  // 代价：分析占用 opponent 时发起的 opponentMove 要排在这次分析之后（最多一次分析的 movetime），
  // 反之亦然；这是可以接受的。
  let opponentTail: Promise<unknown> = Promise.resolve();
  const withOpponent = <T>(task: () => Promise<T>): Promise<T> => {
    const result = opponentTail.then(task);
    opponentTail = result.catch(() => undefined);
    return result;
  };

  const analystRunner: AnalysisRunner = async (fen, multiPv, limits) => analyzeOn(analyst, fen, multiPv, limits);
  const opponentRunner: AnalysisRunner = (fen, multiPv, limits) =>
    withOpponent(async () => {
      // 排队等待期间可能已被取消：不再改选项
      if (limits?.signal?.aborted) throw abortError();
      await opponent.setOptions({ 'Skill Level': 20 });
      return analyzeOn(opponent, fen, multiPv, limits);
    });
  const scheduler = createAnalysisScheduler([analystRunner, opponentRunner]);

  return {
    analyze: scheduler.analyze,
    opponentMove(fen, difficulty) {
      return withOpponent(async () => {
        // StockfishEngine 缓存已生效的选项，未变时不会产生往返。
        // 分析会把 MultiPV 改成 >1，走棋前恢复为默认的 1，否则满力档的搜索被多条 PV 摊薄
        await opponent.setOptions({ 'Skill Level': difficulty.skillLevel, MultiPV: 1 });
        return opponent.bestMove(fen, difficulty.depth, difficulty.moveTimeMs);
      });
    },
    dispose() {
      scheduler.dispose();
      analyst.terminate();
      opponent.terminate();
    },
  };
}
