import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'opening/kings-indian',
  section: 'opening',
  title: '王翼印度：黑方王翼反击',
  summary: '古典体系 d5 封闭中心后，黑方 …f5 与子力调集的反击节奏',
  startFen: 'r1bq1rk1/ppp1npbp/3p1np1/3Pp3/1PP1P3/2N2N2/P3BPPP/R1BQ1RK1 b - - 0 9',
  playerColor: 'b',
  theme:
    '白方推进 d5 封闭中心后，战场转向两翼。黑方的主计划是 …Ne8/…Nd7、…f5 打开 f 线，配合 …g5 或子力杀向白王。后翼则要提防白方 b4-c5。训练目标：找准 …f5 时机，不要在后翼被冲垮。',
  keyIdeas: [
    '…Ne8 或 …Nd7 给 f 兵让路，是 …f5 的前奏',
    '…f5 后若白方 exf5，常用 …gxf5 保持中心弹性',
    '王翼象 g7 是防守与进攻的轴心，勿轻易兑换',
    '白方 b4-c5 时，用 …a5 / …b6 或加速王翼对抗',
  ],
  principleIds: ['pawn-chain-attack', 'king-safety-castling', 'initiative-tempo', 'good-bad-bishop'],
  modelLine: ['Ne8', 'Nd2', 'f5', 'f3', 'f4', 'a4', 'g5', 'c5', 'Ng6'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['kings-indian', 'opening'],
};
