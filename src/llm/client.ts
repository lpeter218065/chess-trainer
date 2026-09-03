import { createSseParser, extractDelta } from './sseParser';

export interface LlmConfig {
  baseUrl: string; // 如 https://api.openai.com/v1
  apiKey: string;
  model: string;
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

export interface StreamOptions {
  temperature?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function* streamChat(cfg: LlmConfig, messages: ChatMessage[], opts: StreamOptions = {}): AsyncGenerator<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: opts.temperature ?? 0.7 }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new LlmError(`网络请求失败：${(e as Error).message}。若为第三方服务，可能是不允许浏览器跨域访问（CORS）。`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LlmError(`模型服务返回 ${res.status}：${text.slice(0, 300)}`, res.status);
  }
  if (!res.body) throw new LlmError('响应没有正文');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
        const d = extractDelta(payload);
        if (d) yield d;
      }
    }
    for (const payload of parser.flush()) {
      const d = extractDelta(payload);
      if (d) yield d;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw e;
  } finally {
    reader.releaseLock();
  }
}

/** 设置页“测试连接”：拿到第一个 token 即成功 */
export async function testConnection(cfg: LlmConfig, fetchImpl?: typeof fetch): Promise<void> {
  const gen = streamChat(cfg, [{ role: 'user', content: '回复“好”' }], { temperature: 0, fetchImpl });
  const first = await gen.next();
  await gen.return(undefined);
  if (first.done) throw new LlmError('连接成功但没有收到任何内容');
}
