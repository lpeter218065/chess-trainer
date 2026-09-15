import { Chess } from 'chess.js';
import { START_FEN } from '../chess/pgn';
import { tl } from '../i18n';
import type { Coach, FollowUp, OppSoft, SailLevel, SailStep } from './types';

export interface LastMove {
  from: string;
  to: string;
}

export type DeviateFlag = boolean | string;

export interface SailPlay {
  fen: string;
  plyIndex: number;
  lastMove: LastMove | null;
  lastSan: string | null;
  historySan: string[];
  retries: number;
  hints: number;
  followUpMiss: number;
  offBook: boolean;
  waiting: 'move' | 'followUp' | 'oppAsk' | 'done';
  coach: Coach | null;
  pendingReply: boolean;
  punish: OppSoft | null;
  ideaCard?: string;
  resumeAfterAsk?: 'move' | 'done';
}

export function bookReplyFor(
  step: SailStep,
  playerSan: string | null | undefined,
): { san: string; say: string; highlights?: string[] } {
  const san = (playerSan && step.replyBookBySan?.[playerSan]) || step.replyBook;
  const say = (playerSan && step.replyBookSayBySan?.[playerSan]) || step.replyBookSay;
  const highlights =
    (playerSan && step.replyBookHighlightsBySan?.[playerSan]) || step.replyBookHighlights;
  return { san, say, highlights };
}

export function fenAfter(startFen: string, sans: string[]): string {
  const chess = new Chess(startFen);
  for (const san of sans) {
    const moved = chess.move(san);
    if (!moved) throw new Error(`非法着法 ${san}（在 ${chess.fen()}）`);
  }
  return chess.fen();
}

export function softMoves(step: SailStep): OppSoft[] {
  if (!step.replyDeviate) return [];
  return Array.isArray(step.replyDeviate) ? step.replyDeviate : [step.replyDeviate];
}

export function pickDeviation(step: SailStep, flag: DeviateFlag, random = Math.random): OppSoft | null {
  const list = softMoves(step);
  if (list.length === 0) return null;
  if (flag === true) return list[0];
  if (typeof flag === 'string' && flag !== '0') {
    return list.find((s) => s.san === flag) ?? list[0];
  }
  if (flag === false) return null;
  if (random() < 0.4) return list[Math.floor(random() * list.length)];
  return null;
}

export function startSail(level: SailLevel): SailPlay {
  const fen = fenAfter(START_FEN, level.leadSans);
  const chess = new Chess(fen);
  let lastMove: LastMove | null = null;
  if (level.leadSans.length > 0) {
    const hist = chess.history({ verbose: true });
    const last = hist[hist.length - 1];
    if (last) lastMove = { from: last.from, to: last.to };
  }
  return {
    fen,
    plyIndex: 0,
    lastMove,
    lastSan: level.leadSans.at(-1) ?? null,
    historySan: [...level.leadSans],
    retries: 0,
    hints: 0,
    followUpMiss: 0,
    offBook: false,
    waiting: 'move',
    coach: null,
    pendingReply: false,
    punish: null,
  };
}

export function tryPlayerMove(play: SailPlay, level: SailLevel, from: string, to: string): SailPlay {
  if (play.waiting !== 'move') return play;
  const chess = new Chess(play.fen);
  const moved = chess.move({ from, to, promotion: 'q' });
  if (!moved) return play;

  if (play.punish) {
    if (!play.punish.punishSans.includes(moved.san)) {
      return {
        ...play,
        retries: play.retries + 1,
        coach: { ...play.punish.punishWrong, showTellMe: true },
      };
    }
    const ok = play.punish.punishOkBySan?.[moved.san] ?? play.punish.punishOk;
    return {
      ...play,
      fen: chess.fen(),
      lastMove: { from: moved.from, to: moved.to },
      lastSan: moved.san,
      historySan: [...play.historySan, moved.san],
      waiting: ok.followUp ? 'followUp' : 'done',
      pendingReply: false,
      coach: {
        ...ok,
        remember: ok.remember ?? level.ideaCard,
      },
      ideaCard: level.ideaCard,
    };
  }

  const step = level.steps[play.plyIndex];
  if (!step) return play;
  if (!step.correctSans.includes(moved.san)) {
    return {
      ...play,
      retries: play.retries + 1,
      coach: { ...step.wrong, showTellMe: true },
    };
  }
  return {
    ...play,
    fen: chess.fen(),
    lastMove: { from: moved.from, to: moved.to },
    lastSan: moved.san,
    historySan: [...play.historySan, moved.san],
    waiting: step.correct.followUp ? 'followUp' : 'oppAsk',
    coach: step.correct,
    pendingReply: true,
  };
}

