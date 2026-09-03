import { describe, it, expect } from 'vitest';
import { streamChat, LlmError } from '../src/llm/client';

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
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
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
