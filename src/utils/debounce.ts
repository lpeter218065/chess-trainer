/** 引擎切步防抖（毫秒） */
export const ANALYZE_DEBOUNCE_MS = 350;
/** 大模型防抖：快速走子/切局面只请求停下后的那一次。流可 abort，所以只需吸收连击 */
export const LLM_DEBOUNCE_MS = 120;

export function createDebouncer(delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let superseded: (() => void) | null = null;
  return {
    /** onSuperseded：被后来的 schedule/cancel 挤掉时调用，避免 whenIdle 挂死 */
    schedule(fn: () => void, onSuperseded?: () => void) {
      if (timer) clearTimeout(timer);
      superseded?.();
      superseded = onSuperseded ?? null;
      timer = setTimeout(() => {
        timer = null;
        superseded = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      superseded?.();
      superseded = null;
    },
  };
}
