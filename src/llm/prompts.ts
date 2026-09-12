import type { Lesson } from '../lessons/schema';
import type { Principle } from '../lessons/principles';
import { QUALITY_LABEL, type Quality } from '../chess/quality';
import { formatEval } from '../chess/notation';
import { squareThemesPromptBlock } from '../chess/squareThemes';
import { ANGLE_GUIDE, ANGLE_LABEL, type Angle } from './angles';
import type { ChatMessage } from './client';

const SYSTEM = `你是一位耐心、有见地的国际象棋教练，用简体中文讲解。规则：
1. 着法一律使用标准代数记谱（如 Nf3、O-O、exd5、Qxh7#）。
2. 只引用用户消息里给出的引擎线路和评估，不要自创着法或线路；如果需要举例变化，只能取自给出的线路，且不超过 4 步。
3. 评估以引擎为准，不要根据自己的判断改写胜负形势。
4. 讲解要有变化：不要每次都用同样的开头；可以从一个反问、一个具体格子、一条棋理或对方的意图切入。
5. 不要与“最近的讲解”重复措辞或重复同一个论点。
6. 用固定结构输出，每行一类内容，不要输出 Markdown 标题或其它格式：
   - 第一行：一句总评（不加前缀）
   - 接下来 2~4 行：每条以「• 」开头的要点（关键判断、战术、棋理或评估变化）
   - 最后一行：以「→ 」开头，提示下一步思考方向（不给具体着法）`;

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

const STRUCTURED_HINT = '按规则 6 的结构输出：总评一行、2~4 条「• 」要点、最后一行「→ 」思考方向。';

/** 课程讲解与自由探索对齐：要点带 {{格子}}，悬停高亮棋盘 */
const LESSON_MARKER_HINT = `输出格式（覆盖规则 6 的要点格式）：
- 第一行：一句总评（可不加格子标记）
- 2~4 行要点，每行以「• {{格子}} 」开头。格子为逗号分隔（如 {{d5,c3}}）；需要指向进攻方向时可写 {{d5,c3|e2-e4}}（| 后为 from-to 箭头）
- 最后一行：以「→ {{格子}} 」开头给思考方向
- 每条涉及棋盘位置的要点必须包含与内容对应的 {{格子}} 标记，供用户悬停高亮棋盘；着法仍只用标准代数记谱`;

const EXPLORE_HINT = `输出格式（覆盖规则 6 的要点格式）：
- 第一行：总评——必须点明**当前轮到谁走**，并一句话概括形势（谁更主动 / 关键矛盾），不加前缀
- 3~5 行要点，每行以「• {{格子}} 」开头。格子为逗号分隔（如 {{d5,c3}}）；进攻方向写 {{d5,c3|e2-e4}}（| 后为 from-to 箭头）
- 要点必须覆盖：① **强格**（前哨，标 {{格子}}）② **弱格**（空洞，标 {{格子}}）③ **进攻思路**（从哪条线/方向施压，尽量用箭头标记；着法必须取自引擎 PV）
- 若上一手质量不佳，再加一条**错在哪**；**正确思路**可与进攻思路合并（着法取自引擎 PV）
- 强格/弱格只能使用「局面格子」列出的格子，没有则写「暂无明显」，不要自编格子
- 最后一行：以「→ {{格子}} 」开头，给行棋方下一步该想的关键问题
- 每条要点必须包含与内容对应的 {{格子}} 标记，供用户在棋盘 hover 高亮`;

const EXPLORE_TOPICS = `讲解重点（以「当前行棋方」为中心，不要写成双方平铺介绍）：
1. 行棋方：明确谁该走、对方刚下了什么
2. 强格：点名行棋方可利用的前哨（必要时也点对方前哨），用 {{格子}} 标出
3. 弱格：点名双方阵营里无法用兵保护的空洞，用 {{格子}} 标出
4. 进攻思路：结合引擎 PV1（及必要时 PV2）说明从哪条线、哪个方向施压；着法只能引用给出的线路，勿自创
5. 若上一手质量不佳（失误/坏棋/漏着等）：解释那步为什么不好——丢了什么、给对方什么、错在哪种思路
6. 不要逐手罗列质量标签`;

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

请用固定结构做开场讲解：第一行一句总评；接下来 2~3 行要点（双方计划、用户最该关注什么、适用的棋理）；最后一行点出首要思考方向。不要给出具体的下一步着法。
${LESSON_MARKER_HINT}` },
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
${good ? '用户走得不错，总评可以简短，把要点留给关键判断和棋理。' : '要点里要说清问题出在哪里，以及引擎线路为何更好。'}
${LESSON_MARKER_HINT}` },
  ];
}

