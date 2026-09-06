import { Chess } from 'chess.js';
import type { Color, Lesson } from './schema';
import type { DrillStartMode, OpeningDrill } from './openingDrills';
import { START_FEN } from '../chess/pgn';

/** 从起始局面走出 SAN 序列，校验每步合法 */
export function fenAfterSans(startFen: string, sans: string[]): string {
  const c = new Chess(startFen);
  for (const san of sans) {
    const m = c.move(san);
    if (!m) throw new Error(`非法着法 ${san}（在 ${c.fen()}）`);
  }
  return c.fen();
}

/**
 * 将开局练习转为 Lesson。
 * - from-start：始终 START_FEN；执黑时由 session 让引擎先走白方直到轮到黑方。
 * - tabiya：走出对应定式线，停在己方行棋。
 */
export function drillToLesson(drill: OpeningDrill, color: Color, startMode: DrillStartMode = 'from-start'): Lesson {
  let startFen = START_FEN;
  if (startMode === 'tabiya') {
    const line = color === 'w' ? drill.whiteTabiyaLine : drill.blackStartLine;
    startFen = fenAfterSans(START_FEN, line);
    const turn = new Chess(startFen).turn();
    if (turn !== color) {
      throw new Error(`${drill.id} 定式执${color === 'w' ? '白' : '黑'}时起始行棋方不匹配：${turn}`);
    }
  }
  const modeTag = startMode === 'from-start' ? 'start' : 'tabiya';
  return {
    id: `drill/${drill.id}/${color}/${modeTag}`,
    section: 'opening',
    title: `${drill.title} · 开局练习`,
    summary: drill.summary,
    startFen,
    playerColor: color,
    theme: drill.theme,
    keyIdeas: drill.keyIdeas,
    principleIds: drill.principleIds,
    stop: { kind: 'plies', count: drill.userPlies },
    target: 'hold',
    tags: ['opening-drill', drill.id, color, startMode],
    opponentBook: drill.opponentBook,
  };
}

/** 解析 drillToLesson 生成的 lesson id；非该格式返回 null */
export function parseDrillLessonId(id: string): { drillId: string; color: Color; startMode: DrillStartMode } | null {
  const m = /^drill\/(.+)\/(w|b)\/(start|tabiya)$/.exec(id);
  if (!m) return null;
  return { drillId: m[1], color: m[2] as Color, startMode: m[3] === 'start' ? 'from-start' : 'tabiya' };
}
