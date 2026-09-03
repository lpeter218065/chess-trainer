import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/open-file',
  section: 'middlegame',
  title: '开放线上的车',
  summary: '双方 e 兵都已消失，争夺 e 线并渗透第七横线',
  startFen: 'r4rk1/pp1b1ppp/2pq1n2/3p4/3P4/2PQ1N2/PP1B1PPP/R4RK1 w - - 0 15',
  playerColor: 'w',
  theme: '局面对称、只有 e 线开放。谁先把两个车放到 e 线并控制 e7/e2 这样的入口格，谁就能渗透到对方第七横线。训练目标是学会用车与轻子配合争夺一条线，而不是漫无目的地调动。',
  keyIdeas: ['Rfe1 然后 Rae1，把两个车都放上开放线', '控制入口格 e7：Bg5 或 Ne5 帮车渗透', '对方要争线时，用子力把 e 线上的交换点守住', '第七横线的车配合后能制造杀王威胁'],
  principleIds: ['open-file-rook', 'initiative-tempo', 'prophylaxis', 'outpost'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
