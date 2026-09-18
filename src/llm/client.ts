import { createSseParser, extractDelta } from './sseParser';
import { llmFetch } from './http';
import { debugLog } from '../debug/log';
import { tl } from '../i18n';
import { isNative } from '../platform';

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

/** iOS ATS 要求 HTTPS；在原生壳里拒绝明文 Base URL。 */
export function nativeLlmUrlIssue(baseUrl: string, native = isNative()): 'http' | 'invalid' | null {
  if (!native) return null;
  const raw = normalizeLlmBaseUrl(baseUrl);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'invalid';
  }
  if (url.protocol !== 'https:') return 'http';
  return null;
}

export function assertSecureLlmBaseUrl(baseUrl: string, native = isNative()): void {
  const issue = nativeLlmUrlIssue(baseUrl, native);
  if (issue === 'invalid') throw new LlmError(tl('error.invalidBaseUrl'));
  if (issue === 'http') throw new LlmError(tl('error.httpsRequired'));
}

export function chatCompletionsUrl(baseUrl: string): string {
  return `${normalizeLlmBaseUrl(baseUrl)}/chat/completions`;
}

export function formatLlmHttpError(status: number, body: string, cfg: LlmConfig): string {
  const url = chatCompletionsUrl(cfg.baseUrl);
  let msg = '';
  try {
    const j = JSON.parse(body) as { error?: { message?: unknown } | string };
    const em = typeof j.error === 'string' ? j.error : j.error?.message;
    if (typeof em === 'string') msg = em.trim();
  } catch { /* 非 JSON，忽略 */ }
  if (status === 404 && /route .* not found/i.test(body)) {
    return tl('error.http404Path', { base: cfg.baseUrl, url });
  }
  if (status === 404) {
    return tl('error.http404Model', { url, model: cfg.model });
  }
  if (!msg || /internal server error/i.test(msg)) {
    return tl('error.httpServer', { status });
  }
  return tl('error.httpStatus', { status, msg: msg.slice(0, 120) });
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
  assertSecureLlmBaseUrl(cfg.baseUrl);
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
    throw new LlmError(tl('error.network', { msg: (e as Error).message }));
  }
  debugLog('info', 'llm', `http ${res.status} ${res.headers.get('content-type') ?? ''}`);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    debugLog('error', 'llm', `http body ${text.slice(0, 240)}`);
    throw new LlmError(formatLlmHttpError(res.status, text, cfg), res.status);
  }
  if (!res.body) throw new LlmError(tl('error.noBody'));
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

function corsHint(): string {
  return tl('error.cors');
}

export function modelsUrl(baseUrl: string): string {
  return `${normalizeLlmBaseUrl(baseUrl)}/models`;
}

/** 设置页「测试连接」：GET /models */
export async function probeLlmConnection(cfg: LlmConfig, fetchImpl: typeof fetch = llmFetch): Promise<void> {
  assertSecureLlmBaseUrl(cfg.baseUrl);
  const url = modelsUrl(cfg.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let res: Response;
    try {
      debugLog('info', 'llm', `probe ${url}`);
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError')
        throw new LlmError(tl('error.probeTimeout'));
      debugLog('error', 'llm', `probe fail ${(e as Error).message}`);
      throw new LlmError(corsHint());
    }
    if (res.status === 404 || res.status === 405) {
      await res.body?.cancel().catch(() => {});
      debugLog('info', 'llm', `probe /models ${res.status}，回退到最小对话`);
      await testConnection(cfg, fetchImpl, controller.signal);
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(formatLlmHttpError(res.status, text, cfg), res.status);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError')
      throw new LlmError(tl('error.probeTimeout'));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 设置页“测试连接”：拿到第一个 token 即成功 */
export async function testConnection(cfg: LlmConfig, fetchImpl?: typeof fetch, signal?: AbortSignal): Promise<void> {
  const gen = streamChat(cfg, [{ role: 'user', content: tl('llm.probePing') }], {
    temperature: 0,
    fetchImpl,
    signal,
    maxTokens: 16,
    reasoningEffort: cfg.reasoningEffort && cfg.reasoningEffort !== 'none' ? 'low' : cfg.reasoningEffort,
  });
  const first = await gen.next();
  await gen.return(undefined);
  if (first.done) throw new LlmError(tl('error.probeEmpty'));
}
