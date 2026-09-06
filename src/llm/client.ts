import { createSseParser, extractDelta } from './sseParser';
import { llmFetch } from './http';
import { debugLog } from '../debug/log';

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export interface LlmConfig {
  baseUrl: string; // 如 https://api.openai.com/v1
  apiKey: string;
  model: string;
  /** 推理模型用；未设则不传，兼容普通 chat 接口 */
  reasoningEffort?: ReasoningEffort;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

/** 去掉末尾斜杠与误填的 /chat/completions */
export function normalizeLlmBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeLlmBaseUrl(baseUrl)}/chat/completions`;
}

export function formatLlmHttpError(status: number, body: string, cfg: LlmConfig): string {
  const url = chatCompletionsUrl(cfg.baseUrl);
  const snippet = body.slice(0, 200).trim();
  if (status === 404) {
    if (/route .* not found/i.test(body)) {
      return `模型服务返回 404：接口路径不存在。Base URL 应填到 /v1（如 https://api.openai.com/v1），勿含 /chat/completions。当前 Base URL：${cfg.baseUrl}，请求：${url}${snippet ? `。${snippet}` : ''}`;
    }
    const detail = snippet && snippet !== '""' ? `：${snippet}` : '';
    return `模型服务返回 404${detail}。接口 ${url} 可达，更可能是模型「${cfg.model}」不存在或当前 Key 无权使用，请在设置中核对模型名。`;
  }
  return `模型服务返回 ${status}${snippet ? `：${snippet}` : ''}`;
}

export interface StreamOptions {
  temperature?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** 输出上限（max_completion_tokens），限制尾部延迟 */
  maxTokens?: number;
  /** 覆盖 cfg.reasoningEffort；追问/提示等短回答用更低档 */
  reasoningEffort?: ReasoningEffort;
}

/** gpt-5.6-sol 等模型不支持 minimal，降档地板为 low */
const EFFORT_ORDER: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

/** 比配置低一档的推理强度；low / none 不再降；遗留的 minimal 归一为 low */
export function lowerEffort(effort: ReasoningEffort | undefined): ReasoningEffort | undefined {
  if (!effort || effort === 'none') return effort;
  if (effort === 'minimal') return 'low';
  const idx = EFFORT_ORDER.indexOf(effort);
  if (idx <= 0) return 'low';
  return EFFORT_ORDER[Math.max(1, idx - 1)];
}

export async function* streamChat(cfg: LlmConfig, messages: ChatMessage[], opts: StreamOptions = {}): AsyncGenerator<string> {
  const fetchImpl = opts.fetchImpl ?? llmFetch;
  const url = chatCompletionsUrl(cfg.baseUrl);
  const rawEffort = opts.reasoningEffort ?? cfg.reasoningEffort;
  // gpt-5.6-sol 等不支持 minimal，统一抬到 low
  const effort = rawEffort === 'minimal' ? 'low' : rawEffort;
  debugLog('info', 'llm', `stream ${url} model=${cfg.model} effort=${effort ?? '-'} max=${opts.maxTokens ?? '-'}`);
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        temperature: opts.temperature ?? 0.7,
        ...(effort ? { reasoning_effort: effort } : {}),
        ...(opts.maxTokens ? { max_completion_tokens: opts.maxTokens } : {}),
      }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    debugLog('error', 'llm', `fetch fail ${(e as Error).message}`);
    throw new LlmError(`网络请求失败：${(e as Error).message}。若为第三方服务，可能是不允许浏览器跨域访问（CORS）。`);
  }
  debugLog('info', 'llm', `http ${res.status} ${res.headers.get('content-type') ?? ''}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    debugLog('error', 'llm', `http body ${text.slice(0, 240)}`);
    throw new LlmError(formatLlmHttpError(res.status, text, cfg), res.status);
  }
  if (!res.body) throw new LlmError('响应没有正文');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  let yielded = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
        const d = extractDelta(payload);
        if (d) {
          yielded += 1;
          if (yielded === 1) debugLog('info', 'llm', `first delta ${d.length} chars`);
          yield d;
        }
      }
      if (parser.done) {
        debugLog('info', 'llm', 'parser done');
        await reader.cancel().catch(() => {});
        break;
      }
    }
    for (const payload of parser.flush()) {
      const d = extractDelta(payload);
      if (d) yield d;
    }
    debugLog('info', 'llm', `${parser.done ? 'done' : 'reader'} tokens=${yielded}`);
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    debugLog('error', 'llm', `stream ${(e as Error).message}`);
    throw e;
  } finally {
    reader.releaseLock();
  }
}

const CORS_HINT = '该服务不允许从 App 内直连，请换支持跨域的服务或官方接口';

export function modelsUrl(baseUrl: string): string {
  return `${normalizeLlmBaseUrl(baseUrl)}/models`;
}

/** 设置页「测试连接」：GET /models */
export async function probeLlmConnection(cfg: LlmConfig, fetchImpl: typeof fetch = llmFetch): Promise<void> {
  const url = modelsUrl(cfg.baseUrl);
  let res: Response;
  try {
    debugLog('info', 'llm', `probe ${url}`);
    res = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' },
    });
  } catch (e) {
    debugLog('error', 'llm', `probe fail ${(e as Error).message}`);
    throw new LlmError(CORS_HINT);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LlmError(formatLlmHttpError(res.status, text, cfg), res.status);
  }
}

/** 设置页“测试连接”：拿到第一个 token 即成功 */
export async function testConnection(cfg: LlmConfig, fetchImpl?: typeof fetch): Promise<void> {
  const gen = streamChat(cfg, [{ role: 'user', content: '回复“好”' }], {
    temperature: 0,
    fetchImpl,
    maxTokens: 16,
    reasoningEffort: cfg.reasoningEffort && cfg.reasoningEffort !== 'none' ? 'low' : cfg.reasoningEffort,
  });
  const first = await gen.next();
  await gen.return(undefined);
  if (first.done) throw new LlmError('连接成功但没有收到任何内容');
}
