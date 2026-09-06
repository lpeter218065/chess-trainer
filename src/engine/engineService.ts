import { StockfishEngine, type Analysis } from './stockfishWorker';
import { ANALYSIS_DEPTH, ANALYSIS_MOVETIME_MS, type Difficulty } from './difficulty';

export type { Analysis };

export interface EnginePort {
  analyze(fen: string, multiPv: number): Promise<Analysis>;
  opponentMove(fen: string, difficulty: Difficulty): Promise<string>;
  dispose(): void;
}

/** 两个 worker：analyst 满力 MultiPV，opponent 受 Skill Level 与深度限制 */
export async function createEngineService(workerUrl: string): Promise<EnginePort> {
  const analyst = new StockfishEngine(workerUrl);
  const opponent = new StockfishEngine(workerUrl);
  await Promise.all([analyst.init(), opponent.init()]);
  await analyst.setOptions({ 'Skill Level': 20, MultiPV: 3 });
  let lastSkill = -1;
  return {
    analyze: (fen, multiPv) => analyst.analyze(fen, ANALYSIS_DEPTH, multiPv, ANALYSIS_MOVETIME_MS),
    async opponentMove(fen, difficulty) {
      if (difficulty.skillLevel !== lastSkill) {
        await opponent.setOptions({ 'Skill Level': difficulty.skillLevel });
        lastSkill = difficulty.skillLevel;
      }
      return opponent.bestMove(fen, difficulty.depth, difficulty.moveTimeMs);
    },
    dispose() {
      analyst.terminate();
      opponent.terminate();
    },
  };
}
