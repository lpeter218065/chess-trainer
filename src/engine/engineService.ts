import { StockfishEngine, type Analysis } from './stockfishWorker';
import { ANALYSIS_DEPTH, ANALYSIS_MOVETIME_MS, type Difficulty } from './difficulty';
import { createAnalysisScheduler, type AnalysisOptions } from './analysisScheduler';

export type { Analysis };
export { createAnalysisScheduler } from './analysisScheduler';
export type { AnalysisOptions } from './analysisScheduler';

export interface EnginePort {
  analyze(fen: string, multiPv: number, options?: AnalysisOptions): Promise<Analysis>;
  opponentMove(fen: string, difficulty: Difficulty): Promise<string>;
  dispose(): void;
}

/** 两个 worker：analyst 满力 MultiPV，opponent 受 Skill Level 与深度限制 */
export async function createEngineService(workerUrl: string): Promise<EnginePort> {
  const analyst = new StockfishEngine(workerUrl);
  const opponent = new StockfishEngine(workerUrl);
  await Promise.all([analyst.init(), opponent.init()]);
  await analyst.setOptions({ 'Skill Level': 20, MultiPV: 3 });
  const scheduler = createAnalysisScheduler((fen, multiPv) => analyst.analyze(fen, ANALYSIS_DEPTH, multiPv, ANALYSIS_MOVETIME_MS));
  let lastSkill = -1;
  return {
    analyze: scheduler.analyze,
    async opponentMove(fen, difficulty) {
      if (difficulty.skillLevel !== lastSkill) {
        await opponent.setOptions({ 'Skill Level': difficulty.skillLevel });
        lastSkill = difficulty.skillLevel;
      }
      return opponent.bestMove(fen, difficulty.depth, difficulty.moveTimeMs);
    },
    dispose() {
      scheduler.dispose();
      analyst.terminate();
      opponent.terminate();
    },
  };
}
