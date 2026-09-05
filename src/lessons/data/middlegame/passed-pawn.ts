import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'middlegame/passed-pawn',
  section: 'middlegame',
  title: '通路兵推进：护航与封锁',
  summary: '中残过渡出现通路兵时，如何护航前进并防止对方封锁',
  startFen: '2r1r1k1/p2n1ppp/4q1n1/1Ppp4/N7/3BPP2/P1Q3PP/1R3RK1 w - - 0 20',
  playerColor: 'w',
  theme:
    '通路兵是中残局的核心资产。白方 b5 兵已成通路潜力，需要车在后方或侧翼护航，用轻子驱赶封锁子，并防止黑方用车卡在兵前。训练目标：推进与保护同步，不孤军深入被围歼。',
  keyIdeas: [
    '车尽量放在通路兵后方（或能支持前进的位置）',
    '推进前先赶走封锁格上的对方子力',
    '不要让通路兵独自超前，失去子力保护',
    '对方用车换兵前，算清是否能进入可赢残局',
  ],
  principleIds: ['passed-pawn', 'rook-behind-passed-pawn', 'initiative-tempo', 'trade-when-ahead'],
  modelLine: ['b6', 'axb6', 'Nxb6', 'Nxb6', 'Rxb6', 'c4', 'Be2', 'Qc6', 'Rd1'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['passed-pawn', 'middlegame'],
};
