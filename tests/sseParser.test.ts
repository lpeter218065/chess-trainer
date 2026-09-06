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
  it('忽略注释；[DONE] 标记流结束', () => {
    const p = createSseParser();
    expect(p.push(': ping\n\ndata: [DONE]\n\n')).toEqual([]);
    expect(p.done).toBe(true);
  });
  it('finish_reason 非空也标记流结束，并仍产出该事件', () => {
    const p = createSseParser();
    expect(p.push('data: {"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}\n\n')).toEqual([
      '{"choices":[{"delta":{"content":"好"},"finish_reason":"stop"}]}',
    ]);
    expect(p.done).toBe(true);
  });
  it('finish_reason 为 null 不结束', () => {
    const p = createSseParser();
    expect(p.push('data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}\n\n')).toEqual([
      '{"choices":[{"delta":{"content":"好"},"finish_reason":null}]}',
    ]);
    expect(p.done).toBe(false);
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
