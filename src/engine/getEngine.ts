import { createEngineService, type EnginePort } from './engineService';
import { ENGINE_JS_URL } from './enginePath.generated';

let enginePromise: Promise<EnginePort> | null = null;

export function getEngine(): Promise<EnginePort> {
  if (!enginePromise) enginePromise = createEngineService(ENGINE_JS_URL);
  return enginePromise;
}

export function disposeEngine(): void {
  void enginePromise?.then((e) => e.dispose());
  enginePromise = null;
}
