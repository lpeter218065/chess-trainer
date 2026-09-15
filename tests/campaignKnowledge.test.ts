import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { CAMPAIGN_ISLANDS, QUEEN_PAWN_ISLAND, SICILIAN_ISLAND, levelById } from '../src/campaign';
import { applyOpponent, bookReplyFor, startSail, tryPlayerMove } from '../src/campaign/play';
import type { CampaignLevel, FollowUp, RecognizeLevel, SailLevel } from '../src/campaign/types';

function asSail(id: string): SailLevel {
  const level = levelById(id);
  if (!level || (level.kind !== 'sail' && level.kind !== 'boss')) throw new Error(id);
  return level;
}

function asRecognize(id: string): RecognizeLevel {
  const level = levelById(id);
  if (!level || level.kind !== 'recognize') throw new Error(id);
  return level;
}

function playSan(play: ReturnType<typeof startSail>, level: SailLevel, san: string) {
  const chess = new Chess(play.fen);
  const legal = chess.moves({ verbose: true }).find((m) => m.san === san);
  if (!legal) throw new Error(`no ${san} in ${play.fen}`);
  return tryPlayerMove(play, level, legal.from, legal.to);
}

function followUpsOf(level: CampaignLevel): FollowUp[] {
  if (level.kind === 'recognize') return level.followUp ? [level.followUp] : [];
  const out: FollowUp[] = [];
  for (const step of level.steps) {
    if (step.correct.followUp) out.push(step.correct.followUp);
    if (step.replyBookFollowUp) out.push(step.replyBookFollowUp);
    const deviate = step.replyDeviate
      ? Array.isArray(step.replyDeviate)
        ? step.replyDeviate
        : [step.replyDeviate]
      : [];
    for (const soft of deviate) {
      out.push(soft.ask);
      if (soft.punishOk.followUp) out.push(soft.punishOk.followUp);
      for (const coach of Object.values(soft.punishOkBySan ?? {})) {
        if (coach.followUp) out.push(coach.followUp);
      }
    }
  }
  return out;
}

describe('sicilian knowledge', () => {
  it('asks which square c5 stares at, not White’s next ply', () => {
    const follow = asRecognize('sicilian-1').followUp;
    expect(follow?.kind).toBe('tap');
    expect(follow && follow.kind === 'tap' ? follow.square : '').toBe('d4');
    expect(follow?.prompt).not.toMatch(/下一手/);
    expect(follow?.prompt).toMatch(/盯/);
  });

  it('treats a slow d3 as delayed d4, not a hanging e4', () => {
    const level = asSail('sicilian-4');
    const d3 = level.steps[0].replyDeviate;
    const list = Array.isArray(d3) ? d3 : d3 ? [d3] : [];
    const slow = list.find((item) => item.san === 'd3');
    expect(slow).toBeTruthy();
    expect(slow?.ask.prompt).not.toMatch(/没保/);
    expect(`${slow?.say}${slow?.ask.prompt}${slow?.ask.explainOk}${slow?.ask.explainBad}`).not.toMatch(
      /没人保|变软/,
    );
    expect(slow?.punishSans).toContain('Nf6');
    expect(slow?.punishSans).not.toContain('Nxe4');
  });

  it('does not offer illegal Be7 after 6.Be3', () => {
    const step = asSail('sicilian-9').steps[0];
    expect(step.correctSans).toEqual(['e6', 'e5']);
    expect(step.correctSans).not.toContain('Be7');
    const fen = startSail(asSail('sicilian-9')).fen;
    expect(new Chess(fen).moves()).not.toContain('Be7');
    expect(new Chess(fen).moves()).toContain('e6');
    expect(new Chess(fen).moves()).toContain('e5');
  });

  it('retreats the d4 knight after ...e5 so a pawn cannot take it', () => {
    const level = asSail('sicilian-9');
    expect(bookReplyFor(level.steps[0], 'e5').san).toBe('Nb3');
    expect(bookReplyFor(level.steps[0], 'e6').san).toBe('f3');
    let play = startSail(level);
    play = playSan(play, level, 'e5');
    play = applyOpponent({ ...play, pendingReply: true, waiting: 'oppAsk' }, level, false);
    expect(play.lastMove).toEqual({ from: 'd4', to: 'b3' });
    const takes = new Chess(play.fen)
      .moves({ verbose: true })
      .filter((move) => move.piece === 'p' && move.captured && move.captured !== 'p');
    expect(takes).toEqual([]);
  });
});

describe('queen pawn knowledge', () => {
  it('keeps the London bishop outside the pawn chain', () => {
    const follow = asRecognize('qp-7').followUp;
    expect(follow?.kind).toBe('choice');
    const correct =
      follow && follow.kind === 'choice' ? follow.options.find((option) => option.correct) : undefined;
    expect(correct?.label).not.toMatch(/把象关/);
    expect(correct?.label).toMatch(/象已经在外面/);
    expect(follow?.explainOk).toMatch(/金字塔尖/);
  });

  it('teaches QGA recapture as keeping d4, not two unmoved center pawns', () => {
    const level = asRecognize('qp-5');
    expect(level.explain).not.toMatch(/中心两个兵还在/);
    expect(level.explain).toMatch(/d4 还在/);
  });

  it('treats 2.c4 against ...Nf6 as space, not a missed hit on d5', () => {
    const level = asSail('qp-2');
    const nf6 = (Array.isArray(level.steps[0].replyDeviate)
      ? level.steps[0].replyDeviate
      : [level.steps[0].replyDeviate]
    ).find((item) => item?.san === 'Nf6');
    expect(nf6?.ask.explainBad).not.toMatch(/打空了/);
    expect(nf6?.ask.explainOk).toMatch(/占空间/);
    expect(nf6?.punishSans).toEqual(expect.arrayContaining(['Bf4', 'Nf3', 'c4']));
    expect(nf6?.punishWrong.say).toMatch(/c4/);
  });

  it('answers the Tarrasch with a capture on d5 or e3, not c5', () => {
    const level = asSail('qp-6');
    const c5 = (Array.isArray(level.steps[0].replyDeviate)
      ? level.steps[0].replyDeviate
      : [level.steps[0].replyDeviate]
    ).find((item) => item?.san === 'c5');
    expect(c5?.punishSans).toEqual(expect.arrayContaining(['cxd5', 'e3']));
    expect(c5?.punishWrong.say).not.toMatch(/换掉 c5/);
    expect(c5?.punishWrong.say).toMatch(/d5|e3/);
  });
});

describe('campaign follow-ups', () => {
  it('gives every choice follow-up exactly one correct answer', () => {
    for (const island of CAMPAIGN_ISLANDS) {
      for (const level of island.levels) {
        for (const follow of followUpsOf(level)) {
          if (follow.kind !== 'choice') continue;
          expect(
            follow.options.filter((option) => option.correct),
            `${island.id} ${level.id} ${follow.prompt}`,
          ).toHaveLength(1);
        }
      }
    }
  });

  it('covers both published islands', () => {
    expect(SICILIAN_ISLAND.levels).toHaveLength(10);
    expect(QUEEN_PAWN_ISLAND.levels).toHaveLength(10);
  });
});
