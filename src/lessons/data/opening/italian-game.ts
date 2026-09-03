import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/italian-game',
  section: 'opening',
  title: '意大利开局：慢速 c3-d3 体系',
  summary: '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 后白方如何布阵',
  startFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 0 5',
  playerColor: 'w',
  theme: '意大利开局的慢速体系里，白方不急于 d4，而是用 d3、O-O、Re1、Nbd2-f1-g3 或 b4/a4 慢慢展开。训练目标是完成出子和易位，同时保留中心张力。',
  keyIdeas: ['d3 支撑 e4 并给 c4 象留退路', '尽早 O-O，之后 Re1 保护 e4', '马的路线 Nb1-d2-f1-g3 是这个体系的标志', 'b4 或 a4 限制黑方 c5 象'],
  principleIds: ['center-control', 'development-order', 'king-safety-castling', 'initiative-tempo'],
  modelLine: ['d3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'Nbd2', 'Ba7', 'Nf1', 'h6', 'Ng3'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
