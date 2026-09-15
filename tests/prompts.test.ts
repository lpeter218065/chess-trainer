import { afterEach, describe, it, expect } from 'vitest';
import {
  buildIntroMessages, buildMoveMessages, buildHintMessages, buildSummaryMessages, buildExploreMessages,
  buildFollowUpMessages, buildAssessmentMessages, FOLLOW_UP_CHIPS, exploreFollowUpThreadId, lessonFollowUpThreadId,
} from '../src/llm/prompts';
import { LESSONS } from '../src/lessons';
import { principleById } from '../src/lessons/principles';
import { useSettings } from '../src/store/settings';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const lesson = LESSONS[0];
const principles = lesson.principleIds.map(principleById);

describe('prompts', () => {
  it('intro 含主题、棋理与格子高亮标记规则', () => {
    const m = buildIntroMessages(lesson, principles);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain(lesson.theme);
    expect(m[1].content).toContain(principles[0].name);
    expect(m[1].content).toContain('{{');
    expect(m[1].content).toContain('悬停高亮');
  });
  it('move prompt 含用户着法、质量、评估、线路、角度指引、格子高亮', () => {
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
    expect(u).toContain('{{');
    expect(u).toContain('悬停高亮');
    expect(m[0].content).toContain('不要自创');
    expect(m[0].content).toContain('•');
    expect(m[1].content).toContain('→');
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
  it('explore prompt 点明行棋方、上一手错因与正确思路', () => {
    const m = buildExploreMessages({
      fen: START,
      moveHistorySan: ['e4', 'e5', 'Nf3'],
      moveQualities: ['good', 'good', 'inaccuracy'],
      evalCp: 25,
      sideToMove: 'b',
      bestLinesSan: [['Nc6', 'Bc4'], ['Bb5']],
      focusPly: 3,
    });
    const u = m[1].content;
    expect(u).toContain('当前轮到：黑方走棋');
    expect(u).toContain('上一手：白方走了 Nf3（质量：不精确）');
    expect(u).toContain('引擎认为黑方此刻应优先考虑：Nc6');
    expect(u).toContain('错在哪');
    expect(u).toContain('正确思路');
    expect(u).toContain('强格');
    expect(u).toContain('弱格');
    expect(u).toContain('进攻思路');
    expect(u).toContain('{{');
    expect(u).toContain('不要逐手罗列质量标签');
  });
  it('explore 局面讲解带入算出的强格弱格', () => {
    const m = buildExploreMessages({
      fen: 'rn3rk1/1pq2ppp/p2pbb2/4p3/4P3/1NNQ4/PPP1BPPP/2KR3R w - - 4 12',
      moveHistorySan: [],
      moveQualities: [],
      evalCp: 40,
      sideToMove: 'w',
      bestLinesSan: [['Nd5'], ['Kb1']],
      focusPly: 0,
    });
    const u = m[1].content;
    expect(u).toContain('行棋方强格');
    expect(u).toContain('d5');
    expect(u).toContain('进攻思路');
  });
  it('explore 起始局面无上一手', () => {
    const m = buildExploreMessages({
      fen: START,
      moveHistorySan: [],
      moveQualities: [],
      evalCp: 0,
      sideToMove: 'w',
      bestLinesSan: [['e4'], ['d4']],
      focusPly: 0,
    });
    expect(m[1].content).toContain('当前轮到：白方走棋');
    expect(m[1].content).toContain('尚无着法');
  });
  it('follow-up prompt 含主讲解、历史回合、新问题与格子标记规则', () => {
    const m = buildFollowUpMessages({
      fen: START,
      moveHistorySan: ['e4', 'e5'],
      evalCp: 30,
      sideToMove: 'w',
      bestLinesSan: [['Nf3']],
      primaryCommentary: '主讲解内容',
      turns: [{ role: 'user', content: '上一问' }, { role: 'assistant', content: '上一答 {{e4}}' }],
      question: '对方的计划是什么？',
    });
    expect(m[0].content).toContain('{{');
    expect(m[1].content).toContain('主讲解内容');
    expect(m[2].content).toBe('上一问');
    expect(m[3].content).toContain('上一答');
    expect(m[4].content).toBe('对方的计划是什么？');
    expect(FOLLOW_UP_CHIPS.length).toBeGreaterThanOrEqual(3);
    expect(exploreFollowUpThreadId(['a', 'b'], 2)).toBe('explore:a/b');
    expect(exploreFollowUpThreadId(['a', 'b', 'c'], 2)).toBe('explore:a/b');
    expect(exploreFollowUpThreadId(['a', 'b'], 0)).toBe('explore:root');
    expect(lessonFollowUpThreadId('intro')).toBe('lesson:intro');
    expect(lessonFollowUpThreadId('round', 1)).toBe('lesson:round:1');
  });
  it('局面判断 prompt 含视角、计划、战术与棋盘标记', () => {
    const m = buildAssessmentMessages({
      fen: START,
      moveHistorySan: ['e4', 'e5'],
      evalCp: 30,
      sideToMove: 'w',
      perspective: 'b',
      bestLinesSan: [['Nf6', 'Nc3'], ['Nc6']],
    });
    const u = m[1].content;
    expect(u).toContain('黑方');
    expect(u).toContain('轮到白方走');
    expect(u).toContain('计划与方向');
    expect(u).toContain('可能的战术');
    expect(u).toContain('Nf6');
    expect(u).toContain('{{');
  });
  it('追问只带最近 6 轮，并截断过长主讲解', () => {
    const turns = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
      content: `t${i}`,
    }));
    const m = buildFollowUpMessages({
      fen: START, moveHistorySan: [], evalCp: 0, sideToMove: 'w', bestLinesSan: [],
      primaryCommentary: 'x'.repeat(1000), turns, question: 'q',
    });
    // system + context + 6 turns + question
    expect(m).toHaveLength(9);
    expect(m[1].content).toContain('更早的 4 条追问记录已省略');
    expect(m[1].content).not.toContain('x'.repeat(801));
    expect(m[2].content).toBe('t4');
    expect(m[7].content).toBe('t9');
    expect(m[8].content).toBe('q');
  });
});

