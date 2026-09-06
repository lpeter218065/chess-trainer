import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  customDrillFromPayload,
  extractJsonObject,
  generateCustomDrill,
  sanitizeOpponentBook,
  tabiyaFromBookLine,
} from '../src/lessons/customDrill';
import type { LlmPort } from '../src/store/session';
import { pickBookReply } from '../src/chess/openingBook';
import { START_FEN } from '../src/chess/pgn';

describe('customDrill', () => {
  it('extractJsonObject 能从围栏里取出 JSON', () => {
    const raw = '废话\n```json\n{"title":"伦敦 vs 西西里","opponentBook":[["d4","c5"]]}\n```';
    expect(extractJsonObject(raw)).toEqual({ title: '伦敦 vs 西西里', opponentBook: [['d4', 'c5']] });
  });

  it('sanitizeOpponentBook 丢掉非法着法线', () => {
    const book = sanitizeOpponentBook([
      ['d4', 'c5', 'e3'],
      ['e4', 'e5', 'Qh5'],
      ['not-a-move'],
      [],
    ]);
    expect(book).toEqual([
      ['d4', 'c5', 'e3'],
      ['e4', 'e5', 'Qh5'],
    ]);
  });

  it('tabiyaFromBookLine 白偶数步、黑奇数步', () => {
    const t = tabiyaFromBookLine(['d4', 'c5', 'e3', 'd5', 'c3', 'Nc6', 'Nf3']);
    expect(t.blackStartLine.length % 2).toBe(1);
    expect(t.whiteTabiyaLine.length % 2).toBe(0);
  });

  it('customDrillFromPayload 生成可走伦敦 vs 西西里的书', () => {
    const drill = customDrillFromPayload('伦敦应对西西里', {
      title: '伦敦 vs 西西里',
      summary: 'd4 对 c5',
      keyIdeas: ['金字塔', 'c3'],
      opponentBook: [
        ['d4', 'c5', 'e3', 'cxd4', 'exd4', 'd5', 'c3', 'Nc6', 'Nf3', 'Nf6', 'Bf4'],
        ['d4', 'c5', 'c3', 'cxd4', 'cxd4', 'd5', 'Nf3', 'Nc6', 'Bf4'],
      ],
    }, 'w');
    expect(drill.title).toContain('伦敦');
    expect(pickBookReply(START_FEN, drill.opponentBook)).toBe('d4');
    const afterD4 = new Chess(START_FEN);
    afterD4.move('d4');
    expect(pickBookReply(afterD4.fen(), drill.opponentBook)).toBe('c5');
  });

  it('generateCustomDrill 用模型 JSON 做成练习', async () => {
    const llm: LlmPort = {
      async *stream() {
        yield '{"title":"西西里","summary":"c5","keyIdeas":["中心反击"],"opponentBook":[["e4","c5","Nf3","d6"]]}';
      },
    };
    const drill = await generateCustomDrill('对手走西西里', 'w', llm);
    expect(drill.opponentBook[0]).toEqual(['e4', 'c5', 'Nf3', 'd6']);
    expect(pickBookReply(START_FEN, drill.opponentBook)).toBe('e4');
  });

  it('空要求或空书会失败', async () => {
    const llm: LlmPort = { async *stream() { yield '{"title":"x","opponentBook":[]}'; } };
    await expect(generateCustomDrill('  ', 'w', llm)).rejects.toThrow(/填写/);
    await expect(generateCustomDrill('西西里', 'w', llm)).rejects.toThrow(/合法着法/);
  });

  it('sanitizeOpponentBook 把 0-0 / 0-0-0 归一为 O-O / O-O-O', () => {
    const book = sanitizeOpponentBook([['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', '0-0', 'Nf6', 'd3', '0-0']]);
    expect(book[0][6]).toBe('O-O');
    expect(book[0][9]).toBe('O-O');
  });

  it('tabiyaFromBookLine 主变不足 2 步时抛错，而不是回退到 d4 d5', () => {
    expect(() => tabiyaFromBookLine(['e4'])).toThrow();
  });
});
