import type { Lesson } from '../lessons/schema';
import type { Principle } from '../lessons/principles';
import type { Quality } from '../chess/quality';
import type { Angle } from './angles';
import type { ChatMessage } from './client';
import {
  assessmentUser,
  coachSystem,
  exploreUser,
  followUpContextUser,
  followUpSystem,
  hintUser,
  introUser,
  localizeLesson,
  localizePrinciples,
  moveContinueUser,
  moveUser,
  promptLocale,
  summaryUser,
} from './promptCopy';

/** 各用途的输出上限：prompt 只“建议” 2~4 条要点，这里做硬上限，避免偶发长文拖慢尾部 */
export const LLM_MAX_TOKENS = {
  intro: 500,
  commentary: 600,
  explore: 800,
  followUp: 400,
  hint: 200,
  summary: 800,
  assessment: 550,
} as const;

export function buildIntroMessages(lesson: Lesson, principles: Principle[]): ChatMessage[] {
  const locale = promptLocale();
  return [
    { role: 'system', content: coachSystem(locale) },
    { role: 'user', content: introUser(localizeLesson(lesson, locale), localizePrinciples(principles, locale), locale) },
  ];
}

export interface MoveContext {
  lesson: Lesson;
  fen: string; // 引擎应手后的当前局面
  moveHistorySan: string[]; // 从 startFen 开始的全部着法（含刚走的两步）
  userMoveSan: string;
  quality: Quality;
  evalBefore: number; // 用户视角
  evalAfter: number; // 用户视角，用户走子后
  bestLinesSan: string[][]; // 用户走子前引擎给出的最佳线路
  engineReplySan: string | null; // null 表示用户走完后已终局
  angle: Angle;
  principles: Principle[];
  recentCommentary: string[]; // 最近 ≤3 条讲解的前 80 字
}

export function buildMoveMessages(ctx: MoveContext): ChatMessage[] {
  const locale = promptLocale();
  return [
    { role: 'system', content: coachSystem(locale) },
    {
      role: 'user',
      content: moveUser({
        ...ctx,
        lesson: localizeLesson(ctx.lesson, locale),
        principles: localizePrinciples(ctx.principles, locale),
        locale,
      }),
    },
  ];
}

export function buildMoveContinueUser(ctx: MoveContext): ChatMessage {
  const locale = promptLocale();
  return {
    role: 'user',
    content: moveContinueUser({ ...ctx, locale }),
  };
}

export interface HintContext {
  lesson: Lesson;
  fen: string;
  moveHistorySan: string[];
  bestLinesSan: string[][];
  principles: Principle[];
}

export function buildHintMessages(ctx: HintContext): ChatMessage[] {
  const locale = promptLocale();
  return [
    { role: 'system', content: coachSystem(locale) },
    {
      role: 'user',
      content: hintUser({
        ...ctx,
        lesson: localizeLesson(ctx.lesson, locale),
        principles: localizePrinciples(ctx.principles, locale),
        locale,
      }),
    },
  ];
}

export interface SummaryContext {
  lesson: Lesson;
  moveHistorySan: string[];
  qualities: Quality[];
  evalHistory: number[];
  outcome: 'success' | 'fail';
  reason: string;
  principles: Principle[];
  hintUsed: boolean;
}

export function buildSummaryMessages(ctx: SummaryContext): ChatMessage[] {
  const locale = promptLocale();
  return [
    { role: 'system', content: coachSystem(locale) },
    {
      role: 'user',
      content: summaryUser({
        ...ctx,
        lesson: localizeLesson(ctx.lesson, locale),
        principles: localizePrinciples(ctx.principles, locale),
        locale,
      }),
    },
  ];
}

export interface ExploreContext {
  fen: string;
  moveHistorySan: string[];
  moveQualities: (Quality | null)[];
  evalCp: number; // 白方视角
  sideToMove: 'w' | 'b';
  bestLinesSan: string[][];
  focusPly: number;
}

