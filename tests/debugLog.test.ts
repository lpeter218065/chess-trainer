import { describe, it, expect } from 'vitest';
import { createDebugLog, redactSecrets } from '../src/debug/log';

describe('redactSecrets', () => {
  it('去掉 Bearer、sk- 与 apiKey，不留下密钥原文', () => {
    const raw = [
      'Authorization: Bearer sk-live-abcdefghijklmnopqrstuvwxyz012345',
      'body {"apiKey":"sk-secret-value"}',
      'https://api.example.com/v1?api_key=abcd&x=1',
    ].join('\n');
    const out = redactSecrets(raw);
    expect(out).not.toContain('sk-live-abcdefghijklmnopqrstuvwxyz012345');
    expect(out).not.toContain('sk-secret-value');
    expect(out).not.toContain('abcd');
    expect(out).toMatch(/Bearer \*\*\*/);
  });
});

describe('createDebugLog', () => {
  it('按上限丢弃最旧条目，format 不含密钥', () => {
    const log = createDebugLog(3);
    log.append('info', 'sse', 'one');
    log.append('warn', 'llm', 'Bearer sk-live-abcdefghijklmnopqrstuvwxyz012345');
    log.append('error', 'llm', 'three');
    log.append('info', 'sse', 'four');
    const lines = log.list().map((e) => e.message);
    expect(lines).toEqual([
      expect.stringMatching(/Bearer \*\*\*/),
      'three',
      'four',
    ]);
    expect(log.format()).not.toContain('sk-live');
    expect(log.format()).toMatch(/llm\twarn\tBearer \*\*\*/);
  });

  it('clear 后为空', () => {
    const log = createDebugLog();
    log.append('info', 'x', 'a');
    log.clear();
    expect(log.list()).toEqual([]);
    expect(log.format()).toBe('');
  });
});
