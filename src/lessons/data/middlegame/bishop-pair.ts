import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'middlegame/bishop-pair',
  section: 'middlegame',
  title: '双象开线：打开局面发挥双象',
  summary: '白方拥有双象，在半开放结构里如何打开线路取势',
  startFen: 'r1bqrbk1/p4pp1/2p2n1p/3p4/8/2N1B1P1/PP2PPBP/2RQ1RK1 w - - 0 14',
  playerColor: 'w',
  theme:
    '双象在开放或半开放局面最有威力。白方应避免无谓兑象，用 e4 / b4-b5 / 打开长对角线来放大 g2、e3 象的射程。黑方会试图用马封锁或兑掉一象。训练目标：主动打开局面，而不是被动守成。',
  keyIdeas: [
    '有双象时倾向打开中心与长对角线，而不是封闭',
    'e4 或 b4-b5 常是打开局面的钥匙',
    '避免用象换马，除非有明确的结构或战术收益',
    '后与象的炮台（如 Qd2/Qc2）可瞄准弱格',
  ],
  principleIds: ['bishop-pair', 'initiative-tempo', 'attacker-avoids-trades', 'open-file-rook'],
  modelLine: ['Na4', 'Bd7', 'Nc5', 'Bc8', 'Qa4', 'Qd6', 'Rfd1', 'Nd7', 'b4'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['bishop-pair', 'middlegame'],
};
