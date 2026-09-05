import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'opening/ruy-lopez',
  section: 'opening',
  title: '西班牙开局：慢速闭式体系',
  summary: '1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 Nf6 5.O-O Be7 后白方 c3-d3/d4 的稳健展开',
  startFen: 'r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - - 1 9',
  playerColor: 'w',
  theme:
    '闭式西班牙里，白方不急于立刻开线，而是用 c3、h3、d3/d4、Nbd2 慢慢构筑。训练目标是完成出子与中心控制，同时限制黑方 …Na5 换掉 b3 象、以及 …d5 的解放。',
  keyIdeas: [
    'h3 常有用：防 …Bg4，并给 Be3 留退路',
    'd3 稳健；准备充分后再 d4 打开中心',
    'Nbd2-f1-g3 是经典马道，与意大利慢速体系类似',
    '黑方 …Na5 时，Bc2 保留好象比被换掉更好',
  ],
  principleIds: ['development-order', 'center-control', 'king-safety-castling', 'prophylaxis'],
  modelLine: ['h3', 'Nb8', 'd4', 'Nbd7', 'Nbd2', 'Bb7', 'Nf1', 'Re8', 'Ng3'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['ruy-lopez', 'opening'],
};
