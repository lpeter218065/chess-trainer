import { describe, it, expect } from 'vitest';
import { createSseParser, extractDelta } from '../src/llm/sseParser';

describe('createSseParser', () => {
  it('按空行分事件，提取 data 负载', () => {
    const p = createSseParser();
    expect(p.push('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
  });
  it('跨 chunk 拼接', () => {
    const p = createSseParser();
    expect(p.push('data: {"a"')).toEqual([]);
    expect(p.push(':1}\n\n')).toEqual(['{"a":1}']);
  });
  it('忽略注释和 [DONE]', () => {
    const p = createSseParser();
    expect(p.push(': ping\n\ndata: [DONE]\n\n')).toEqual([]);
  });
  it('flush 输出未以空行结尾的尾部', () => {
    const p = createSseParser();
    p.push('data: {"x":1}');
    expect(p.flush()).toEqual(['{"x":1}']);
  });
});

describe('extractDelta', () => {
  it('取 choices[0].delta.content', () => {
    expect(extractDelta('{"choices":[{"delta":{"content":"你好"}}]}')).toBe('你好');
  });
  it('无内容返回空串', () => {
    expect(extractDelta('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('');
    expect(extractDelta('not json')).toBe('');
  });
});
