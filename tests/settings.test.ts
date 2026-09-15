import { afterEach, describe, it, expect } from 'vitest';
import { envLlm, partializeSettings, useSettings } from '../src/store/settings';

afterEach(() => {
  useSettings.getState().setPieceSet('classic');
  useSettings.getState().setBoardTheme('walnut');
  useSettings.getState().setPieceColor('standard');
});

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
      localePref: 'system',
      pieceSet: 'classic',
      boardTheme: 'walnut',
      pieceColor: 'standard',
      setLlm() {},
      setTemperature() {},
      setDifficultyId() {},
      setDebugGesturesEnabled() {},
      setLocalePref() {},
      setPieceSet() {},
      setBoardTheme() {},
      setPieceColor() {},
    });
    expect(sliced).not.toHaveProperty('llm.apiKey');
    expect(JSON.stringify(sliced)).not.toContain('sk-secret');
    expect(sliced.llm.baseUrl).toBe('https://api.openai.com/v1');
    expect(sliced.llm.model).toBe('gpt-x');
  });
});

describe('pieceSet', () => {
  it('pieceSet 默认 classic 且被持久化', () => {
    expect(useSettings.getState().pieceSet).toBe('classic');
    useSettings.getState().setPieceSet('letter');
    expect(partializeSettings(useSettings.getState()).pieceSet).toBe('letter');
    useSettings.getState().setPieceSet('not-a-set' as 'classic');
    expect(useSettings.getState().pieceSet).toBe('classic');
  });
});

describe('board look', () => {
  it('boardTheme 与 pieceColor 默认值会被持久化', () => {
    expect(useSettings.getState().boardTheme).toBe('walnut');
    expect(useSettings.getState().pieceColor).toBe('standard');
    useSettings.getState().setBoardTheme('baize');
    useSettings.getState().setPieceColor('brass');
    const sliced = partializeSettings(useSettings.getState());
    expect(sliced.boardTheme).toBe('baize');
    expect(sliced.pieceColor).toBe('brass');
    useSettings.getState().setBoardTheme('nope' as 'walnut');
    expect(useSettings.getState().boardTheme).toBe('walnut');
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
