import type { ChatMessage } from '../llm/client';
import type { FollowUpTurn } from '../llm/prompts';
import type { Coach } from './types';
import type { Locale } from '../i18n';

export const CAMPAIGN_ASK_CHIPS = [
  '再讲细一点',
  '他想干什么？',
  '哪个格子最重要？',
  '为什么不能走别的？',
] as const;

export const CAMPAIGN_ASK_MAX_TOKENS = 350;

const ASK_SYSTEM_ZH = `你是一位给小朋友讲棋的教练，用简体中文。规则：
1. 句子短，像说话。不要用“对局、评估、引擎、PV”这些词。
2. 着法用标准代数记谱（如 Nf3、c5），同时用中文说清（马走到 f3、兵走到 c5）。
3. 只讲当前局面和已经走出的棋。不要剧透后面关卡还没教的走法。
4. 不要编造没在材料里出现的长变化；举例最多 2 步。
5. 必须顺着「思路卡」和教练刚才的话讲，不要唱反调。
6. 输出结构：
   - 第一行一句总评（不加前缀）
   - 2~3 行要点，每行以「• {{格子}} 」开头。格子逗号分隔（如 {{d4,c5}}）；进攻方向写 {{c5,d4|c7-c5}}
   - 可选最后一行以「→ {{格子}} 」开头，给一个思考方向
7. 每条涉及棋盘的要点必须带 {{格子}} 标记，供小朋友点亮棋盘。`;

const ASK_SYSTEM_EN = `You are a chess coach talking to a child, in simple English. Rules:
1. Short spoken sentences. Do not say “game, evaluation, engine, PV”.
2. Moves in standard algebraic (Nf3, c5), and say them in words (knight to f3, pawn to c5).
3. Only the current position and moves already played. Do not spoil later levels.
4. Do not invent long lines that are not in the material; at most 2 example plies.
5. Follow the idea card and what the coach just said. Do not contradict them.
6. Output:
   - First line: one overall sentence (no prefix)
   - 2–3 bullets, each starting with “• {{squares}} ”. Squares comma-separated ({{d4,c5}}); attacks {{c5,d4|c7-c5}}
   - Optional last line starting with “→ {{squares}} ” as a thinking direction
7. Every board point must include {{squares}} so the child can light the board.`;

function askSystem(locale: Locale): string {
  return locale === 'en' ? ASK_SYSTEM_EN : ASK_SYSTEM_ZH;
}

const ASK_MAX_TURNS = 6;
const ASK_COACH_MAX_CHARS = 500;

export interface CampaignAskContext {
  islandTitle: string;
  levelTitle: string;
  ideaCard: string;
  levelQuestion?: string;
  coachSay: string;
  fen: string;
  historySan: string[];
  lastSan: string | null;
  turns: FollowUpTurn[];
  question: string;
  locale?: Locale;
}

export function canAskCoach(coach: Coach | null): boolean {
  if (!coach) return false;
  if (coach.tone === 'retry') return false;
  if (coach.followUp) return false;
  return true;
}

function historyText(sans: string[], look: string): string {
  if (sans.length === 0) return look;
  return sans.map((san, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${san}` : san)).join(' ');
}

export function buildCampaignAskMessages(ctx: CampaignAskContext): ChatMessage[] {
  const locale = ctx.locale ?? 'zh';
  const coachSay =
    ctx.coachSay.length > ASK_COACH_MAX_CHARS ? `${ctx.coachSay.slice(0, ASK_COACH_MAX_CHARS)}…` : ctx.coachSay;
  const dropped = Math.max(0, ctx.turns.length - ASK_MAX_TURNS);
  const recent = ctx.turns.slice(dropped);
  const look = locale === 'en' ? '(see the board)' : '（看棋盘）';
  const userBlock = locale === 'en'
    ? `Campaign: ${ctx.islandTitle} · ${ctx.levelTitle}
Idea card: ${ctx.ideaCard}
${ctx.levelQuestion ? `Level question: ${ctx.levelQuestion}\n` : ''}Moves so far: ${historyText(ctx.historySan, look)}
Last move: ${ctx.lastSan ?? look}
FEN: ${ctx.fen}

The coach just said:
${coachSay}
${dropped > 0 ? `\n(earlier ${dropped} Q&A omitted)\n` : ''}
Answer in words a child can follow. Points must include {{squares}}.`
    : `闯关：${ctx.islandTitle} · ${ctx.levelTitle}
思路卡：${ctx.ideaCard}
${ctx.levelQuestion ? `这一关的问题：${ctx.levelQuestion}\n` : ''}已经走出的棋：${historyText(ctx.historySan, look)}
刚才一步：${ctx.lastSan ?? look}
当前局面 FEN：${ctx.fen}

教练刚才说：
${coachSay}
${dropped > 0 ? `\n（更早的 ${dropped} 条问答已省略）\n` : ''}
用小朋友听得懂的话回答。要点必须带 {{格子}}。`;
  const messages: ChatMessage[] = [
    { role: 'system', content: askSystem(locale) },
    {
      role: 'user',
      content: userBlock,
    },
  ];
  for (const turn of recent) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: 'user', content: ctx.question });
  return messages;
}