describe('english prompts', () => {
  afterEach(() => {
    useSettings.getState().setLocalePref('system');
  });

  it('system and user templates follow the English locale', () => {
    useSettings.getState().setLocalePref('en');
    const m = buildIntroMessages(lesson, principles);
    expect(m[0].content).toContain('Explain in clear English');
    expect(m[0].content).not.toContain('用简体中文');
    expect(m[1].content).toContain('Lesson:');
    expect(m[1].content).toContain('hover-highlight');
    expect(m[1].content).not.toContain('课程：');
    expect(m[1].content).not.toContain('悬停高亮');
  });

  it('move, hint, summary, explore, follow-up and assessment prompts are English', () => {
    useSettings.getState().setLocalePref('en');
    const move = buildMoveMessages({
      lesson, fen: lesson.startFen, moveHistorySan: ['d3', 'd6'], userMoveSan: 'd3', quality: 'inaccuracy',
      evalBefore: 30, evalAfter: -20, bestLinesSan: [['O-O', 'O-O', 'Re1'], ['d4', 'exd4']], engineReplySan: 'd6',
      angle: 'compare', principles: [principleById('center-control')], recentCommentary: ['Last round covered development.'],
    });
    expect(move[1].content).toContain('Inaccuracy');
    expect(move[1].content).toContain('Compare to best');
    expect(move[1].content).not.toContain('不精确');

    const hint = buildHintMessages({ lesson, fen: lesson.startFen, moveHistorySan: [], bestLinesSan: [['d3']], principles });
    expect(hint[1].content).toContain('Do not name a concrete move');
    expect(hint[1].content).not.toContain('不要说出具体着法');

    const summary = buildSummaryMessages({
      lesson, moveHistorySan: ['d3', 'd6'], qualities: ['good', 'best'], evalHistory: [20, 35],
      outcome: 'success', reason: 'held', principles, hintUsed: false,
    });
    expect(summary[1].content).toContain('Success');
    expect(summary[1].content).toContain('Best');
    expect(summary[1].content).not.toContain('成功');

    const explore = buildExploreMessages({
      fen: START, moveHistorySan: ['e4', 'e5', 'Nf3'], moveQualities: ['good', 'good', 'inaccuracy'],
      evalCp: 25, sideToMove: 'b', bestLinesSan: [['Nc6', 'Bc4'], ['Bb5']], focusPly: 3,
    });
    expect(explore[1].content).toContain('Black to move');
    expect(explore[1].content).toContain('Last move: White played Nf3 (quality: Inaccuracy)');
    expect(explore[1].content).not.toContain('当前轮到：黑方走棋');

    const follow = buildFollowUpMessages({
      fen: START, moveHistorySan: ['e4'], evalCp: 30, sideToMove: 'w', bestLinesSan: [['Nf3']],
      primaryCommentary: 'Primary note', turns: [], question: 'What is the plan?',
    });
    expect(follow[0].content).toMatch(/follow-up in English/i);
    expect(follow[1].content).toContain('Primary commentary:');
    expect(follow[1].content).not.toContain('主讲解');

    const assess = buildAssessmentMessages({
      fen: START, moveHistorySan: ['e4', 'e5'], evalCp: 30, sideToMove: 'w', perspective: 'b', bestLinesSan: [['Nf6']],
    });
    expect(assess[1].content).toContain('from **Black**');
    expect(assess[1].content).toContain('White to move');
    expect(assess[1].content).not.toContain('请从**黑方**');
  });
});

