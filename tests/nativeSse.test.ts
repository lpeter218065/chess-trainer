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
});