export interface AssessmentContext {
  fen: string;
  moveHistorySan: string[];
  /** 白方视角 */
  evalCp: number;
  sideToMove: 'w' | 'b';
  /** 从哪一方做判断 */
  perspective: 'w' | 'b';
  bestLinesSan: string[][];
}

export function buildAssessmentMessages(ctx: AssessmentContext): ChatMessage[] {
  const locale = promptLocale();
  return [
    { role: 'system', content: coachSystem(locale) },
    { role: 'user', content: assessmentUser({ ...ctx, locale }) },
  ];
}

export function buildAssessmentContinueUser(ctx: AssessmentContext): ChatMessage {
  const locale = promptLocale();
  return {
    role: 'user',
    content: assessmentUser({ ...ctx, locale, continueTurn: true }),
  };
}

export function buildExploreContinueUser(ctx: ExploreContext): ChatMessage {
  const locale = promptLocale();
  return {
    role: 'user',
    content: exploreUser({ ...ctx, locale, continueTurn: true }),
  };
}

export function buildExploreMessages(ctx: ExploreContext): ChatMessage[] {
  const locale = promptLocale();
  return [
    { role: 'system', content: coachSystem(locale) },
    { role: 'user', content: exploreUser({ ...ctx, locale }) },
  ];
}

export const FOLLOW_UP_CHIPS = [
  '对方的计划是什么？',
  '关键弱点在哪？',
  '若走引擎次选会怎样？',
  '我该优先改善哪颗子？',
] as const;

export interface FollowUpTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface FollowUpContext {
  fen: string;
  moveHistorySan: string[];
  evalCp: number;
  sideToMove: 'w' | 'b';
  bestLinesSan: string[][];
  primaryCommentary: string;
  turns: FollowUpTurn[]; // prior turns only (not including the new question)
  question: string;
}

/** 追问上下文只带最近几轮，避免多轮后 prompt 线性变长拖慢 prefill */
const FOLLOW_UP_MAX_TURNS = 6;
const FOLLOW_UP_PRIMARY_MAX_CHARS = 800;

export function buildFollowUpMessages(ctx: FollowUpContext): ChatMessage[] {
  const locale = promptLocale();
  const primary = ctx.primaryCommentary
    ? ctx.primaryCommentary.length > FOLLOW_UP_PRIMARY_MAX_CHARS
      ? `${ctx.primaryCommentary.slice(0, FOLLOW_UP_PRIMARY_MAX_CHARS)}…`
      : ctx.primaryCommentary
    : locale === 'en' ? '(none yet)' : '（尚无）';
  const dropped = Math.max(0, ctx.turns.length - FOLLOW_UP_MAX_TURNS);
  const recentTurns = ctx.turns.slice(dropped);
  const messages: ChatMessage[] = [
    { role: 'system', content: followUpSystem(locale) },
    {
      role: 'user',
      content: followUpContextUser({
        fen: ctx.fen,
        moveHistorySan: ctx.moveHistorySan,
        evalCp: ctx.evalCp,
        sideToMove: ctx.sideToMove,
        bestLinesSan: ctx.bestLinesSan,
        primary,
        dropped,
        locale,
      }),
    },
  ];
  for (const turn of recentTurns) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: 'user', content: ctx.question });
  return messages;
}

/** Session key for a position: only the path *to* that ply (not later tip moves).
 * Same line → same session when revisiting; a fork changes the prefix → new session.
 */
export function exploreFollowUpThreadId(path: string[], ply: number): string {
  const at = path.slice(0, Math.max(0, ply));
  return `explore:${at.join('/') || 'root'}`;
}

export function lessonFollowUpThreadId(kind: 'intro' | 'round', roundIndex?: number): string {
  return kind === 'intro' ? 'lesson:intro' : `lesson:round:${roundIndex ?? 0}`;
}