export function revealTell(play: SailPlay, level: SailLevel): SailPlay {
  if (play.punish) {
    return {
      ...play,
      hints: play.hints + 1,
      coach: {
        tone: 'retry',
        say: tl('campaign.tellMove', { san: play.punish.punishTell, say: play.punish.punishWrong.say }),
        highlights: play.punish.punishWrong.highlights,
        showTellMe: false,
      },
    };
  }
  const step = level.steps[play.plyIndex];
  if (!step) return play;
  return {
    ...play,
    hints: play.hints + 1,
    coach: {
      tone: 'retry',
      say: tl('campaign.tellMove', { san: step.tell, say: step.wrong.say }),
      highlights: step.wrong.highlights,
      showTellMe: false,
    },
  };
}

export function answerFollowUp(play: SailPlay, followUp: FollowUp, pick: string): { play: SailPlay; ok: boolean } {
  const ok = gradeFollowUp(followUp, pick);
  const explain = ok ? followUp.explainOk : followUp.explainBad;
  const afterPunishMove = Boolean(play.punish) && play.waiting === 'followUp';
  const beforePunishMove = Boolean(play.punish) && play.waiting !== 'followUp';
  return {
    ok,
    play: {
      ...play,
      followUpMiss: play.followUpMiss + (ok ? 0 : 1),
      waiting: afterPunishMove
        ? 'done'
        : beforePunishMove
          ? 'move'
          : play.pendingReply
            ? 'oppAsk'
            : play.offBook
              ? 'done'
              : (play.resumeAfterAsk ?? play.waiting),
      coach: {
        tone: afterPunishMove && ok ? 'done' : ok ? 'ok' : 'retry',
        say: beforePunishMove ? tl('campaign.catchNow', { explain }) : explain,
        remember: afterPunishMove ? play.coach?.remember : undefined,
        highlights: play.punish?.highlights ?? play.coach?.highlights ?? [],
      },
    },
  };
}

export function applyOpponent(play: SailPlay, level: SailLevel, deviate: DeviateFlag = false): SailPlay {
  const step = level.steps[play.plyIndex];
  if (!step || !play.pendingReply) {
    return finishIfComplete(play, level);
  }
  const soft = pickDeviation(step, deviate);
  const chess = new Chess(play.fen);
  if (soft) {
    const moved = chess.move(soft.san);
    if (!moved) throw new Error(soft.san);
    return {
      ...play,
      fen: chess.fen(),
      lastMove: { from: moved.from, to: moved.to },
      lastSan: moved.san,
      historySan: [...play.historySan, moved.san],
      offBook: true,
      pendingReply: false,
      punish: soft,
      waiting: 'oppAsk',
      coach: {
        tone: 'ask',
        say: soft.say,
        highlights: soft.highlights,
        followUp: soft.ask,
      },
    };
  }
  const book = bookReplyFor(step, play.lastSan);
  if (book.san) {
    const moved = chess.move(book.san);
    if (!moved) throw new Error(book.san);
    const nextIndex = play.plyIndex + 1;
    const done = nextIndex >= level.steps.length;
    const bookAsk = step.replyBookFollowUp;
    return {
      ...play,
      fen: chess.fen(),
      lastMove: { from: moved.from, to: moved.to },
      lastSan: moved.san,
      historySan: [...play.historySan, moved.san],
      plyIndex: nextIndex,
      pendingReply: false,
      resumeAfterAsk: done ? 'done' : 'move',
      waiting: bookAsk ? 'oppAsk' : done ? 'done' : 'move',
      coach: {
        tone: bookAsk ? 'ask' : done ? 'done' : 'ok',
        say: book.say,
        highlights: book.highlights ?? [],
        remember: done && !bookAsk ? level.ideaCard : undefined,
        followUp: bookAsk,
      },
      ideaCard: done ? level.ideaCard : undefined,
    };
  }
  return finishIfComplete({ ...play, plyIndex: play.plyIndex + 1, pendingReply: false }, level);
}

function finishIfComplete(play: SailPlay, level: SailLevel): SailPlay {
  if (play.plyIndex >= level.steps.length || (play.offBook && !play.punish)) {
    return {
      ...play,
      waiting: 'done',
      ideaCard: level.ideaCard,
      coach: play.coach ?? {
        tone: 'done',
        say: tl('campaign.rememberCard', { card: level.ideaCard }),
        remember: level.ideaCard,
        highlights: [],
      },
    };
  }
  return { ...play, waiting: 'move' };
}

export function completeAfterAsk(play: SailPlay, level: SailLevel): SailPlay {
  if (play.punish) {
    return {
      ...play,
      waiting: 'move',
      coach: {
        tone: 'ask',
        say: tl('campaign.softNow'),
        highlights: play.punish.highlights,
      },
    };
  }
  return {
    ...play,
    waiting: 'done',
    ideaCard: level.ideaCard,
    coach: {
      tone: 'done',
      say: tl('campaign.rememberCard', { card: level.ideaCard }),
      remember: level.ideaCard,
      highlights: play.coach?.highlights ?? [],
    },
  };
}

export function gradeFollowUp(followUp: FollowUp, pick: string): boolean {
  if (followUp.kind === 'tap') return pick === followUp.square;
  return followUp.options.some((o) => o.id === pick && o.correct);
}
