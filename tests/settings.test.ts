import { describe, it, expect } from 'vitest';
import { envLlm, partializeSettings, useSettings } from '../src/store/settings';

describe('envLlm', () => {
  it('生产模式下 apiKey 恒为空', () => {
    expect(envLlm({
      DEV: false,
      VITE_LLM_API_KEY: 'sk-should-not-leak',
      VITE_LLM_BASE_URL: 'https://api.openai.com/v1',
      VITE_LLM_MODEL: 'gpt-4o-mini',
    }).apiKey).toBe('');
  });

  it('开发模式读取环境 Key', () => {
    expect(envLlm({
      DEV: true,
      VITE_LLM_API_KEY: 'sk-dev',
      VITE_LLM_BASE_URL: 'https://api.openai.com/v1',
      VITE_LLM_MODEL: 'gpt-4o-mini',
    }).apiKey).toBe('sk-dev');
  });
});

describe('partializeSettings', () => {
  it('持久化对象不含 apiKey', () => {
    const sliced = partializeSettings({
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-secret', model: 'gpt-x' },
      temperature: 0.8,
      difficultyId: 'medium',
      debugGesturesEnabled: false,
      setLlm() {},
      setTemperature() {},
      setDifficultyId() {},
      setDebugGesturesEnabled() {},
    });
    expect(sliced).not.toHaveProperty('llm.apiKey');
    expect(JSON.stringify(sliced)).not.toContain('sk-secret');
    expect(sliced.llm.baseUrl).toBe('https://api.openai.com/v1');
    expect(sliced.llm.model).toBe('gpt-x');
  });
});

describe('debugGesturesEnabled', () => {
  it('debugGesturesEnabled 默认关闭且被持久化', () => {
    expect(useSettings.getState().debugGesturesEnabled).toBe(false);
    useSettings.getState().setDebugGesturesEnabled(true);
    expect(partializeSettings(useSettings.getState()).debugGesturesEnabled).toBe(true);
    useSettings.getState().setDebugGesturesEnabled(false);
  });
});
