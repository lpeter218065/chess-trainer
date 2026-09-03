import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/open-sicilian',
  section: 'opening',
  title: '开放西西里：纳伊道夫基本结构',
  summary: '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 后白方的主要方案',
  startFen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  playerColor: 'w',
  theme: '白方在开放西西里里换掉了 d 兵，得到了空间和出子速度，黑方则拿到 c 线和长期的兵型优势。白方要利用速度优势，选定一个方案（Be2 平稳、Be3+f3 英国式进攻、Bg5 尖锐）并坚决执行。',
  keyIdeas: ['d4 马是中心支柱，注意 ...e5 的驱赶', '常见方案：Be2/O-O 或 Be3/f3/Qd2/O-O-O', '不要让黑方无偿完成 ...b5-...b4', 'f4/f3 是王翼进攻还是防守，要在方案里定好'],
  principleIds: ['development-order', 'center-control', 'initiative-tempo', 'king-safety-castling'],
  modelLine: ['Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7', 'Qd2', 'O-O', 'O-O-O'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
