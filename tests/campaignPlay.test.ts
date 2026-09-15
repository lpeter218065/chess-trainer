import { afterEach, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { START_FEN } from '../src/chess/pgn';
import { CAMPAIGN_ISLANDS, QUEEN_PAWN_ISLAND, SICILIAN_ISLAND, isUnlocked, levelById, scoreStars } from '../src/campaign';
import { answerFollowUp, applyOpponent, bookReplyFor, completeAfterAsk, fenAfter, revealTell, startSail, tryPlayerMove } from '../src/campaign/play';
import type { SailLevel } from '../src/campaign/types';
import { useSettings } from '../src/store/settings';

function sail(id: string): SailLevel {
  const level = levelById(id);
  if (!level || (level.kind !== 'sail' && level.kind !== 'boss')) throw new Error(id);
  return level;
}

function playSan(play: ReturnType<typeof startSail>, level: SailLevel, san: string) {
  const chess = new Chess(play.fen);
  const legal = chess.moves({ verbose: true }).find((m) => m.san === san);
  if (!legal) throw new Error(`no ${san} in ${play.fen}`);
  return tryPlayerMove(play, level, legal.from, legal.to);
}

describe('sicilian island data', () => {
  it('has 10 levels and unlocks in order', () => {
    expect(SICILIAN_ISLAND.levels).toHaveLength(10);
    expect(isUnlocked(SICILIAN_ISLAND.levels, {}, 'sicilian-1')).toBe(true);
    expect(isUnlocked(SICILIAN_ISLAND.levels, {}, 'sicilian-2')).toBe(false);
    expect(isUnlocked(SICILIAN_ISLAND.levels, { 'sicilian-1': 1 }, 'sicilian-2')).toBe(true);
  });

  it('najdorf tabiya matches the existing white lesson fen', () => {
    const fen = fenAfter(START_FEN, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);
    expect(fen).toBe('rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6');
  });
});

describe('scoreStars', () => {
  it('rewards clean thinking over hinted finishes', () => {
    expect(scoreStars({ retries: 0, hints: 0, followUpMiss: 0 })).toBe(3);
    expect(scoreStars({ retries: 1, hints: 0, followUpMiss: 0 })).toBe(2);
    expect(scoreStars({ retries: 0, hints: 1, followUpMiss: 0 })).toBe(1);
  });
});

describe('sail play', () => {
  it('accepts c5 and then books Nf3', () => {
    const level = sail('sicilian-2');
    let play = startSail(level);
    expect(new Chess(play.fen).turn()).toBe('b');
    play = playSan(play, level, 'c5');
    expect(startSail(level).historySan).toEqual(['e4']);
    expect(play.historySan).toEqual(['e4', 'c5']);
    expect(play.fen).not.toBe(startSail(level).fen);
    expect(play.coach?.tone).toBe('ok');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
    expect(new Chess(play.fen).history().at(-1) ?? play.lastMove?.to).toBeTruthy();
    expect(play.lastMove).toEqual({ from: 'g1', to: 'f3' });
    expect(play.waiting).toBe('oppAsk');
    expect(play.coach?.followUp?.kind).toBe('choice');
    const answered = answerFollowUp(play, play.coach!.followUp!, 'switch');
    expect(answered.ok).toBe(true);
    expect(answered.play.waiting).toBe('done');
  });

  it('rejects a non-sicilian first move and keeps the fen', () => {
    const level = sail('sicilian-2');
    const start = startSail(level);
    const play = playSan(start, level, 'e5');
    expect(play.fen).toBe(start.fen);
    expect(play.retries).toBe(1);
    expect(play.coach?.tone).toBe('retry');
    expect(play.coach?.showTellMe).toBe(true);
  });

  it('switches plan when white plays Bc4 instead of d4', () => {
    const level = sail('sicilian-4');
    let play = startSail(level);
    play = playSan(play, level, 'd6');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, true);
    expect(play.offBook).toBe(true);
    expect(play.lastMove).toEqual({ from: 'f1', to: 'c4' });
    expect(play.coach?.followUp?.kind).toBe('choice');
    expect(play.punish?.punishSans).toContain('Nf6');
  });

  it('punishes a hanging e4 after Be2', () => {
    const level = sail('sicilian-6');
    let play = startSail(level);
    play = playSan(play, level, 'cxd4');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
    play = playSan(play, level, 'Nf6');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, 'Be2');
    expect(play.punish?.san).toBe('Be2');
    play = { ...play, waiting: 'move' };
    play = playSan(play, level, 'Nxe4');
    expect(play.waiting).toBe('followUp');
    expect(play.coach?.say).toMatch(/抓住/);
    const afterEat = answerFollowUp(play, play.coach!.followUp!, 'calm');
    expect(afterEat.ok).toBe(true);
    expect(afterEat.play.waiting).toBe('done');
  });

  it('punishes an early queen with Nf6', () => {
    const level = sail('sicilian-2');
    let play = startSail(level);
    play = playSan(play, level, 'c5');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, 'Qh5');
    expect(play.lastMove).toEqual({ from: 'd1', to: 'h5' });
    play = { ...play, waiting: 'move' };
    play = playSan(play, level, 'Nf6');
    expect(play.waiting).toBe('followUp');
    expect(play.coach?.say).toMatch(/吃 e4/);
    const answered = answerFollowUp(play, play.coach!.followUp!, 'take-e4');
    expect(answered.ok).toBe(true);
    expect(answered.play.waiting).toBe('done');
  });

  it('lets Nc6 guard c5 against Qh5', () => {
    const level = sail('sicilian-2');
    let play = startSail(level);
    play = playSan(play, level, 'c5');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, 'Qh5');
    play = { ...play, waiting: 'move' };
    play = playSan(play, level, 'Nc6');
    expect(play.coach?.say).toMatch(/看着 c5/);
  });

  it('asks why white recaptures d4 with the knight', () => {
    const level = sail('sicilian-4');
    let play = startSail(level);
    play = playSan(play, level, 'd6');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
    expect(play.coach?.followUp).toBeTruthy();
    play = answerFollowUp(play, play.coach!.followUp!, 'center').play;
    expect(play.waiting).toBe('move');
    play = playSan(play, level, 'cxd4');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
    expect(play.lastMove).toEqual({ from: 'f3', to: 'd4' });
    const asked = answerFollowUp(play, play.coach!.followUp!, 'early');
    expect(asked.ok).toBe(true);
    expect(asked.play.waiting).toBe('done');
  });
});

