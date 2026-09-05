import type { Lesson } from '../../schema';

/** 伦敦：王翼进攻型展开（与现有「对 …c5」互补） */
export const lesson: Lesson = {
  id: 'opening/london-kingside',
  section: 'opening',
  title: '伦敦体系：王翼进攻展开',
  summary: '黑方 …Bd6 换象后，白方 Bg3、Bd3、Nbd2、准备 Ne5 / e4',
  startFen: 'r1bqr1k1/pp3ppp/2nbpn2/2pp4/3P4/2PBPNB1/PP1N1PPP/R2QK2R w KQ - 3 9',
  playerColor: 'w',
  theme:
    '伦敦金字塔成型后，黑方用 …Bd6 换掉 f4 象是常见选择。白方把象退到 g3，再用 Bd3、Nbd2 对准王翼：核心计划是 Ne5 占前哨、必要时 h4-h5 或 e3-e4 打开中心。训练目标是按正确顺序完成进攻准备，而不是过早乱冲。',
  keyIdeas: [
    'Bg3 保留好象，不要主动用 g3 象换掉 d6 象除非有强制续着',
    'Ne5 是主旋律：马站稳后再说 f4 或 Qf3',
    'O-O 通常先于侧翼冲兵，王安全优先',
    'e4 突破要在子力配合好、黑方中心被牵制时再推',
  ],
  principleIds: ['development-order', 'outpost', 'king-safety-castling', 'initiative-tempo'],
  modelLine: ['O-O', 'e5', 'dxe5', 'Nxe5', 'Nxe5', 'Bxe5', 'Bxe5', 'Rxe5', 'e4'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['london', 'opening'],
};
