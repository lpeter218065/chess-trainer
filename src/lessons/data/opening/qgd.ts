import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/qgd',
  section: 'opening',
  title: '后翼弃兵拒吃：黑方的稳固布局',
  summary: '1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 后黑方如何出子和解放局面',
  startFen: 'rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4',
  playerColor: 'b',
  theme: '拒吃后翼弃兵的黑方先用 ...Be7、...O-O、...Nbd7 建立稳固阵型，再通过 ...c5 或 ...dxc4 加 ...b5 解放。训练目标是不被牵制、不丢中心、按时完成解放性的兵推进。',
  keyIdeas: ['...Be7 解除 g5 象对 f6 马的牵制', '...Nbd7 而不是 ...Nc6，给 c 兵留路', '...h6 询问 g5 象也是常见手段', '解放方案：...dxc4 + ...c5 或 ...Ne4'],
  principleIds: ['development-order', 'king-safety-castling', 'center-control', 'prophylaxis'],
  modelLine: ['Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'c6', 'Bd3', 'dxc4', 'Bxc4', 'Nd5'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
