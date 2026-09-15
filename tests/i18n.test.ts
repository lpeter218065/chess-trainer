import { describe, expect, it } from 'vitest';
import { detectLocale, interpolate, localizeContent, resolveLocale, t } from '../src/i18n';
import { SICILIAN_ISLAND } from '../src/campaign';

describe('detectLocale', () => {
  it('treats zh* as Chinese', () => {
    expect(detectLocale({ language: 'zh-CN' })).toBe('zh');
    expect(detectLocale({ language: 'zh-TW' })).toBe('zh');
    expect(detectLocale({ languages: ['zh-Hans-CN', 'en'] })).toBe('zh');
  });

  it('treats other languages as English', () => {
    expect(detectLocale({ language: 'en-US' })).toBe('en');
    expect(detectLocale({ languages: ['de-DE'] })).toBe('en');
  });

  it('defaults to Chinese when language is missing', () => {
    expect(detectLocale({})).toBe('zh');
  });
});

describe('resolveLocale', () => {
  it('honors an explicit preference', () => {
    expect(resolveLocale('en', { language: 'zh-CN' })).toBe('en');
    expect(resolveLocale('zh', { language: 'en-US' })).toBe('zh');
  });

  it('follows the device when preference is system', () => {
    expect(resolveLocale('system', { language: 'en-GB' })).toBe('en');
    expect(resolveLocale('system', { language: 'zh-CN' })).toBe('zh');
  });
});

describe('t', () => {
  it('interpolates named placeholders', () => {
    expect(interpolate('我的分析 ({n})', { n: 3 })).toBe('我的分析 (3)');
    expect(t('en', 'home.analysesCount', { n: 2 })).toBe('My analyses (2)');
  });

  it('falls back to Chinese if a chrome key is missing in English', () => {
    expect(t('zh', 'app.name')).toBe('国际象棋训练');
    expect(t('en', 'app.name')).toBe('Chess Trainer');
  });
});

describe('localizeContent', () => {
  it('leaves Chinese campaign copy unchanged', () => {
    expect(localizeContent(SICILIAN_ISLAND, 'zh').title).toBe('西西里群岛');
  });

  it('translates campaign titles in English', () => {
    expect(localizeContent(SICILIAN_ISLAND, 'en').title).toBe('Sicilian Isles');
  });

  it('translates lesson titles, themes, and principle statements in English', () => {
    expect(localizeContent('意大利开局：慢速 c3-d3 体系', 'en')).toBe('Italian Game: slow c3–d3 system');
    expect(localizeContent('中心控制', 'en')).toBe('Center control');
    expect(localizeContent('占据或控制 d4/e4/d5/e5 四个中心格，是开局阶段最优先的目标之一。', 'en')).toMatch(/center/i);
  });
});
