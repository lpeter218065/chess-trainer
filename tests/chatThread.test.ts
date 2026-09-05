import { describe, it, expect } from 'vitest';
import { continueThread, recordAssistant } from '../src/llm/chatThread';
import type { ChatMessage } from '../src/llm/client';

const sys: ChatMessage = { role: 'system', content: 'sys' };
const u1: ChatMessage = { role: 'user', content: 'u1' };
const a1: ChatMessage = { role: 'assistant', content: 'a1' };
const u2: ChatMessage = { role: 'user', content: 'u2' };
const bootstrap = [sys, u1];

describe('continueThread', () => {
  it('没有历史时用完整 bootstrap', () => {
    expect(continueThread(undefined, u2, bootstrap)).toEqual(bootstrap);
    expect(continueThread([], u2, bootstrap)).toEqual(bootstrap);
  });

  it('有历史时接上新的 user，不重发 bootstrap 用户消息', () => {
    const prev = [sys, u1, a1];
    const next = continueThread(prev, u2, bootstrap);
    expect(next[0]).toEqual(sys);
    expect(next.map((m) => m.content)).toEqual(['sys', 'u1', 'a1', 'u2']);
  });

  it('recordAssistant 追加回复', () => {
    expect(recordAssistant([sys, u1], '讲了').at(-1)).toEqual({ role: 'assistant', content: '讲了' });
  });
});
