import { StockfishEngine, type Analysis } from './stockfishWorker';
import { ANALYSIS_DEPTH, ANALYSIS_MOVETIME_MS, type Difficulty } from './difficulty';
import { abortError, createAnalysisScheduler, type AnalysisOptions } from './analysisScheduler';

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

/** 两个 worker：analyst 满力 MultiPV，opponent 受 Skill Level 与深度限制 */
export async function createEngineService(workerUrl: string, deps: EngineServiceDeps = {}): Promise<EnginePort> {
  const createEngine = deps.createEngine ?? ((url: string) => new StockfishEngine(url));
  const analyst = createEngine(workerUrl);
  const opponent = createEngine(workerUrl);
  await Promise.all([analyst.init(), opponent.init()]);
  await analyst.setOptions({ 'Skill Level': 20, MultiPV: 3 });
  const scheduler = createAnalysisScheduler(async (fen, multiPv, limits) => {
    const signal = limits?.signal;
    if (signal?.aborted) throw abortError();
    // 请求被取消时让引擎提前结束当前搜索；搜索结束后摘掉监听，避免误停之后的搜索
    const onAbort = () => analyst.stop();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      return await analyst.analyze(
        fen,
        limits?.depth ?? ANALYSIS_DEPTH,
        multiPv,
        limits?.moveTimeMs ?? ANALYSIS_MOVETIME_MS,
      );
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
  });
  return {
    analyze: scheduler.analyze,
    async opponentMove(fen, difficulty) {
      // StockfishEngine 缓存已生效的选项，Skill Level 未变时不会产生往返
      await opponent.setOptions({ 'Skill Level': difficulty.skillLevel });
      return opponent.bestMove(fen, difficulty.depth, difficulty.moveTimeMs);
    },
    dispose() {
      scheduler.dispose();
      analyst.terminate();
      opponent.terminate();
    },
  };
}
