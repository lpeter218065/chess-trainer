import type { Lesson } from '../lessons/schema';
import type { Principle } from '../lessons/principles';
import { QUALITY_LABEL, type Quality } from '../chess/quality';
import { formatEval } from '../chess/notation';
import { ANGLE_GUIDE, ANGLE_LABEL, type Angle } from './angles';
import type { ChatMessage } from './client';

const SYSTEM = `你是一位耐心、有见地的国际象棋教练，用简体中文讲解。规则：
1. 着法一律使用标准代数记谱（如 Nf3、O-O、exd5、Qxh7#）。
2. 只引用用户消息里给出的引擎线路和评估，不要自创着法或线路；如果需要举例变化，只能取自给出的线路，且不超过 4 步。
3. 评估以引擎为准，不要根据自己的判断改写胜负形势。
4. 讲解要有变化：不要每次都用同样的开头、同样的“先评价再建议”结构；可以从一个反问、一个具体格子、一条棋理或对方的意图切入。
5. 不要与“最近的讲解”重复措辞或重复同一个论点。
6. 不要输出标题、列表符号或 Markdown，只输出自然段落。`;

function principlesText(ps: Principle[]): string {
  if (ps.length === 0) return '（无）';
  return ps.map((p) => `【${p.name}】${p.statement} 原因：${p.why}${p.exceptions ? ` 例外：${p.exceptions}` : ''}`).join('\n');
}

function linesText(lines: string[][]): string {
  return lines.map((l, i) => `PV${i + 1}: ${l.join(' ')}`).join('\n');
}

function historyText(sans: string[]): string {
  if (sans.length === 0) return '（尚未走棋）';
  return sans.map((s, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${s}` : s)).join(' ');
}

export function buildIntroMessages(lesson: Lesson, principles: Principle[]): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${lesson.title}
执棋方：${lesson.playerColor === 'w' ? '白方' : '黑方'}（用户）
起始局面 FEN：${lesson.startFen}
本课主题：${lesson.theme}
关键思路：${lesson.keyIdeas.join('；')}
本课棋理：
${principlesText(principles)}

请用 4~6 句话做开场讲解：这个局面里双方各自的计划是什么，用户这一方最该关注什么，并点出 1~2 条上面的棋理为什么在这里适用。不要给出具体的下一步着法。` },
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
  const good = ctx.quality === 'best' || ctx.quality === 'good';
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
关键思路：${ctx.lesson.keyIdeas.join('；')}
着法记录：${historyText(ctx.moveHistorySan)}
用户刚走：${ctx.userMoveSan}，引擎判定：${QUALITY_LABEL[ctx.quality]}
走子前评估（用户视角）：${formatEval(ctx.evalBefore)}；走子后：${formatEval(ctx.evalAfter)}
走子前引擎认为的最佳线路：
${linesText(ctx.bestLinesSan)}
引擎的应手：${ctx.engineReplySan ?? '（对局已结束）'}
当前局面 FEN：${ctx.fen}
可引用的棋理：
${principlesText(ctx.principles)}
最近的讲解（避免重复）：
${ctx.recentCommentary.length ? ctx.recentCommentary.map((c) => `- ${c}`).join('\n') : '（无）'}

本次讲解角度：${ANGLE_LABEL[ctx.angle]}。${ANGLE_GUIDE[ctx.angle]}
篇幅 ${good ? '3~5' : '4~7'} 句。${good ? '用户走得不错，评价可以简短，把篇幅留给角度里的内容。' : '先说清问题在哪里，再展开。'}最后用一句话提示用户接下来该思考的方向（不给具体着法）。` },
  ];
}

export interface HintContext {
  lesson: Lesson;
  fen: string;
  moveHistorySan: string[];
  bestLinesSan: string[][];
  principles: Principle[];
}

export function buildHintMessages(ctx: HintContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
着法记录：${historyText(ctx.moveHistorySan)}
当前局面 FEN：${ctx.fen}
引擎的最佳线路：
${linesText(ctx.bestLinesSan)}
可引用的棋理：
${principlesText(ctx.principles)}

用户请求提示。请用 1~2 句话点出思路方向（例如该注意哪个子、哪条线、对方的什么意图），优先用棋理引导，可以用一个反问。不要说出具体着法，也不要提到任何格子加子力的组合（如“马跳到 e5”）。` },
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
  const rounds = ctx.qualities.map((q, i) => `第${i + 1}回合 ${ctx.moveHistorySan[i * 2] ?? ''}：${QUALITY_LABEL[q]}，评估 ${formatEval(ctx.evalHistory[i] ?? 0)}`).join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
关键思路：${ctx.lesson.keyIdeas.join('；')}
本课棋理：
${principlesText(ctx.principles)}
完整着法：${historyText(ctx.moveHistorySan)}
每回合评价：
${rounds}
结果：${ctx.outcome === 'success' ? '成功' : '未达成'}（${ctx.reason}）${ctx.hintUsed ? '，过程中使用了提示' : ''}

请写一段 5~8 句的总结：整体表现如何；哪一步最关键（做对或做错）；本局体现了哪几条棋理，用户是否遵循了它们；下次练习这个主题时最该注意的一件事。` },
  ];
}
