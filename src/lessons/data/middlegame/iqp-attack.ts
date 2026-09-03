import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/iqp-attack',
  section: 'middlegame',
  title: '孤立后兵：利用动力进攻',
  summary: '白方持 d4 孤兵，用空间和子力活动换王翼攻势',
  startFen: 'r1bq1rk1/pp2bppp/2n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10',
  playerColor: 'w',
  theme: '白方的 d4 孤兵给了 e5 前哨、半开放的 c/e 线和更多空间。正确的打法是趁子力还多时在王翼进攻：Re1、Bc2/Qd3 的炮台、Ne5、必要时 d4-d5 突破。不能被动防守 d4 兵。',
  keyIdeas: ['Re1 + Bc2 + Qd3 指向 h7', 'Ne5 占前哨，配合 f4 或 Qf3', 'd4-d5 突破在对方子力配合不好时最有力', '避免一切交换：子力越少孤兵越弱'],
  principleIds: ['isolated-pawn', 'attacker-avoids-trades', 'outpost', 'initiative-tempo'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