export function buildMoveContinueUser(ctx: MoveContext): ChatMessage {
  const good = ctx.quality === 'best' || ctx.quality === 'good';
  return {
    role: 'user',
    content: `续同一局。用户刚走 ${ctx.userMoveSan}（${QUALITY_LABEL[ctx.quality]}），引擎应手 ${ctx.engineReplySan ?? '（终局）'}。
走子前评估：${formatEval(ctx.evalBefore)}；走子后：${formatEval(ctx.evalAfter)}
当前 FEN：${ctx.fen}
着法记录：${historyText(ctx.moveHistorySan)}
走子前引擎最佳线路：
${linesText(ctx.bestLinesSan)}
本次角度：${ANGLE_LABEL[ctx.angle]}。${ANGLE_GUIDE[ctx.angle]}
${good ? '走得不错，总评简短。' : '说清问题与引擎线路为何更好。'}
按同样结构讲这一回合，不要重复前面已讲过的点。${LESSON_MARKER_HINT}`,
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
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
着法记录：${historyText(ctx.moveHistorySan)}
当前局面 FEN：${ctx.fen}
引擎的最佳线路：
${linesText(ctx.bestLinesSan)}
可引用的棋理：
${principlesText(ctx.principles)}

用户请求提示。用固定结构：第一行一句引导；1~2 行以「• 」开头的思路要点（注意哪个子、哪条线、对方意图）；可选一行「→ 」思考方向。优先用棋理引导，可以用反问。不要说出具体着法，也不要提到任何格子加子力的组合（如“马跳到 e5”）。` },
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

请用固定结构写总结：第一行一句总评；2~4 行以「• 」开头的要点（整体表现、最关键一步、体现的棋理）；最后一行以「→ 」开头，点出下次练习最该注意的一件事。${STRUCTURED_HINT}` },
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

function qualityNotes(history: string[], qualities: (Quality | null)[]): string {
  const notes = history
    .map((san, i) => {
      const q = qualities[i];
      if (!q || q === 'best' || q === 'good') return null;
      return `第${i + 1}手 ${san}：${QUALITY_LABEL[q]}`;
    })
    .filter(Boolean);
  return notes.length ? notes.join('；') : '（无明显问题手）';
}

function lastMoveBlock(history: string[], qualities: (Quality | null)[], focusPly: number): string {
  if (focusPly <= 0 || history.length === 0) return '上一手：（起始局面，尚无着法）';
  const idx = Math.min(focusPly, history.length) - 1;
  const san = history[idx];
  const q = qualities[idx];
  const mover = idx % 2 === 0 ? '白方' : '黑方';
  const label = q ? QUALITY_LABEL[q] : '未标注';
  return `上一手：${mover}走了 ${san}（质量：${label}）`;
}

function bestMoveHint(bestLinesSan: string[][], side: string): string {
  const pv = bestLinesSan[0] ?? [];
  const first = pv[0];
  if (!first) return `引擎主变：暂无（${side}行棋）`;
  return `引擎认为${side}此刻应优先考虑：${first}（PV1 前几步：${pv.slice(0, 4).join(' ')}）`;
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
  const who = ctx.perspective === 'w' ? '白方' : '黑方';
  const turn = ctx.sideToMove === 'w' ? '白方' : '黑方';
  const evalFor = ctx.perspective === 'w' ? ctx.evalCp : -ctx.evalCp;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `请从**${who}**视角做当前局面判断（现在轮到${turn}走）。
当前局面 FEN：${ctx.fen}
着法记录：${historyText(ctx.moveHistorySan)}
引擎评估（${who}视角）：${formatEval(evalFor)}
引擎候选线路（着法只能引用这些，勿自创）：
${linesText(ctx.bestLinesSan)}

输出结构：
- 第一行总评：${who}的形势（优/均/劣）及一句原因
- 2~4 行「• 」要点，必须覆盖：① **计划与方向**（兵形、子力往哪走、哪条线）② **可能的战术**（牵制、捉双、击双、闪击等；若无则写「暂无直接战术」）
- 最后一行「→ 」思考方向
${LESSON_MARKER_HINT}
每条涉及棋盘的要点必须带 {{格子}} 或 {{格子|from-to}}，把计划落点和战术箭头标在棋盘上。` },
  ];
}

export function buildAssessmentContinueUser(ctx: AssessmentContext): ChatMessage {
  const who = ctx.perspective === 'w' ? '白方' : '黑方';
  const turn = ctx.sideToMove === 'w' ? '白方' : '黑方';
  const evalFor = ctx.perspective === 'w' ? ctx.evalCp : -ctx.evalCp;
  return {
    role: 'user',
    content: `局面已更新。请仍从**${who}**视角更新判断（现在轮到${turn}走）。
当前局面 FEN：${ctx.fen}
着法记录：${historyText(ctx.moveHistorySan)}
引擎评估（${who}视角）：${formatEval(evalFor)}
引擎候选线路（着法只能引用这些）：
${linesText(ctx.bestLinesSan)}

只讲相对刚才有变化的计划、方向和战术，不要整段重复。结构与标记规则不变。`,
  };
}

