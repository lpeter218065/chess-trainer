import { describe, expect, it } from 'vitest';
import { extractSquareThemes, squareThemesPromptBlock } from '../src/chess/squareThemes';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** 西西里结构，白方瞄 d5 前哨 */
const OUTPOST = 'rn3rk1/1pq2ppp/p2pbb2/4p3/4P3/1NNQ4/PPP1BPPP/2KR3R w - - 4 12';
/** 白方 d4 孤兵 */
const IQP = 'r1bq1rk1/pp2bppp/2n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10';

describe('extractSquareThemes', () => {
  it('起始局面没有前哨或空洞', () => {
    const t = extractSquareThemes(START);
    expect(t.strongWhite).toEqual([]);
    expect(t.strongBlack).toEqual([]);
    expect(t.weakWhite).toEqual([]);
    expect(t.weakBlack).toEqual([]);
  });

  it('西西里前哨局：d5 是白方强格、黑方弱格', () => {
    const t = extractSquareThemes(OUTPOST);
    expect(t.strongWhite).toContain('d5');
    expect(t.weakBlack).toContain('d5');
  });

  it('IQP：d5 是白方弱格，e5 是白方可利用的前哨', () => {
    const t = extractSquareThemes(IQP);
    expect(t.weakWhite).toContain('d5');
    expect(t.strongWhite).toContain('e5');
  });
});

describe('squareThemesPromptBlock', () => {
  it('按行棋方写出强格/弱格，供讲解引用', () => {
    const block = squareThemesPromptBlock(OUTPOST, 'w');
    expect(block).toContain('行棋方强格');
    expect(block).toContain('d5');
    expect(block).toContain('对方弱格');
  });

  it('没有格子时写无，避免模型编造', () => {
    const block = squareThemesPromptBlock(START, 'w');
    expect(block).toContain('无');
    expect(block).not.toMatch(/[a-h][1-8]/);
  });

  it('writes the square list in English when asked', () => {
    const block = squareThemesPromptBlock(OUTPOST, 'w', 'en');
    expect(block).toContain('Side to move, strong squares');
    expect(block).toContain('d5');
    expect(block).not.toContain('行棋方强格');
  });
});
