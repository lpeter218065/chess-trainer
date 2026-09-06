import { describe, it, expect } from 'vitest';
import { bufferedResponse, capacitorHttpFetch, createLlmFetch } from '../src/llm/http';
import { streamChat, probeLlmConnection } from '../src/llm/client';

const cfg = { baseUrl: 'http://example.test/v1', apiKey: 'sk-test', model: 'gpt-x' };

describe('bufferedResponse', () => {
  it('把整段正文变成可读的 fetch Response.body', async () => {
    const res = bufferedResponse(200, { 'content-type': 'text/plain' }, 'hello');
    expect(res.status).toBe(200);
    expect(res.body).toBeTruthy();
    const reader = res.body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    expect(new TextDecoder().decode(value)).toBe('hello');
    reader.releaseLock();
  });
});

describe('capacitorHttpFetch', () => {
  it('把 CapacitorHttp 的缓冲结果交给 streamChat 当 SSE', async () => {
    const http = {
      async request(opts: { url: string; method?: string; headers?: Record<string, string>; data?: unknown }) {
        expect(opts.url).toBe('http://example.test/v1/chat/completions');
        expect(opts.method).toBe('POST');
        expect(opts.headers?.Authorization ?? opts.headers?.authorization).toBe('Bearer sk-test');
        return {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
          data: 'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n',
        };
      },
    };
    const out: string[] = [];
    for await (const d of streamChat(cfg, [{ role: 'user', content: 'hi' }], {
      fetchImpl: capacitorHttpFetch(http),
    })) out.push(d);
    expect(out).toEqual(['好']);
  });

  it('GET /models 走原生通道，不再被当成 CORS 失败', async () => {
    const http = {
      async request(opts: { url: string; method?: string }) {
        expect(opts.method).toBe('GET');
        expect(opts.url).toBe('http://example.test/v1/models');
        return { status: 200, headers: {}, data: '{"data":[]}' };
      },
    };
    await probeLlmConnection(cfg, capacitorHttpFetch(http));
  });
});

describe('createLlmFetch', () => {
  const okResponse = () => new Response('ok', { status: 200 });
  it('原生且插件可用时走原生 fetch', async () => {
    let nativeCalls = 0;
    const f = createLlmFetch({
      isNative: () => true,
      isPluginAvailable: () => true,
      nativeFetch: async () => async () => { nativeCalls++; return okResponse(); },
      webFetch: async () => { throw new Error('should not use web fetch'); },
    });
    await f('https://x/v1/models');
    expect(nativeCalls).toBe(1);
  });
  it('原生但插件不可用时回退 web fetch', async () => {
    let webCalls = 0;
    const f = createLlmFetch({
      isNative: () => true,
      isPluginAvailable: () => false,
      nativeFetch: async () => { throw new Error('should not load native'); },
      webFetch: async () => { webCalls++; return okResponse(); },
    });
    await f('https://x/v1/models');
    expect(webCalls).toBe(1);
  });
  it('Web 端直接用 web fetch', async () => {
    let webCalls = 0;
    const f = createLlmFetch({ isNative: () => false, isPluginAvailable: () => true, nativeFetch: async () => { throw new Error('no'); }, webFetch: async () => { webCalls++; return okResponse(); } });
    await f('https://x/v1/models');
    expect(webCalls).toBe(1);
  });
  it('原生可用性只检查一次', async () => {
    let checks = 0;
    let loads = 0;
    const f = createLlmFetch({
      isNative: () => true,
      isPluginAvailable: () => { checks++; return true; },
      nativeFetch: async () => { loads++; return async () => okResponse(); },
      webFetch: async () => { throw new Error('should not use web fetch'); },
    });
    await f('https://x/v1/models');
    await f('https://x/v1/models');
    expect(checks).toBe(1);
    expect(loads).toBe(1);
  });
});