describe('queen pawn island', () => {
  it('has 10 levels and unlocks in order', () => {
    expect(QUEEN_PAWN_ISLAND.levels).toHaveLength(10);
    expect(isUnlocked(QUEEN_PAWN_ISLAND.levels, {}, 'qp-1')).toBe(true);
    expect(isUnlocked(QUEEN_PAWN_ISLAND.levels, {}, 'qp-2')).toBe(false);
    expect(isUnlocked(QUEEN_PAWN_ISLAND.levels, { 'qp-1': 1 }, 'qp-2')).toBe(true);
  });

  it('accepts d4 and then books d5', () => {
    const level = sail('qp-2');
    let play = startSail(level);
    expect(new Chess(play.fen).turn()).toBe('w');
    play = playSan(play, level, 'd4');
    expect(play.coach?.tone).toBe('ok');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
    expect(play.lastMove).toEqual({ from: 'd7', to: 'd5' });
    expect(play.coach?.followUp?.kind).toBe('choice');
    const answered = answerFollowUp(play, play.coach!.followUp!, 'split');
    expect(answered.ok).toBe(true);
    expect(answered.play.waiting).toBe('done');
  });

  it('rejects e4 on the first queen-pawn sail', () => {
    const level = sail('qp-2');
    const start = startSail(level);
    const play = playSan(start, level, 'e4');
    expect(play.fen).toBe(start.fen);
    expect(play.retries).toBe(1);
    expect(play.coach?.tone).toBe('retry');
  });

  it('punishes QGA with e3', () => {
    const level = sail('qp-4');
    let play = startSail(level);
    play = playSan(play, level, 'c4');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, 'dxc4');
    expect(play.lastMove).toEqual({ from: 'd5', to: 'c4' });
    play = { ...play, waiting: 'move' };
    play = playSan(play, level, 'e3');
    expect(play.waiting).toBe('followUp');
    expect(play.coach?.say).toMatch(/垫 e3/);
  });
});

