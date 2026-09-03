import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/london',
  section: 'opening',
  title: '伦敦体系：对 ...c5 的处理',
  summary: '1.d4 d5 2.Bf4 Nf6 3.e3 e6 4.Nf3 c5 5.c3 Nc6 后白方的标准展开',
  startFen: 'r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P1B2/2P1PN2/PP3PPP/RN1QKB1R w KQkq - 2 6',
  playerColor: 'w',
  theme: '伦敦体系用 d4、Bf4、e3、c3 搭出金字塔兵型。黑方 ...c5 加 ...Qb6 是主要反击手段，白方要知道 Nbd2、Bd3、O-O 的正常顺序，以及何时用 Qb3 或 Qc1 应付 ...Qb6。',
  keyIdeas: ['Nbd2 先于 Bd3，避免 ...Nb4 的骚扰', '面对 ...Qb6，Qb3 提议换后是最稳的解法', 'f4 象是王翼进攻的核心，别轻易换掉', 'e3-e4 是白方争取的中心突破'],
  principleIds: ['development-order', 'center-control', 'prophylaxis', 'good-bad-bishop'],
  modelLine: ['Nbd2', 'Bd6', 'Bg3', 'O-O', 'Bd3', 'b6', 'O-O', 'Bb7', 'Qe2'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
