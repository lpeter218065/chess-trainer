import type { Lesson } from '../../schema';

/** 后翼弃兵中局：正统体系解放后的白方主动 */
export const lesson: Lesson = {
  id: 'middlegame/qgd-orthodox',
  section: 'middlegame',
  title: '后翼弃兵中局：正统体系的主动',
  summary: '黑方 …dxc4 解放后，白方如何用中心与开放线施压',
  startFen: 'r1bq1rk1/pp1nbppp/2p1p3/3n2B1/2BP4/2N1PN2/PP3PPP/2RQK2R w K - 1 10',
  playerColor: 'w',
  theme:
    '拒吃后翼弃兵里，黑方 …dxc4 解放并以 …Nd5 寻求兑换。白方要在 Bxe7、Nxd5、O-O、Qe2/Rfd1 等续着里保持主动，不让黑方轻松走成 …c5 均势。训练目标：选对兑换、保持中心压力。',
  keyIdeas: [
    '面对 …Nd5，Bxe7 再 Nxd5 是稳健选择，保留中心多数',
    'O-O 后 Qe2、Rfd1 沿半开放线增压',
    '预防黑方 …c5：注意 timing，必要时 e4 抢先',
    '优势不大时避免兑光进入和势残局',
  ],
  principleIds: ['center-control', 'initiative-tempo', 'open-file-rook', 'trade-when-ahead'],
  modelLine: ['Bxe7', 'Qxe7', 'O-O', 'Nxc3', 'Rxc3', 'e5', 'Bb3', 'exd4', 'exd4'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['queens-gambit', 'qgd', 'middlegame'],
};