describe('campaign book moves are legal', () => {
  it('can play every correct SAN, book reply, and deviation', () => {
    for (const island of CAMPAIGN_ISLANDS) {
      for (const level of island.levels) {
        if (level.kind === 'recognize') {
          expect(() => new Chess(level.fen)).not.toThrow();
          continue;
        }
        for (let i = 0; i < level.steps.length; i++) {
          const step = level.steps[i];
          let play = startSail(level);
          for (let p = 0; p < i; p++) {
            play = playSan(play, level, level.steps[p].correctSans[0]);
            play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
            play = { ...play, waiting: 'move', coach: null };
          }
          const chess = new Chess(play.fen);
          expect(chess.turn(), `${level.id} step ${i} turn`).toBe(level.playerColor);
          for (const san of step.correctSans) {
            expect(chess.moves(), `${level.id} missing ${san}`).toContain(san);
            const after = playSan(play, level, san);
            const book = bookReplyFor(step, san);
            const replyChess = new Chess(after.fen);
            if (book.san) {
              expect(replyChess.moves(), `${level.id} book ${book.san} after ${san}`).toContain(book.san);
              replyChess.move(book.san);
              const pawnTakesPiece = replyChess
                .moves({ verbose: true })
                .filter((move) => move.piece === 'p' && move.captured && move.captured !== 'p');
              expect(
                pawnTakesPiece,
                `${level.id} after ${san} ${book.san} pawn takes ${pawnTakesPiece[0]?.san ?? ''}`,
              ).toEqual([]);
            }
          }
          const afterMain = playSan(play, level, step.correctSans[0]);
          const replyChess = new Chess(afterMain.fen);
          const deviate = step.replyDeviate
            ? Array.isArray(step.replyDeviate) ? step.replyDeviate : [step.replyDeviate]
            : [];
          for (const soft of deviate) {
            expect(replyChess.moves(), `${level.id} deviate ${soft.san}`).toContain(soft.san);
            const off = applyOpponent({ ...afterMain, pendingReply: true, waiting: 'oppAsk' }, level, soft.san);
            const punishChess = new Chess(off.fen);
            for (const san of soft.punishSans) {
              expect(punishChess.moves(), `${level.id} punish ${san} after ${soft.san}`).toContain(san);
            }
          }
        }
      }
    }
  });
});

describe('sail play locale wrappers', () => {
  afterEach(() => {
    useSettings.getState().setLocalePref('system');
  });

  it('keeps Chinese tell wrappers by default', () => {
    const level = sail('sicilian-2');
    const start = startSail(level);
    const play = playSan(start, level, 'e5');
    const told = revealTell(play, level);
    expect(told.coach?.say.startsWith('走 ')).toBe(true);
  });

  it('uses English tell and remember wrappers when locale is en', () => {
    useSettings.getState().setLocalePref('en');
    const level = sail('sicilian-2');
    const start = startSail(level);
    const play = playSan(start, level, 'e5');
    const told = revealTell(play, level);
    expect(told.coach?.say.startsWith('Play ')).toBe(true);
    expect(told.coach?.say).not.toMatch(/^走 /);

    const done = completeAfterAsk({ ...start, waiting: 'done', plyIndex: level.steps.length }, level);
    expect(done.coach?.say).toContain('Keep this idea:');
    expect(done.coach?.say).not.toContain('记住这张思路卡');
  });
});

