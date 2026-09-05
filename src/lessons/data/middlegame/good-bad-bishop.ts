import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'middlegame/good-bad-bishop',
  section: 'middlegame',
  title: '好象与坏象：兵链同色象的处理',
  summary: '法兰西链条下，白方轻象受己方中心兵限制，如何改善或兑换',
  startFen: 'r1b2rk1/pp2bppp/1qn1p3/3pPn2/3P4/5NP1/PPN1BP1P/R1BQ1K1R w - - 1 12',
  playerColor: 'w',
  theme:
    '坏象是被己方固定兵链限制在同色格的象。法兰西前进结构里，白方的浅色象常常难受。处理办法：Kg2 改善王与协调、h4 抢空间、用 Be3/Bd3 重新部署，或在适当时机兑掉坏象。训练目标：识别坏象并执行改善计划。',
  keyIdeas: [
    '先安全安置王（Kg2），再谈改善象',
    'h4-h5 可驱赶 f5 马，同时给象腾活动空间',
    'Be3 或 Bd3 重新选斜线，比困在 e2 更有用',
    '若能兑掉坏象换对方好象，通常值得考虑',
  ],
  principleIds: ['good-bad-bishop', 'prophylaxis', 'pawn-chain-attack', 'king-safety-castling'],
  modelLine: ['Kg2', 'Bd7', 'h4', 'Rac8', 'h5', 'Nh6', 'Be3', 'Qc7', 'Bd3'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['bishop', 'middlegame'],
};
