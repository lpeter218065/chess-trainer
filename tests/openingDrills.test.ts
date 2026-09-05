import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  OPENING_DRILLS,
  drillToLesson,
  fenAfterSans,
  openingDrillById,
} from '../src/lessons/openingDrills';
import { pickBookReply } from '../src/chess/openingBook';
import { START_FEN } from '../src/chess/pgn';
import { OPENING_OPPONENTS } from '../src/engine/difficulty';

describe('opening drills', () => {
  it('有 6 个开局且 id 唯一', () => {
    expect(OPENING_DRILLS.length).toBe(6);
    expect(new Set(OPENING_DRILLS.map((d) => d.id)).size).toBe(6);
  });

  it('对手仅一般 / 高级两档', () => {
    expect(OPENING_OPPONENTS.map((o) => o.label)).toEqual(['一般对手', '高级对手']);
  });

  for (const drill of OPENING_DRILLS) {
    describe(drill.id, () => {
      it('执白·起始局面', () => {
        const lesson = drillToLesson(drill, 'w', 'from-start');
        expect(lesson.startFen).toBe(START_FEN);
        expect(lesson.playerColor).toBe('w');
        expect(lesson.id).toContain('/w/start');
      });

      it('执黑·起始局面（START，由 session 让白方先走）', () => {
        const lesson = drillToLesson(drill, 'b', 'from-start');
        expect(lesson.startFen).toBe(START_FEN);
        expect(lesson.playerColor).toBe('b');
        expect(new Chess(lesson.startFen).turn()).toBe('w');
        expect(lesson.id).toContain('/b/start');
      });

      it('执白·定式：whiteTabiyaLine 合法且轮到白方', () => {
        const fen = fenAfterSans(START_FEN, drill.whiteTabiyaLine);
        expect(new Chess(fen).turn()).toBe('w');
        const lesson = drillToLesson(drill, 'w', 'tabiya');
        expect(lesson.startFen).toBe(fen);
        expect(lesson.playerColor).toBe('w');
        expect(lesson.id).toContain('/w/tabiya');
      });

      it('执黑·定式：blackStartLine 合法且轮到黑方', () => {
        const fen = fenAfterSans(START_FEN, drill.blackStartLine);
        expect(new Chess(fen).turn()).toBe('b');
        const lesson = drillToLesson(drill, 'b', 'tabiya');
        expect(lesson.startFen).toBe(fen);
        expect(lesson.playerColor).toBe('b');
        expect(lesson.id).toContain('/b/tabiya');
      });

      it('开局书每条线合法，且挂到 Lesson', () => {
        expect(drill.opponentBook.length).toBeGreaterThan(0);
        for (const line of drill.opponentBook) {
          expect(() => fenAfterSans(START_FEN, line)).not.toThrow();
        }
        const lesson = drillToLesson(drill, 'b', 'from-start');
        expect(lesson.opponentBook).toEqual(drill.opponentBook);
      });

      it('执黑从起始局面：对手第一步走该开局', () => {
        expect(pickBookReply(START_FEN, drill.opponentBook)).toBe(drill.blackStartLine[0]);
      });

      it('定式前缀后仍有开局书续着', () => {
        const afterWhiteTabiya = fenAfterSans(START_FEN, drill.whiteTabiyaLine);
        expect(pickBookReply(afterWhiteTabiya, drill.opponentBook)).toBeTruthy();
        const afterBlackLine = fenAfterSans(START_FEN, drill.blackStartLine);
        expect(pickBookReply(afterBlackLine, drill.opponentBook)).toBeTruthy();
      });
    });
  }

  it('openingDrillById 可查', () => {
    expect(openingDrillById('london')?.title).toContain('伦敦');
    expect(openingDrillById('nope')).toBeUndefined();
  });

  it('离开开局书后没有续着', () => {
    const london = openingDrillById('london')!;
    const fen = fenAfterSans(START_FEN, ['a3']);
    expect(pickBookReply(fen, london.opponentBook)).toBeNull();
  });

  it('同一前缀下各开局对手续着不同', () => {
    const london = openingDrillById('london')!;
    const qg = openingDrillById('queens-gambit')!;
    const ruy = openingDrillById('ruy-lopez')!;
    const italian = openingDrillById('italian')!;
    const twoKnights = openingDrillById('two-knights')!;
    const french = openingDrillById('french')!;

    const afterD4D5 = fenAfterSans(START_FEN, ['d4', 'd5']);
    expect(pickBookReply(afterD4D5, london.opponentBook)).toBe('Nf3');
    expect(pickBookReply(afterD4D5, qg.opponentBook)).toBe('c4');

    const afterE4 = fenAfterSans(START_FEN, ['e4']);
    expect(pickBookReply(afterE4, french.opponentBook)).toBe('e6');
    expect(pickBookReply(afterE4, ruy.opponentBook)).toBe('e5');
    expect(pickBookReply(afterE4, italian.opponentBook)).toBe('e5');

    const openGame = fenAfterSans(START_FEN, ['e4', 'e5', 'Nf3', 'Nc6']);
    expect(pickBookReply(openGame, ruy.opponentBook)).toBe('Bb5');
    expect(pickBookReply(openGame, italian.opponentBook)).toBe('Bc4');
    expect(pickBookReply(openGame, twoKnights.opponentBook)).toBe('Bc4');

    const afterBc4 = fenAfterSans(START_FEN, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
    expect(pickBookReply(afterBc4, italian.opponentBook)).toBe('Bc5');
    expect(pickBookReply(afterBc4, twoKnights.opponentBook)).toBe('Nf6');
  });
});
