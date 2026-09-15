import { describe, expect, it } from 'vitest';
import { CAMPAIGN_ASK_CHIPS, buildCampaignAskMessages, canAskCoach } from '../src/campaign/ask';
import type { Coach } from '../src/campaign/types';

const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function coach(partial: Partial<Coach>): Coach {
  return {
    tone: 'ok',
    say: '对，c5。',
    highlights: ['c5'],
    ...partial,
  };
}

describe('canAskCoach', () => {
  it('opens after a teaching beat, not during retry or a pending canned question', () => {
    expect(canAskCoach(null)).toBe(false);
    expect(canAskCoach(coach({ tone: 'retry' }))).toBe(false);
    expect(
      canAskCoach(
        coach({
          followUp: {
            kind: 'tap',
            prompt: '盯哪？',
            square: 'd4',
            choices: ['d4'],
            explainOk: '对',
            explainBad: '再看',
          },
        }),
      ),
    ).toBe(false);
    expect(canAskCoach(coach({ tone: 'ok' }))).toBe(true);
    expect(canAskCoach(coach({ tone: 'done' }))).toBe(true);
  });
});

describe('buildCampaignAskMessages', () => {
  it('asks a kids coach to explain the current campaign position', () => {
    const messages = buildCampaignAskMessages({
      islandTitle: '西西里群岛',
      levelTitle: '为什么走 c5',
      ideaCard: '不对称地抢中心',
      levelQuestion: '白棋走了 e4。西西里为什么回 c5？',
      coachSay: '对。用边上的 c 兵盯 d4。',
      fen,
      historySan: ['e4'],
      lastSan: 'e4',
      question: '再讲细一点',
      turns: [],
    });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toMatch(/小朋友/);
    expect(messages[0].content).toMatch(/不要用.*引擎/);
    expect(messages[0].content).toMatch(/不要剧透/);
    expect(messages[0].content).toMatch(/\{\{/);
    const user = messages.map((m) => m.content).join('\n');
    expect(user).toContain('西西里群岛');
    expect(user).toContain('不对称地抢中心');
    expect(user).toContain(fen);
    expect(user).toContain('盯 d4');
    expect(user).toContain('再讲细一点');
    expect(user).toContain('e4');
  });

  it('keeps prior ask turns in the thread', () => {
    const messages = buildCampaignAskMessages({
      islandTitle: '后兵群岛',
      levelTitle: '为什么走 d4',
      ideaCard: '后护着中心兵',
      coachSay: '后在 d1 护着。',
      fen: 'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1',
      historySan: ['d4'],
      lastSan: 'd4',
      turns: [
        { role: 'user', content: '哪个格子最重要？' },
        { role: 'assistant', content: '• {{d4}} 中心这一格。' },
      ],
      question: '他想干什么？',
    });
    expect(messages.some((m) => m.role === 'user' && m.content === '哪个格子最重要？')).toBe(true);
    expect(messages.some((m) => m.role === 'assistant' && m.content.includes('{{d4}}'))).toBe(true);
    expect(messages.at(-1)).toEqual({ role: 'user', content: '他想干什么？' });
  });

  it('offers kid-sized question chips', () => {
    expect(CAMPAIGN_ASK_CHIPS).toContain('再讲细一点');
    expect(CAMPAIGN_ASK_CHIPS).toContain('他想干什么？');
    expect(CAMPAIGN_ASK_CHIPS).toContain('哪个格子最重要？');
    expect(CAMPAIGN_ASK_CHIPS).not.toContain('若走引擎次选会怎样？');
  });

  it('builds an English coach thread when locale is en', () => {
    const messages = buildCampaignAskMessages({
      islandTitle: 'Sicilian Isles',
      levelTitle: 'Why c5',
      ideaCard: 'Fight the center without mirroring',
      coachSay: 'Yes, c5.',
      fen,
      historySan: [],
      lastSan: null,
      question: 'Say that more slowly',
      turns: [],
      locale: 'en',
    });
    expect(messages[0].content).toContain('simple English');
    expect(messages[0].content).not.toContain('简体中文');
    const user = messages.map((m) => m.content).join('\n');
    expect(user).toContain('Campaign:');
    expect(user).toContain('(see the board)');
    expect(user).not.toContain('闯关：');
    expect(user).not.toContain('（看棋盘）');
  });
});
