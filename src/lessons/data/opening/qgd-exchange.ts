import type { Lesson } from '../../schema';

/** 后翼弃兵交换变例：白方卡尔斯巴德布局 */
export const lesson: Lesson = {
  id: 'opening/qgd-exchange',
  section: 'opening',
  title: '后翼弃兵交换：卡尔斯巴德布局',
  summary: 'cxd5 exd5 后白方 Bd3、Qc2、Nge2/Nf3、O-O，准备少数兵进攻',
  startFen: 'r1bqrnk1/pp2bppp/2p2n2/3p2B1/3P4/2NBPN2/PPQ2PPP/R4RK1 w - - 4 11',
  playerColor: 'w',
  theme:
    '交换变例形成卡尔斯巴德兵型（白方 e3/d4，黑方 c6/d5）。开局阶段的目标不是立刻冲 b4，而是完成 Bd3、Qc2、O-O、Rfe1/Rab1 的标准配置，把少数兵进攻留给中局。黑方常走 …Nf8-g6 或 …Ne4，白方要保持对 e4/c5 的控制。',
  keyIdeas: [
    'Qc2 + Bd3 是标准炮台，对准 h7 也支援 e4',
    '先完成出子与易位，再 Rab1、b4 启动少数兵进攻',
    '黑方 …Ne4 时，Bxe7 与 Nxe4 的交换要算清是否帮对方简化',
    'e4 突破与 b5 推进二选一，不要同时拆散结构',
  ],
  principleIds: ['development-order', 'minority-attack', 'center-control', 'prophylaxis'],
  modelLine: ['Rab1', 'Ng6', 'b4', 'a6', 'a4', 'Bd6', 'b5', 'axb5', 'axb5'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['queens-gambit', 'qgd', 'carlsbad', 'opening'],
};
