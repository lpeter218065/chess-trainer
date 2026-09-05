import { lowerEffort, streamChat } from './client';
import { useSettings } from '../store/settings';
import type { LlmPort } from '../store/session';

/** 读取设置页配置、把 quick 映射为低一档推理强度的共享 LlmPort */
export const settingsLlmPort: LlmPort = {
  stream(messages, opts) {
    const { llm: cfg } = useSettings.getState();
    if (!cfg.apiKey) {
      return (async function* () { throw new Error('尚未配置 API Key，请先在设置中填写'); })();
    }
    return streamChat(cfg, messages, {
      temperature: opts.temperature,
      signal: opts.signal,
      maxTokens: opts.maxTokens,
      reasoningEffort: opts.quick ? lowerEffort(cfg.reasoningEffort) : cfg.reasoningEffort,
    });
  },
};
