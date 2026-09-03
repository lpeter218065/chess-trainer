import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/minority-attack',
  section: 'middlegame',
  title: '少数兵进攻：卡尔斯巴德兵型',
  summary: '白方用 a、b 兵推进制造黑方 c6 弱点',
  startFen: 'r1bqr1k1/pp1nbppp/2p2n2/3p2B1/3P4/2NBPN2/PPQ2PPP/R4RK1 w - - 0 11',
  playerColor: 'w',
  theme: '后翼弃兵交换变例形成的卡尔斯巴德兵型。白方的标准计划是 Rab1、b4、a4、b5，交换后黑方留下 c6 弱兵或 d5 孤兵，白方再用车和后从 c 线施压。黑方则争取 ...Ne4 和王翼反击。',
  keyIdeas: ['Rab1、b4、a4、b5 是完整顺序，不要跳步', '黑方 ...a6 抵抗时用 a4 顶上去', 'c 线和 c5 格是进攻成果的收割点', '当心黑方 ...Ne4 和 ...Bd6-...Qc7 指向 h2 的反击'],
  principleIds: ['minority-attack', 'prophylaxis', 'open-file-rook', 'isolated-pawn'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
