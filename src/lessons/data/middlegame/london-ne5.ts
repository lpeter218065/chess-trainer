import type { Lesson } from '../../schema';

/** 伦敦中局：Ne5 前哨进攻 */
export const lesson: Lesson = {
  id: 'middlegame/london-ne5',
  section: 'middlegame',
  title: '伦敦中局：Ne5 前哨进攻',
  summary: '白方已完成出子，轮到用 Ne5 占强格并组织王翼压力',
  startFen: 'r2q1rk1/pb3ppp/1pnbpn2/2pp4/3P4/2PBPNB1/PP1N1PPP/R2Q1RK1 w - - 2 10',
  playerColor: 'w',
  theme:
    '伦敦体系转入中局后，最典型的主动计划就是 Ne5。马站上 e5 后，可配合 f4、Qf3、Bh4，或与 Bd3 形成对 h7 的压力。黑方会用 …Nxe5 / …Nd7 / …Qc7 对抗。训练目标：占住前哨、避免无谓兑换、在对手挑战 e5 时选对续着。',
  keyIdeas: [
    'Ne5 优先于盲目冲 h 兵',
    '黑方 …Nxe5 dxe5 后，d 线半开放，注意保护 e5 兵链',
    'Qf3 / Qh5 要等马站稳、象指向王翼后再出动',
    '若黑方 …cxd4 cxd4，c 线打开时可用 Rc1 平衡计划',
  ],
  principleIds: ['outpost', 'attacker-avoids-trades', 'initiative-tempo', 'good-bad-bishop'],
  modelLine: ['Ne5', 'Qc7', 'f4', 'Rad8', 'Qf3', 'Nxe5', 'fxe5', 'Nd7', 'Qh5'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['london', 'middlegame'],
};
