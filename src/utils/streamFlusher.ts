/**
 * 把逐 token 到达的流式文本合并为“首个 chunk 立即刷、之后每 intervalMs 至多一次”的写入，
 * 避免每个 token 触发一次 store set → 全页重渲染。
 * 调用方在流结束 / 出错时调用 finish() 或 cancel()。
 */
export function createStreamFlusher(flush: (text: string) => void, intervalMs = 80) {
  let acc = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const fire = () => {
    timer = null;
    if (!dirty) return;
    dirty = false;
    flush(acc);
  };

  return {
    /** 当前累计文本（含尚未 flush 的部分） */
    get text() {
      return acc;
    },
    push(chunk: string) {
      acc += chunk;
      dirty = true;
      if (timer) return; // 间隔内：等 trailing flush
      // 间隔外：立即刷（首字尽快可见），并开启一个窗口吸收后续 token
      fire();
      timer = setTimeout(fire, intervalMs);
    },
    /** 流正常结束：把剩余文本刷出并返回全文 */
    finish(): string {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (dirty) {
        dirty = false;
        flush(acc);
      }
      return acc;
    },
    /** 流被中断：丢弃未刷出的部分 */
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      dirty = false;
    },
  };
}