export function buildExploreContinueUser(ctx: ExploreContext): ChatMessage {
  const side = ctx.sideToMove === 'w' ? '白方' : '黑方';
  return {
    role: 'user',
    content: `局面推进到第 ${ctx.focusPly} 手（续同一条线，沿用刚才的讲解）。
${lastMoveBlock(ctx.moveHistorySan, ctx.moveQualities, ctx.focusPly)}
**当前轮到：${side}走棋**
当前局面 FEN：${ctx.fen}
当前评估（白方视角）：${formatEval(ctx.evalCp)}
${bestMoveHint(ctx.bestLinesSan, side)}
引擎推荐线路（着法只能引用这些）：
${linesText(ctx.bestLinesSan)}
${squareThemesPromptBlock(ctx.fen, ctx.sideToMove)}

请按同样结构只讲**这一步之后**的局面：强格、弱格、进攻思路若有变化要更新，没变就不要重复。
${EXPLORE_HINT}`,
  };
}

export function buildExploreMessages(ctx: ExploreContext): ChatMessage[] {
  const side = ctx.sideToMove === 'w' ? '白方' : '黑方';
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `模式：自由探索深度复盘（用户主动请求，非逐步触发）
用户当前复盘到第 ${ctx.focusPly} 手后的局面。
当前局面 FEN：${ctx.fen}
**当前轮到：${side}走棋**
${lastMoveBlock(ctx.moveHistorySan, ctx.moveQualities, ctx.focusPly)}
完整着法线：${historyText(ctx.moveHistorySan)}
当前评估（白方视角）：${formatEval(ctx.evalCp)}
需重点留意的着法：${qualityNotes(ctx.moveHistorySan, ctx.moveQualities)}
${bestMoveHint(ctx.bestLinesSan, side)}
引擎推荐线路：
${linesText(ctx.bestLinesSan)}
${squareThemesPromptBlock(ctx.fen, ctx.sideToMove)}

请围绕**${side}该怎么走**做讲解：先交代行棋方，再讲强格、弱格与进攻思路；上一手若有问题要说明错在哪，进攻方向必须用引擎线路。
${EXPLORE_TOPICS}

${EXPLORE_HINT}` },
  ];
}

const FOLLOW_UP_SYSTEM = `你是一位耐心、有见地的国际象棋教练，用简体中文回答学员追问。规则：
1. 着法一律使用标准代数记谱（如 Nf3、O-O、exd5）。
2. 只引用用户消息里给出的引擎线路和评估，不要自创着法或线路；举例变化只能取自给出的线路，且不超过 4 步。
3. 评估以引擎为准。
4. 结合「主讲解」继续深入，不要整段重复主讲解；直接回答学员的问题。
5. 输出用简短结构：可先一句总评，再用 1~4 行「• 」要点；需要时用「→ 」给思考方向。
6. 涉及具体格子或进攻方向时，必须在对应行内使用 {{格子}} 标记（逗号分隔，如 {{d5,c3}}；箭头写 {{d5,c3|e2-e4}}），供学员悬停高亮棋盘。`;

const FOLLOW_UP_HINT = '回答要具体、可执行；每条涉及棋盘位置的要点都带 {{格子}} 标记。';

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
  const side = ctx.sideToMove === 'w' ? '白方' : '黑方';
  const primary = ctx.primaryCommentary
    ? ctx.primaryCommentary.length > FOLLOW_UP_PRIMARY_MAX_CHARS
      ? `${ctx.primaryCommentary.slice(0, FOLLOW_UP_PRIMARY_MAX_CHARS)}…`
      : ctx.primaryCommentary
    : '（尚无）';
  const dropped = Math.max(0, ctx.turns.length - FOLLOW_UP_MAX_TURNS);
  const recentTurns = ctx.turns.slice(dropped);
  const messages: ChatMessage[] = [
    { role: 'system', content: FOLLOW_UP_SYSTEM },
    {
      role: 'user',
      content: `局面上下文（追问）：
当前局面 FEN：${ctx.fen}
行棋方：${side}
着法记录：${historyText(ctx.moveHistorySan)}
当前评估（白方视角）：${formatEval(ctx.evalCp)}
引擎推荐线路：
${linesText(ctx.bestLinesSan)}

主讲解：
${primary}
${dropped > 0 ? `\n（更早的 ${dropped} 条追问记录已省略，仅保留最近几轮）\n` : ''}
${FOLLOW_UP_HINT}`,
    },
  ];
  for (const t of recentTurns) {
    messages.push({ role: t.role, content: t.content });
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
