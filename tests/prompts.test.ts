import { describe, it, expect } from 'vitest';
import { buildIntroMessages, buildMoveMessages, buildHintMessages, buildSummaryMessages } from '../src/llm/prompts';
import { LESSONS } from '../src/lessons';
import { principleById } from '../src/lessons/principles';

const lesson = LESSONS[0];
const principles = lesson.principleIds.map(principleById);

describe('prompts', () => {
  it('intro 含主题与棋理名', () => {
    const m = buildIntroMessages(lesson, principles);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain(lesson.theme);
    expect(m[1].content).toContain(principles[0].name);
  });
  it('move prompt 含用户着法、质量、评估、线路、角度指引、最近讲解', () => {
    const m = buildMoveMessages({
      lesson, fen: lesson.startFen, moveHistorySan: ['d3', 'd6'], userMoveSan: 'd3', quality: 'inaccuracy',
      evalBefore: 30, evalAfter: -20, bestLinesSan: [['O-O', 'O-O', 'Re1'], ['d4', 'exd4']], engineReplySan: 'd6',
      angle: 'compare', principles: [principleById('center-control')], recentCommentary: ['上一回合讲了出子顺序。'],
    });
    const u = m[1].content;
    expect(u).toContain('d3');
    expect(u).toContain('不精确');
    expect(u).toContain('+0.30');
    expect(u).toContain('-0.20');
    expect(u).toContain('O-O O-O Re1');
    expect(u).toContain('对比');
    expect(u).toContain('上一回合讲了出子顺序');
    expect(m[0].content).toContain('不要自创');
  });
  it('hint prompt 要求不说具体着法', () => {
    const m = buildHintMessages({ lesson, fen: lesson.startFen, moveHistorySan: [], bestLinesSan: [['d3']], principles });
    expect(m[1].content).toContain('不要说出具体着法');
  });
  it('summary prompt 含每回合质量与结果', () => {
    const m = buildSummaryMessages({
      lesson, moveHistorySan: ['d3', 'd6', 'O-O', 'O-O'], qualities: ['good', 'best'], evalHistory: [20, 35],
      outcome: 'success', reason: '全程稳定', principles, hintUsed: false,
    });
    expect(m[1].content).toContain('成功');
    expect(m[1].content).toContain('最佳');
  });
});
