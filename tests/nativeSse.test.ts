import { describe, it, expect } from 'vitest';
import { nativeSseFetch, type NativeSsePlugin } from '../src/llm/nativeSse';
import { streamChat } from '../src/llm/client';

const cfg = { baseUrl: 'http://example.test/v1', apiKey: 'sk-test', model: 'gpt-x' };

type Ev = {
  open: Array<(e: { id: string; status: number; headers?: Record<string, string> }) => void>;
  chunk: Array<(e: { id: string; chunk: string }) => void>;
  end: Array<(e: { id: string }) => void>;
  error: Array<(e: { id: string; message: string }) => void>;
};

function fakePlugin(): { plugin: NativeSsePlugin; ev: Ev; emitOpen: () => void; emitChunk: (c: string) => void; emitEnd: () => void } {
  const ev: Ev = { open: [], chunk: [], end: [], error: [] };
  const plugin: NativeSsePlugin = {
    async start() {
      return { id: 's1' };
    },
    async cancel() {},
    addListener(event, cb) {
      (ev[event] as Array<typeof cb>).push(cb);
      return { remove: async () => {} };
    },
  };
  return {
    plugin,
    ev,
    emitOpen: () => ev.open.forEach((fn) => fn({ id: 's1', status: 200, headers: { 'content-type': 'text/event-stream' } })),
    emitChunk: (c) => ev.chunk.forEach((fn) => fn({ id: 's1', chunk: c })),
    emitEnd: () => ev.end.forEach((fn) => fn({ id: 's1' })),
  };
}

describe('nativeSseFetch', () => {
  it('open 超时则拒绝，不永远卡住', async () => {
    const { plugin } = fakePlugin();
    const fetchImpl = nativeSseFetch(plugin, { openTimeoutMs: 30 });
    await expect(
      fetchImpl('http://example.test/v1/chat/completions', { method: 'POST', body: '{}' }),
    ).rejects.toThrow(/超时|timed out|Timeout/i);
  });

  it('第一段 SSE delta 在 end 之前就能 yield', async () => {
    const { plugin, emitOpen, emitChunk, emitEnd } = fakePlugin();
    const gen = streamChat(cfg, [{ role: 'user', content: 'hi' }], {
      fetchImpl: nativeSseFetch(plugin),
    });
    const first = gen.next();
    await Promise.resolve();
    await Promise.resolve();
    emitOpen();
    await Promise.resolve();
    emitChunk('data: {"choices":[{"delta":{"content":"好"}}]}\n\n');
    expect((await first).value).toBe('好');
    emitEnd();
    expect((await gen.next()).done).toBe(true);
  });

  it('收到 data: [DONE] 后结束，即使 native 一直不发 end', async () => {
    const { plugin, emitOpen, emitChunk } = fakePlugin();
    const gen = streamChat(cfg, [{ role: 'user', content: 'hi' }], {
      fetchImpl: nativeSseFetch(plugin, { openTimeoutMs: 1000 }),
    });
    const first = gen.next();
    await Promise.resolve();
    await Promise.resolve();
    emitOpen();
    await Promise.resolve();
    emitChunk('data: {"choices":[{"delta":{"content":"好"}}]}\n\n');
    expect((await first).value).toBe('好');
    emitChunk('data: [DONE]\n\n');
    expect((await gen.next()).done).toBe(true);
  });

  it('收到 finish_reason 后结束，即使没有 [DONE] 也不发 end', async () => {
    const { plugin, emitOpen, emitChunk } = fakePlugin();
    const gen = streamChat(cfg, [{ role: 'user', content: 'hi' }], {
      fetchImpl: nativeSseFetch(plugin, { openTimeoutMs: 1000 }),
    });
    const first = gen.next();
    await Promise.resolve();
    await Promise.resolve();
    emitOpen();
    await Promise.resolve();
    emitChunk('data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n');
    expect((await first).value).toBe('好');
    expect((await gen.next()).done).toBe(true);
  });

  it('start 时带 Accept-Encoding: identity，避免 gzip 缓冲整段 SSE', async () => {
    let started: { headers: Record<string, string> } | null = null;
    const { plugin, emitOpen, emitEnd } = fakePlugin();
    const origStart = plugin.start.bind(plugin);
    plugin.start = async (opts) => {
      started = opts;
      return origStart(opts);
    };
    const pending = nativeSseFetch(plugin, { openTimeoutMs: 1000 })('http://example.test/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'Content-Type': 'application/json' },
      body: '{}',
    });
    await Promise.resolve();
    await Promise.resolve();
    emitOpen();
    const res = await pending;
    emitEnd();
    await res.body?.cancel();
    const headers = Object.fromEntries(
      Object.entries(started!.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['accept-encoding']).toBe('identity');
    expect(headers['accept']).toBe('text/event-stream');
  });

  it('调用方已设 Accept 时不改成 event-stream', async () => {
    let started: { headers: Record<string, string> } | null = null;
    const { plugin, emitOpen, emitEnd } = fakePlugin();
    const origStart = plugin.start.bind(plugin);
    plugin.start = async (opts) => {
      started = opts;
      return origStart(opts);
    };
    const pending = nativeSseFetch(plugin, { openTimeoutMs: 1000 })('http://example.test/v1/models', {
      method: 'GET',
      headers: { Authorization: 'Bearer x', Accept: 'application/json' },
    });
    await Promise.resolve();
    await Promise.resolve();
    emitOpen();
    const res = await pending;
    emitEnd();
    await res.body?.cancel();
    const headers = Object.fromEntries(
      Object.entries(started!.headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers['accept']).toBe('application/json');
    expect(headers['accept-encoding']).toBe('identity');
  });
});

