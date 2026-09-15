import type { Principle } from '../lessons/principles';
import type { Lesson } from '../lessons/schema';
import { QUALITY_LABEL, type Quality } from '../chess/quality';
import { formatEval } from '../chess/notation';
import { squareThemesPromptBlock } from '../chess/squareThemes';
import { ANGLE_LABEL, angleGuide, type Angle } from './angles';
import { liveLocale } from '../i18n/live';
import { localizeContent } from '../i18n/content';
import { t } from '../i18n/t';
import type { Locale } from '../i18n/locale';
import type { ChromeKey } from '../i18n/chrome';

export function promptLocale(): Locale {
  return liveLocale();
}

export function sideName(color: 'w' | 'b', locale: Locale): string {
  return locale === 'en' ? (color === 'w' ? 'White' : 'Black') : (color === 'w' ? '白方' : '黑方');
}

export function qualityWord(q: Quality, locale: Locale): string {
  return t(locale, `quality.${q}` as ChromeKey);
}

export function angleWord(angle: Angle, locale: Locale): string {
  return t(locale, `angle.${angle}` as ChromeKey);
}

function noneMark(locale: Locale): string {
  return locale === 'en' ? '(none)' : '（无）';
}

export function principlesText(ps: Principle[], locale: Locale): string {
  if (ps.length === 0) return noneMark(locale);
  return ps
    .map((p) =>
      locale === 'en'
        ? `[${p.name}] ${p.statement} Why: ${p.why}${p.exceptions ? ` Exception: ${p.exceptions}` : ''}`
        : `【${p.name}】${p.statement} 原因：${p.why}${p.exceptions ? ` 例外：${p.exceptions}` : ''}`,
    )
    .join('\n');
}

export function linesText(lines: string[][]): string {
  return lines.map((l, i) => `PV${i + 1}: ${l.join(' ')}`).join('\n');
}

