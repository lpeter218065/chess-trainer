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

  it('/models 404 时回退到最小对话，对话成功即成功', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/models')) return new Response('{"error":"Not Found"}', { status: 404 });
      const body = 'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n';
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    await expect(probeLlmConnection(cfg, fetchImpl)).resolves.toBeUndefined();
    expect(calls.some((u) => u.endsWith('/chat/completions'))).toBe(true);
  });

  it('/models 404 且对话 400 时抛出对话的错误', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/models')) return new Response('', { status: 404 });
      return new Response('{"error":{"message":"Internal server error"}}', { status: 400 });
    };
    await expect(probeLlmConnection(cfg, fetchImpl)).rejects.toThrow(/400/);
  });

  it('/models 200 时不再发起对话', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => { calls.push(String(input)); return new Response('{"data":[]}', { status: 200 }); };
    await probeLlmConnection(cfg, fetchImpl);
    expect(calls).toHaveLength(1);
  });
});
