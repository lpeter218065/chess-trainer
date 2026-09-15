import { describe, it, expect } from 'vitest';
import { streamChat, LlmError, normalizeLlmBaseUrl, chatCompletionsUrl, lowerEffort, formatLlmHttpError } from '../src/llm/client';
import { useSettings } from '../src/store/settings';

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

const cfg = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'gpt-x' };

describe('streamChat', () => {
  it('发送 stream:true 并逐段产出 delta', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl: typeof fetch = async (url, init) => {
      captured = { url: String(url), init: init! };
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"这"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"步"}}]}\n\ndata: [DONE]\n\n',
      ]);
    };
    const out: string[] = [];
    for await (const d of streamChat(cfg, [{ role: 'user', content: 'hi' }], { fetchImpl })) out.push(d);
    expect(out).toEqual(['这', '步']);
    expect(captured!.url).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(captured!.init.body as string);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-x');
    expect(body.reasoning_effort).toBeUndefined();
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('设置了 reasoningEffort 时写入请求体', async () => {
    let body: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return sseResponse(['data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n']);
    };
    const out: string[] = [];
    for await (const d of streamChat({ ...cfg, reasoningEffort: 'medium' }, [{ role: 'user', content: 'hi' }], { fetchImpl })) out.push(d);
    expect(out).toEqual(['好']);
    expect(body!.reasoning_effort).toBe('medium');
  });

  it('maxTokens 写入 max_completion_tokens，opts.reasoningEffort 覆盖 cfg', async () => {
    let body: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return sseResponse(['data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n']);
    };
    for await (const _ of streamChat({ ...cfg, reasoningEffort: 'medium' }, [], { fetchImpl, maxTokens: 400, reasoningEffort: 'low' })) void _;
    expect(body!.max_completion_tokens).toBe(400);
    expect(body!.reasoning_effort).toBe('low');
  });

  it('未设 maxTokens 时不带 max_completion_tokens', async () => {
    let body: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = async (_url, init) => {
      body = JSON.parse(init!.body as string);
      return sseResponse(['data: [DONE]\n\n']);
    };
    for await (const _ of streamChat(cfg, [], { fetchImpl })) void _;
    expect(body!.max_completion_tokens).toBeUndefined();
  });

  it('非 2xx 抛 LlmError 带状态码', async () => {
    const fetchImpl: typeof fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
    const gen = streamChat(cfg, [], { fetchImpl });
    await expect(gen.next()).rejects.toMatchObject({ status: 401 } satisfies Partial<LlmError>);
  });

  it('网络错误包装为 LlmError', async () => {
    const fetchImpl: typeof fetch = async () => { throw new TypeError('Failed to fetch'); };
    await expect(streamChat(cfg, [], { fetchImpl }).next()).rejects.toBeInstanceOf(LlmError);
  });
});

describe('lowerEffort', () => {
  it('降一档，地板为 low（模型不支持 minimal）', () => {
    expect(lowerEffort('high')).toBe('medium');
    expect(lowerEffort('medium')).toBe('low');
    expect(lowerEffort('low')).toBe('low');
    expect(lowerEffort('minimal')).toBe('low');
    expect(lowerEffort('none')).toBe('none');
    expect(lowerEffort(undefined)).toBeUndefined();
  });
});

describe('formatLlmHttpError 友好化', () => {
  it('Internal server error 不回显原始 JSON', () => {
    const s = formatLlmHttpError(400, '{"error":{"message":"Internal server error"}}', cfg);
    expect(s).not.toContain('{');
    expect(s).toContain('400');
    expect(s).toMatch(/服务端错误|稍后重试/);
  });
  it('有具体 message 时展示该 message（截断）', () => {
    const s = formatLlmHttpError(400, '{"error":{"message":"messages must not be empty"}}', cfg);
    expect(s).toContain('messages must not be empty');
    expect(s).not.toContain('{');
  });
  it('非 JSON body 不抛异常且不回显花括号', () => {
    expect(() => formatLlmHttpError(500, 'oops <html>', cfg)).not.toThrow();
  });

  it('English locale uses English HTTP error copy', () => {
    useSettings.getState().setLocalePref('en');
    const s = formatLlmHttpError(400, '{"error":{"message":"Internal server error"}}', cfg);
    expect(s).toMatch(/server error/i);
    expect(s).not.toMatch(/服务端/);
    useSettings.getState().setLocalePref('system');
  });
});

describe('normalizeLlmBaseUrl', () => {
  it('去掉末尾斜杠与 chat/completions', () => {
    expect(normalizeLlmBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
    expect(normalizeLlmBaseUrl('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com/v1');
    expect(chatCompletionsUrl('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com/v1/chat/completions');
  });
});