export function historyText(sans: string[], locale: Locale): string {
  if (sans.length === 0) return locale === 'en' ? '(no moves yet)' : '（尚未走棋）';
  return sans.map((s, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${s}` : s)).join(' ');
}

export function localizeLesson(lesson: Lesson, locale: Locale): Lesson {
  return localizeContent(lesson, locale);
}

export function localizePrinciples(ps: Principle[], locale: Locale): Principle[] {
  return localizeContent(ps, locale);
}

export const SYSTEM_ZH = `你是一位耐心、有见地的国际象棋教练，用简体中文讲解。规则：
1. 着法一律使用标准代数记谱（如 Nf3、O-O、exd5、Qxh7#）。
2. 只引用用户消息里给出的引擎线路和评估，不要自创着法或线路；如果需要举例变化，只能取自给出的线路，且不超过 4 步。
3. 评估以引擎为准，不要根据自己的判断改写胜负形势。
4. 讲解要有变化：不要每次都用同样的开头；可以从一个反问、一个具体格子、一条棋理或对方的意图切入。
5. 不要与“最近的讲解”重复措辞或重复同一个论点。
6. 用固定结构输出，每行一类内容，不要输出 Markdown 标题或其它格式：
   - 第一行：一句总评（不加前缀）
   - 接下来 2~4 行：每条以「• 」开头的要点（关键判断、战术、棋理或评估变化）
   - 最后一行：以「→ 」开头，提示下一步思考方向（不给具体着法）`;

export const SYSTEM_EN = `You are a patient, insightful chess coach. Explain in clear English. Rules:
1. Moves always in standard algebraic (Nf3, O-O, exd5, Qxh7#).
2. Only quote engine lines and evals given in the user message; do not invent moves. Examples at most 4 plies from those lines.
3. Trust the engine eval; do not rewrite the assessment from your own judgment.
4. Vary the commentary. Start from a question, a square, a principle, or the opponent’s idea — not the same opener every time.
5. Do not repeat recent wording or the same point.
6. Fixed structure, one kind of line, no Markdown headings:
   - First line: one overall sentence (no prefix)
   - Next 2–4 lines: bullets starting with “• ” (judgment, tactics, principle, or eval change)
   - Last line: starts with “→ ”, a thinking direction (no concrete move)`;

export function coachSystem(locale: Locale = promptLocale()): string {
  return locale === 'en' ? SYSTEM_EN : SYSTEM_ZH;
}

export const STRUCTURED_HINT_ZH = '按规则 6 的结构输出：总评一行、2~4 条「• 」要点、最后一行「→ 」思考方向。';
export const STRUCTURED_HINT_EN = 'Follow rule 6: one overall sentence, 2–4 “• ” bullets, last line a “→ ” thinking direction.';

export const LESSON_MARKER_HINT_ZH = `输出格式（覆盖规则 6 的要点格式）：
- 第一行：一句总评（可不加格子标记）
- 2~4 行要点，每行以「• {{格子}} 」开头。格子为逗号分隔（如 {{d5,c3}}）；需要指向进攻方向时可写 {{d5,c3|e2-e4}}（| 后为 from-to 箭头）
- 最后一行：以「→ {{格子}} 」开头给思考方向
- 每条涉及棋盘位置的要点必须包含与内容对应的 {{格子}} 标记，供用户悬停高亮棋盘；着法仍只用标准代数记谱`;

export const LESSON_MARKER_HINT_EN = `Output format (overrides rule 6 bullet format):
- First line: one overall sentence (square markers optional)
- 2–4 bullets, each starting with “• {{squares}} ”. Squares comma-separated ({{d5,c3}}); for an attack direction write {{d5,c3|e2-e4}} (| then from-to arrow)
- Last line: starts with “→ {{squares}} ” as a thinking direction
- Every board-related bullet must include matching {{squares}} so the user can hover-highlight the board; moves stay in standard algebraic`;

export const EXPLORE_HINT_ZH = `输出格式（覆盖规则 6 的要点格式）：
- 第一行：总评——必须点明**当前轮到谁走**，并一句话概括形势（谁更主动 / 关键矛盾），不加前缀
- 3~5 行要点，每行以「• {{格子}} 」开头。格子为逗号分隔（如 {{d5,c3}}）；进攻方向写 {{d5,c3|e2-e4}}（| 后为 from-to 箭头）
- 要点必须覆盖：① **强格**（前哨，标 {{格子}}）② **弱格**（空洞，标 {{格子}}）③ **进攻思路**（从哪条线/方向施压，尽量用箭头标记；着法必须取自引擎 PV）
- 若上一手质量不佳，再加一条**错在哪**；**正确思路**可与进攻思路合并（着法取自引擎 PV）
- 强格/弱格只能使用「局面格子」列出的格子，没有则写「暂无明显」，不要自编格子
- 最后一行：以「→ {{格子}} 」开头，给行棋方下一步该想的关键问题
- 每条要点必须包含与内容对应的 {{格子}} 标记，供用户在棋盘 hover 高亮`;

export const EXPLORE_HINT_EN = `Output format (overrides rule 6 bullet format):
- First line: overall — must name **who is to move**, then one sentence on the fight (who is more active / the key tension), no prefix
- 3–5 bullets, each starting with “• {{squares}} ”. Squares comma-separated ({{d5,c3}}); attacks {{d5,c3|e2-e4}}
- Cover: (1) **strong squares** (outposts, mark {{squares}}) (2) **weak squares** (holes, mark {{squares}}) (3) **attacking idea** (which file/direction; arrows preferred; moves only from the engine PV)
- If the last move was poor, add **what went wrong**; **the right idea** may merge with the attacking idea (moves from the engine PV)
- Strong/weak squares may only be squares listed under “board squares”; if none, write “none obvious” — do not invent squares
- Last line: starts with “→ {{squares}} ”, the key question for the side to move
- Every bullet needs matching {{squares}} so the user can hover-highlight the board`;

export const EXPLORE_TOPICS_ZH = `讲解重点（以「当前行棋方」为中心，不要写成双方平铺介绍）：
1. 行棋方：明确谁该走、对方刚下了什么
2. 强格：点名行棋方可利用的前哨（必要时也点对方前哨），用 {{格子}} 标出
3. 弱格：点名双方阵营里无法用兵保护的空洞，用 {{格子}} 标出
4. 进攻思路：结合引擎 PV1（及必要时 PV2）说明从哪条线、哪个方向施压；着法只能引用给出的线路，勿自创
5. 若上一手质量不佳（失误/坏棋/漏着等）：解释那步为什么不好——丢了什么、给对方什么、错在哪种思路
6. 不要逐手罗列质量标签`;

export const EXPLORE_TOPICS_EN = `Focus (around the side to move — not a flat both-sides tour):
1. Side to move: who is to move, and what the opponent just played
2. Strong squares: name outposts the side to move can use (and the opponent’s if needed), mark {{squares}}
3. Weak squares: name holes in both camps that pawns cannot cover, mark {{squares}}
4. Attacking idea: from PV1 (and PV2 if needed), say which file/direction to press; quote only the given lines
5. If the last move was poor (inaccuracy/mistake/blunder): say why — what was lost, what was given, which idea failed
6. Do not list quality labels move by move`;

export const FOLLOW_UP_SYSTEM_ZH = `你是一位耐心、有见地的国际象棋教练，用简体中文回答学员追问。规则：
1. 着法一律使用标准代数记谱（如 Nf3、O-O、exd5）。
2. 只引用用户消息里给出的引擎线路和评估，不要自创着法或线路；举例变化只能取自给出的线路，且不超过 4 步。
3. 评估以引擎为准。
4. 结合「主讲解」继续深入，不要整段重复主讲解；直接回答学员的问题。
5. 输出用简短结构：可先一句总评，再用 1~4 行「• 」要点；需要时用「→ 」给思考方向。
6. 涉及具体格子或进攻方向时，必须在对应行内使用 {{格子}} 标记（逗号分隔，如 {{d5,c3}}；箭头写 {{d5,c3|e2-e4}}），供学员悬停高亮棋盘。`;

export const FOLLOW_UP_SYSTEM_EN = `You are a patient, insightful chess coach. Answer the student's follow-up in English. Rules:
1. Moves always in standard algebraic (Nf3, O-O, exd5).
2. Only quote engine lines and evals given in the user message; do not invent moves. Examples at most 4 plies from those lines.
3. Trust the engine eval.
4. Go deeper from the primary commentary; do not repeat it wholesale. Answer the question directly.
5. Short structure: one overall sentence is fine, then 1–4 “• ” bullets; use “→ ” for a thinking direction when useful.
6. When a square or attack direction matters, mark it on that line with {{squares}} (comma-separated, {{d5,c3}}; arrows {{d5,c3|e2-e4}}) so the student can hover-highlight the board.`;

export function structuredHint(locale: Locale): string {
  return locale === 'en' ? STRUCTURED_HINT_EN : STRUCTURED_HINT_ZH;
}

export function lessonMarkerHint(locale: Locale): string {
  return locale === 'en' ? LESSON_MARKER_HINT_EN : LESSON_MARKER_HINT_ZH;
}

export function exploreHint(locale: Locale): string {
  return locale === 'en' ? EXPLORE_HINT_EN : EXPLORE_HINT_ZH;
}

export function exploreTopics(locale: Locale): string {
  return locale === 'en' ? EXPLORE_TOPICS_EN : EXPLORE_TOPICS_ZH;
}

export function followUpSystem(locale: Locale): string {
  return locale === 'en' ? FOLLOW_UP_SYSTEM_EN : FOLLOW_UP_SYSTEM_ZH;
}

export function followUpHint(locale: Locale): string {
  return locale === 'en'
    ? 'Be concrete and usable; every board-related bullet includes {{squares}}.'
    : '回答要具体、可执行；每条涉及棋盘位置的要点都带 {{格子}} 标记。';
}

export function introUser(lesson: Lesson, principles: Principle[], locale: Locale): string {
  const side = `${sideName(lesson.playerColor, locale)}${locale === 'en' ? ' (you)' : '（用户）'}`;
  if (locale === 'en') {
    return `Lesson: ${lesson.title}
Side: ${side}
Start FEN: ${lesson.startFen}
Theme: ${lesson.theme}
Key ideas: ${lesson.keyIdeas.join('; ')}
Principles:
${principlesText(principles, locale)}

Give an opening explanation in the fixed structure: first line one overall sentence; next 2–3 bullets (both sides’ plans, what the user should watch, applicable principles); last line the main thinking direction. Do not give a concrete next move.
${lessonMarkerHint(locale)}`;
  }
  return `课程：${lesson.title}
执棋方：${side}
起始局面 FEN：${lesson.startFen}
本课主题：${lesson.theme}
关键思路：${lesson.keyIdeas.join('；')}
本课棋理：
${principlesText(principles, locale)}

请用固定结构做开场讲解：第一行一句总评；接下来 2~3 行要点（双方计划、用户最该关注什么、适用的棋理）；最后一行点出首要思考方向。不要给出具体的下一步着法。
${lessonMarkerHint(locale)}`;
}

export function moveUser(opts: {
  lesson: Lesson;
  fen: string;
  moveHistorySan: string[];
  userMoveSan: string;
  quality: Quality;
  evalBefore: number;
  evalAfter: number;
  bestLinesSan: string[][];
  engineReplySan: string | null;
  angle: Angle;
  principles: Principle[];
  recentCommentary: string[];
  locale: Locale;
}): string {
  const { locale } = opts;
  const q = qualityWord(opts.quality, locale);
  const good = opts.quality === 'best' || opts.quality === 'good';
  const recent = opts.recentCommentary.length
    ? opts.recentCommentary.map((c) => `- ${c}`).join('\n')
    : noneMark(locale);
  const reply = opts.engineReplySan ?? (locale === 'en' ? '(game over)' : '（对局已结束）');
  const angleLine = `${angleWord(opts.angle, locale)}. ${angleGuide(opts.angle, locale)}`;
  if (locale === 'en') {
    return `Lesson: ${opts.lesson.title} (theme: ${opts.lesson.theme})
Key ideas: ${opts.lesson.keyIdeas.join('; ')}
Moves: ${historyText(opts.moveHistorySan, locale)}
User just played: ${opts.userMoveSan}, engine verdict: ${q}
Eval before (user’s view): ${formatEval(opts.evalBefore)}; after: ${formatEval(opts.evalAfter)}
Engine best lines before the move:
${linesText(opts.bestLinesSan)}
Engine reply: ${reply}
Current FEN: ${opts.fen}
Principles you may quote:
${principlesText(opts.principles, locale)}
Recent commentary (do not repeat):
${recent}

Angle this time: ${angleLine}
${good ? 'The user played well — keep the overall sentence short and leave the bullets for the key judgment and principle.' : 'The bullets should say where it went wrong, and why the engine line is better.'}
${lessonMarkerHint(locale)}`;
  }
  return `课程：${opts.lesson.title}（主题：${opts.lesson.theme}）
关键思路：${opts.lesson.keyIdeas.join('；')}
着法记录：${historyText(opts.moveHistorySan, locale)}
用户刚走：${opts.userMoveSan}，引擎判定：${QUALITY_LABEL[opts.quality]}
走子前评估（用户视角）：${formatEval(opts.evalBefore)}；走子后：${formatEval(opts.evalAfter)}
走子前引擎认为的最佳线路：
${linesText(opts.bestLinesSan)}
引擎的应手：${reply}
当前局面 FEN：${opts.fen}
可引用的棋理：
${principlesText(opts.principles, locale)}
最近的讲解（避免重复）：
${recent}

本次讲解角度：${ANGLE_LABEL[opts.angle]}。${angleGuide(opts.angle, locale)}
${good ? '用户走得不错，总评可以简短，把要点留给关键判断和棋理。' : '要点里要说清问题出在哪里，以及引擎线路为何更好。'}
${lessonMarkerHint(locale)}`;
}

export function moveContinueUser(opts: {
  userMoveSan: string;
  quality: Quality;
  engineReplySan: string | null;
  evalBefore: number;
  evalAfter: number;
  fen: string;
  moveHistorySan: string[];
  bestLinesSan: string[][];
  angle: Angle;
  locale: Locale;
}): string {
  const { locale } = opts;
  const q = locale === 'en' ? qualityWord(opts.quality, locale) : QUALITY_LABEL[opts.quality];
  const good = opts.quality === 'best' || opts.quality === 'good';
  const reply = opts.engineReplySan ?? (locale === 'en' ? '(game over)' : '（终局）');
  if (locale === 'en') {
    return `Continue the same game. User just played ${opts.userMoveSan} (${q}), engine replied ${reply}.
Eval before: ${formatEval(opts.evalBefore)}; after: ${formatEval(opts.evalAfter)}
Current FEN: ${opts.fen}
Moves: ${historyText(opts.moveHistorySan, locale)}
Engine best lines before the move:
${linesText(opts.bestLinesSan)}
Angle this time: ${angleWord(opts.angle, locale)}. ${angleGuide(opts.angle, locale)}
${good ? 'Played well — keep the overall sentence short.' : 'Say where it went wrong and why the engine line is better.'}
Same structure for this turn; do not repeat points already made. ${lessonMarkerHint(locale)}`;
  }
  return `续同一局。用户刚走 ${opts.userMoveSan}（${q}），引擎应手 ${reply}。
走子前评估：${formatEval(opts.evalBefore)}；走子后：${formatEval(opts.evalAfter)}
当前 FEN：${opts.fen}
着法记录：${historyText(opts.moveHistorySan, locale)}
走子前引擎最佳线路：
${linesText(opts.bestLinesSan)}
本次角度：${ANGLE_LABEL[opts.angle]}。${angleGuide(opts.angle, locale)}
${good ? '走得不错，总评简短。' : '说清问题与引擎线路为何更好。'}
按同样结构讲这一回合，不要重复前面已讲过的点。${lessonMarkerHint(locale)}`;
}

export function hintUser(opts: {
  lesson: Lesson;
  fen: string;
  moveHistorySan: string[];
  bestLinesSan: string[][];
  principles: Principle[];
  locale: Locale;
}): string {
  const { locale } = opts;
  if (locale === 'en') {
    return `Lesson: ${opts.lesson.title} (theme: ${opts.lesson.theme})
Moves: ${historyText(opts.moveHistorySan, locale)}
Current FEN: ${opts.fen}
Engine best lines:
${linesText(opts.bestLinesSan)}
Principles you may quote:
${principlesText(opts.principles, locale)}

The user asked for a hint. Fixed structure: first line one steer; 1–2 “• ” idea bullets (which piece, which file, the opponent’s idea); optional “→ ” thinking direction. Prefer principles; a question is fine. Do not name a concrete move, and do not mention any piece-plus-square combo (e.g. “knight to e5”).`;
  }
  return `课程：${opts.lesson.title}（主题：${opts.lesson.theme}）
着法记录：${historyText(opts.moveHistorySan, locale)}
当前局面 FEN：${opts.fen}
引擎的最佳线路：
${linesText(opts.bestLinesSan)}
可引用的棋理：
${principlesText(opts.principles, locale)}

用户请求提示。用固定结构：第一行一句引导；1~2 行以「• 」开头的思路要点（注意哪个子、哪条线、对方意图）；可选一行「→ 」思考方向。优先用棋理引导，可以用反问。不要说出具体着法，也不要提到任何格子加子力的组合（如“马跳到 e5”）。`;
}

export function summaryUser(opts: {
  lesson: Lesson;
  moveHistorySan: string[];
  qualities: Quality[];
  evalHistory: number[];
  outcome: 'success' | 'fail';
  reason: string;
  principles: Principle[];
  hintUsed: boolean;
  locale: Locale;
}): string {
  const { locale } = opts;
  const rounds = opts.qualities
    .map((q, i) =>
      locale === 'en'
        ? `Round ${i + 1} ${opts.moveHistorySan[i * 2] ?? ''}: ${qualityWord(q, locale)}, eval ${formatEval(opts.evalHistory[i] ?? 0)}`
        : `第${i + 1}回合 ${opts.moveHistorySan[i * 2] ?? ''}：${QUALITY_LABEL[q]}，评估 ${formatEval(opts.evalHistory[i] ?? 0)}`,
    )
    .join('\n');
  const result = locale === 'en'
    ? `${opts.outcome === 'success' ? 'Success' : 'Missed' } (${opts.reason})${opts.hintUsed ? ', hints were used' : ''}`
    : `${opts.outcome === 'success' ? '成功' : '未达成'}（${opts.reason}）${opts.hintUsed ? '，过程中使用了提示' : ''}`;
  if (locale === 'en') {
    return `Lesson: ${opts.lesson.title} (theme: ${opts.lesson.theme})
Key ideas: ${opts.lesson.keyIdeas.join('; ')}
Principles:
${principlesText(opts.principles, locale)}
Full moves: ${historyText(opts.moveHistorySan, locale)}
Round-by-round:
${rounds}
Result: ${result}

Write a summary in the fixed structure: first line one overall sentence; 2–4 “• ” bullets (overall play, the key move, the principle shown); last line starts with “→ ”, the one thing to watch next time. ${structuredHint(locale)}`;
  }
  return `课程：${opts.lesson.title}（主题：${opts.lesson.theme}）
关键思路：${opts.lesson.keyIdeas.join('；')}
本课棋理：
${principlesText(opts.principles, locale)}
完整着法：${historyText(opts.moveHistorySan, locale)}
每回合评价：
${rounds}
结果：${result}

请用固定结构写总结：第一行一句总评；2~4 行以「• 」开头的要点（整体表现、最关键一步、体现的棋理）；最后一行以「→ 」开头，点出下次练习最该注意的一件事。${structuredHint(locale)}`;
}

function qualityNotes(history: string[], qualities: (Quality | null)[], locale: Locale): string {
  const notes = history
    .map((san, i) => {
      const q = qualities[i];
      if (!q || q === 'best' || q === 'good') return null;
      return locale === 'en'
        ? `Move ${i + 1} ${san}: ${qualityWord(q, locale)}`
        : `第${i + 1}手 ${san}：${QUALITY_LABEL[q]}`;
    })
    .filter(Boolean);
  if (notes.length) return notes.join(locale === 'en' ? '; ' : '；');
  return locale === 'en' ? '(no problem moves)' : '（无明显问题手）';
}

function lastMoveBlock(history: string[], qualities: (Quality | null)[], focusPly: number, locale: Locale): string {
  if (focusPly <= 0 || history.length === 0) {
    return locale === 'en' ? 'Last move: (starting position, no moves yet)' : '上一手：（起始局面，尚无着法）';
  }
  const idx = Math.min(focusPly, history.length) - 1;
  const san = history[idx];
  const q = qualities[idx];
  const mover = sideName(idx % 2 === 0 ? 'w' : 'b', locale);
  const label = q ? (locale === 'en' ? qualityWord(q, locale) : QUALITY_LABEL[q]) : (locale === 'en' ? 'unmarked' : '未标注');
  return locale === 'en'
    ? `Last move: ${mover} played ${san} (quality: ${label})`
    : `上一手：${mover}走了 ${san}（质量：${label}）`;
}

function bestMoveHint(bestLinesSan: string[][], side: string, locale: Locale): string {
  const pv = bestLinesSan[0] ?? [];
  const first = pv[0];
  if (!first) {
    return locale === 'en' ? `Engine main line: none (${side} to move)` : `引擎主变：暂无（${side}行棋）`;
  }
  return locale === 'en'
    ? `The engine thinks ${side} should first consider: ${first} (PV1 start: ${pv.slice(0, 4).join(' ')})`
    : `引擎认为${side}此刻应优先考虑：${first}（PV1 前几步：${pv.slice(0, 4).join(' ')}）`;
}

export function exploreUser(opts: {
  fen: string;
  moveHistorySan: string[];
  moveQualities: (Quality | null)[];
  evalCp: number;
  sideToMove: 'w' | 'b';
  bestLinesSan: string[][];
  focusPly: number;
  locale: Locale;
  continueTurn?: boolean;
}): string {
  const { locale } = opts;
  const side = sideName(opts.sideToMove, locale);
  const last = lastMoveBlock(opts.moveHistorySan, opts.moveQualities, opts.focusPly, locale);
  const themes = squareThemesPromptBlock(opts.fen, opts.sideToMove, locale);
  if (opts.continueTurn) {
    if (locale === 'en') {
      return `The position has moved on to ply ${opts.focusPly} (same line, keep the earlier commentary).
${last}
**${side} to move**
Current FEN: ${opts.fen}
Eval (White’s view): ${formatEval(opts.evalCp)}
${bestMoveHint(opts.bestLinesSan, side, locale)}
Engine lines (quote only these):
${linesText(opts.bestLinesSan)}
${themes}

Same structure, only this position after the last move: update strong squares, weak squares, and the attacking idea if they changed; if not, do not repeat.
${exploreHint(locale)}`;
    }
    return `局面推进到第 ${opts.focusPly} 手（续同一条线，沿用刚才的讲解）。
${last}
**当前轮到：${side}走棋**
当前局面 FEN：${opts.fen}
当前评估（白方视角）：${formatEval(opts.evalCp)}
${bestMoveHint(opts.bestLinesSan, side, locale)}
引擎推荐线路（着法只能引用这些）：
${linesText(opts.bestLinesSan)}
${themes}

请按同样结构只讲**这一步之后**的局面：强格、弱格、进攻思路若有变化要更新，没变就不要重复。
${exploreHint(locale)}`;
  }
  if (locale === 'en') {
    return `Mode: free explore, deep review (user asked; not ply-by-ply)
The user is reviewing the position after ply ${opts.focusPly}.
Current FEN: ${opts.fen}
**${side} to move**
${last}
Full line: ${historyText(opts.moveHistorySan, locale)}
Eval (White’s view): ${formatEval(opts.evalCp)}
Moves to watch: ${qualityNotes(opts.moveHistorySan, opts.moveQualities, locale)}
${bestMoveHint(opts.bestLinesSan, side, locale)}
Engine lines:
${linesText(opts.bestLinesSan)}
${themes}

Explain **how ${side} should play**: name the side to move, then strong squares, weak squares, and the attacking idea; if the last move was a problem, say what went wrong; attacking direction must use the engine lines.
${exploreTopics(locale)}

${exploreHint(locale)}`;
  }
  return `模式：自由探索深度复盘（用户主动请求，非逐步触发）
用户当前复盘到第 ${opts.focusPly} 手后的局面。
当前局面 FEN：${opts.fen}
**当前轮到：${side}走棋**
${last}
完整着法线：${historyText(opts.moveHistorySan, locale)}
当前评估（白方视角）：${formatEval(opts.evalCp)}
需重点留意的着法：${qualityNotes(opts.moveHistorySan, opts.moveQualities, locale)}
${bestMoveHint(opts.bestLinesSan, side, locale)}
引擎推荐线路：
${linesText(opts.bestLinesSan)}
${themes}

请围绕**${side}该怎么走**做讲解：先交代行棋方，再讲强格、弱格与进攻思路；上一手若有问题要说明错在哪，进攻方向必须用引擎线路。
${exploreTopics(locale)}

${exploreHint(locale)}`;
}

export function assessmentUser(opts: {
  fen: string;
  moveHistorySan: string[];
  evalCp: number;
  sideToMove: 'w' | 'b';
  perspective: 'w' | 'b';
  bestLinesSan: string[][];
  locale: Locale;
  continueTurn?: boolean;
}): string {
  const { locale } = opts;
  const who = sideName(opts.perspective, locale);
  const turn = sideName(opts.sideToMove, locale);
  const evalFor = opts.perspective === 'w' ? opts.evalCp : -opts.evalCp;
  if (opts.continueTurn) {
    if (locale === 'en') {
      return `The position updated. Still assess from **${who}** (${turn} to move).
Current FEN: ${opts.fen}
Moves: ${historyText(opts.moveHistorySan, locale)}
Engine eval (${who}’s view): ${formatEval(evalFor)}
Engine candidate lines (quote only these):
${linesText(opts.bestLinesSan)}

Only what changed in plan, direction, and tactics since last time. Do not repeat the whole note. Same structure and markers.`;
    }
    return `局面已更新。请仍从**${who}**视角更新判断（现在轮到${turn}走）。
当前局面 FEN：${opts.fen}
着法记录：${historyText(opts.moveHistorySan, locale)}
引擎评估（${who}视角）：${formatEval(evalFor)}
引擎候选线路（着法只能引用这些）：
${linesText(opts.bestLinesSan)}

只讲相对刚才有变化的计划、方向和战术，不要整段重复。结构与标记规则不变。`;
  }
  if (locale === 'en') {
    return `Assess this position from **${who}** (${turn} to move).
Current FEN: ${opts.fen}
Moves: ${historyText(opts.moveHistorySan, locale)}
Engine eval (${who}’s view): ${formatEval(evalFor)}
Engine candidate lines (quote only these; do not invent):
${linesText(opts.bestLinesSan)}

Output:
- First line: ${who}’s standing (better / equal / worse) and one reason
- 2–4 “• ” bullets covering: (1) **plan and direction** (pawns, where pieces go, which file) (2) **possible tactics** (pin, fork, double attack, discovered; if none write “no direct tactic”)
- Last line “→ ” thinking direction
${lessonMarkerHint(locale)}
Every board-related bullet must include {{squares}} or {{squares|from-to}} so the plan landing-squares and tactic arrows show on the board.`;
  }
  return `请从**${who}**视角做当前局面判断（现在轮到${turn}走）。
当前局面 FEN：${opts.fen}
着法记录：${historyText(opts.moveHistorySan, locale)}
引擎评估（${who}视角）：${formatEval(evalFor)}
引擎候选线路（着法只能引用这些，勿自创）：
${linesText(opts.bestLinesSan)}

输出结构：
- 第一行总评：${who}的形势（优/均/劣）及一句原因
- 2~4 行「• 」要点，必须覆盖：① **计划与方向**（兵形、子力往哪走、哪条线）② **可能的战术**（牵制、捉双、击双、闪击等；若无则写「暂无直接战术」）
- 最后一行「→ 」思考方向
${lessonMarkerHint(locale)}
每条涉及棋盘的要点必须带 {{格子}} 或 {{格子|from-to}}，把计划落点和战术箭头标在棋盘上。`;
}

export function followUpContextUser(opts: {
  fen: string;
  moveHistorySan: string[];
  evalCp: number;
  sideToMove: 'w' | 'b';
  bestLinesSan: string[][];
  primary: string;
  dropped: number;
  locale: Locale;
}): string {
  const { locale } = opts;
  const side = sideName(opts.sideToMove, locale);
  const dropped = opts.dropped > 0
    ? (locale === 'en'
      ? `\n(earlier ${opts.dropped} follow-ups omitted; only the recent turns are kept)\n`
      : `\n（更早的 ${opts.dropped} 条追问记录已省略，仅保留最近几轮）\n`)
    : '';
  if (locale === 'en') {
    return `Position context (follow-up):
Current FEN: ${opts.fen}
Side to move: ${side}
Moves: ${historyText(opts.moveHistorySan, locale)}
Eval (White’s view): ${formatEval(opts.evalCp)}
Engine lines:
${linesText(opts.bestLinesSan)}

Primary commentary:
${opts.primary}
${dropped}
${followUpHint(locale)}`;
  }
  return `局面上下文（追问）：
当前局面 FEN：${opts.fen}
行棋方：${side}
着法记录：${historyText(opts.moveHistorySan, locale)}
当前评估（白方视角）：${formatEval(opts.evalCp)}
引擎推荐线路：
${linesText(opts.bestLinesSan)}

主讲解：
${opts.primary}
${dropped}
${followUpHint(locale)}`;
}
