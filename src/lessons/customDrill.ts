import type { Color } from './schema';
import type { OpeningDrill } from './openingDrills';
import { fenAfterSans } from './openingDrills';
import { START_FEN } from '../chess/pgn';
import type { ChatMessage } from '../llm/client';
import type { LlmPort } from '../store/session';

export const CUSTOM_DRILL_ID = 'custom';

export const CUSTOM_DRILL_STUB: OpeningDrill = {
  id: CUSTOM_DRILL_ID,
  title: '按要求练习',
  summary: '输入对手应走的开局或变例，例如「伦敦应对西西里」',
  theme: '对手将按你填写的开局/变例行棋；离开理论后交给引擎。',
  keyIdeas: ['按自己的体系出子', '抓住对手离开变例的松弛'],
  principleIds: ['development-order', 'center-control'],
  whiteTabiyaLine: ['d4', 'd5'],
  blackStartLine: ['d4'],
  opponentBook: [['d4', 'd5']],
  userPlies: 12,
};

export function extractJsonObject(raw: string): unknown {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fence?.[1] ?? raw).trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型没有返回可解析的开局书 JSON');
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export function sanitizeOpponentBook(lines: unknown): string[][] {
  if (!Array.isArray(lines)) return [];
  const out: string[][] = [];
  for (const line of lines) {
    if (!Array.isArray(line) || line.length === 0) continue;
    const sans = line.map((s) => String(s).trim()).filter(Boolean);
    if (sans.length === 0) continue;
    try {
      fenAfterSans(START_FEN, sans);
      out.push(sans);
    } catch {
      /* 丢掉非法线 */
    }
  }
  return out;
}

/** 从主变截出定式：白走后偶数步、黑走后奇数步 */
export function tabiyaFromBookLine(line: string[]): { whiteTabiyaLine: string[]; blackStartLine: string[] } {
  if (line.length < 1) throw new Error('开局书主变为空');
  const blackLen = line.length % 2 === 1 ? Math.min(line.length, 5) : Math.max(1, Math.min(line.length - 1, 5));
  let whiteLen = line.length % 2 === 0 ? Math.min(line.length, 6) : Math.min(line.length - 1, 6);
  if (whiteLen < 2 && line.length >= 2) whiteLen = 2;
  return {
    blackStartLine: line.slice(0, blackLen),
    whiteTabiyaLine: whiteLen >= 2 ? line.slice(0, whiteLen) : ['d4', 'd5'],
  };
}

interface CustomPayload {
  title?: unknown;
  summary?: unknown;
  keyIdeas?: unknown;
  opponentBook?: unknown;
}

export function customDrillFromPayload(requirement: string, payload: unknown, playerColor: Color): OpeningDrill {
  const p = payload as CustomPayload;
  const book = sanitizeOpponentBook(p.opponentBook);
  if (book.length === 0) throw new Error('开局书没有合法着法，请换一种说法再试');
  const tabiya = tabiyaFromBookLine(book[0]);
  const title = String(p.title ?? '').trim() || requirement.trim().slice(0, 24) || '自定义开局';
  const summary = String(p.summary ?? '').trim() || requirement.trim();
  const keyIdeas = Array.isArray(p.keyIdeas)
    ? p.keyIdeas.map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
    : [];
  const side = playerColor === 'w' ? '白' : '黑';
  return {
    id: CUSTOM_DRILL_ID,
    title,
    summary,
    theme: `按要求练习（你执${side}）：${requirement.trim()}。对手按该开局/变例行棋，离开书后交给引擎。`,
    keyIdeas: keyIdeas.length > 0 ? keyIdeas : ['按要求的体系出子', '注意对手离开变例时的机会'],
    principleIds: ['development-order', 'center-control'],
    whiteTabiyaLine: tabiya.whiteTabiyaLine,
    blackStartLine: tabiya.blackStartLine,
    opponentBook: book,
    userPlies: 12,
  };
}

export function buildCustomDrillMessages(requirement: string, playerColor: Color): ChatMessage[] {
  const side = playerColor === 'w' ? '白方（用户）' : '黑方（用户）';
  const opp = playerColor === 'w' ? '黑方（对手）' : '白方（对手）';
  return [
    {
      role: 'system',
      content: `你是开局教练。根据学员的文字要求，生成对手开局书。只输出一个 JSON 对象，不要 Markdown 标题。
JSON 字段：
- title: 短标题
- summary: 一句话
- keyIdeas: 3~5 条中文要点
- opponentBook: SAN 着法数组的数组，每条从起始局面开始，长度 8~16 步
规则：
1. 着法必须合法、用标准 SAN（e4、Nf3、O-O、exd5）。
2. 对手是${opp}，学员是${side}。对手应按要求的开局或变例走；学员一侧给出该体系下的常见应手，以便换位后仍在书中。
3. 第一条是主变；再给 2~5 条常见分枝（不同学员应手）。
4. 不要输出 JSON 以外的文字。`,
    },
    {
      role: 'user',
      content: `学员要求：${requirement.trim()}
请生成 opponentBook。`,
    },
  ];
}

export async function generateCustomDrill(
  requirement: string,
  playerColor: Color,
  llm: LlmPort,
  signal?: AbortSignal,
): Promise<OpeningDrill> {
  const text = requirement.trim();
  if (!text) throw new Error('请先填写对手应走的开局或变例');
  let acc = '';
  for await (const d of llm.stream(buildCustomDrillMessages(text, playerColor), {
    temperature: 0.3,
    signal: signal ?? new AbortController().signal,
    maxTokens: 1800,
    quick: true,
  })) {
    acc += d;
  }
  if (!acc.trim()) throw new Error('模型没有返回开局书');
  return customDrillFromPayload(text, extractJsonObject(acc), playerColor);
}
