import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'opening/caro-kann',
  section: 'opening',
  title: '卡罗·康：黑方稳固结构',
  summary: '1.e4 c6 2.d4 d5 经典变例后，黑方如何完成出子并挑战中心',
  startFen: 'r2qkb1r/pp1n1pp1/2p1pn1p/7P/3P4/3Q1NN1/PPPB1PP1/2KR3R b kq - 3 12',
  playerColor: 'b',
  theme:
    '卡罗·康给黑方一个坚固的兵链与安全的王。经典变例里白方常长易位并冲 h 兵；黑方要按时 …e6、…Ngf6、…Be7/…Qc7，再视情况 …c5 或 …O-O。训练目标：不被白方侧翼进攻打乱，稳步完成出子。',
  keyIdeas: [
    '…e6 先巩固，再 …Ngf6，不要急于乱兑',
    '白方长易位时，…Qc7、…O-O-O 或短易位都要评估王安全',
    '适时 …c5 是主要解放手段，对准 d4',
    '轻子优先放到积极格，避免被挤在后翼',
  ],
  principleIds: ['development-order', 'king-safety-castling', 'center-control', 'prophylaxis'],
  modelLine: ['Be7', 'Kb1', 'O-O', 'Ne4', 'Nxe4', 'Qxe4', 'Nf6', 'Qe2', 'Qb6'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['caro-kann', 'opening'],
};
