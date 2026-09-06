import { describe, it, expect } from 'vitest';
import { probeLlmConnection, LlmError } from '../src/llm/client';

const cfg = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'gpt-x' };

describe('probeLlmConnection', () => {
  it('GET /models 成功', async () => {
    let url = '';
    let accept = '';
    const fetchImpl: typeof fetch = async (u, init) => {
      url = String(u);
      accept = new Headers(init?.headers).get('Accept') ?? '';
      return new Response('{"data":[]}', { status: 200 });
    };
    await probeLlmConnection(cfg, fetchImpl);
    expect(url).toBe('https://api.example.com/v1/models');
    expect(accept).toBe('application/json');
  });

  it('HTTP 错误带状态码', async () => {
    const fetchImpl: typeof fetch = async () => new Response('nope', { status: 401 });
    await expect(probeLlmConnection(cfg, fetchImpl)).rejects.toMatchObject({ status: 401 } satisfies Partial<LlmError>);
  });

  it('网络 / CORS 失败给出针对性文案', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(probeLlmConnection(cfg, fetchImpl)).rejects.toThrow(/不允许从 App 内直连/);
  });
});
