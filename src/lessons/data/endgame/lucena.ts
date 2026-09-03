import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/lucena',
  section: 'endgame',
  title: 'Lucena 位置：搭桥',
  summary: '白王 b8、兵 b7、车 d1 对黑王 e7、车 a2，白方取胜',
  startFen: '1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1',
  playerColor: 'w',
  theme: '车残局最重要的胜利位置。白王在兵前，黑王被 d 线上的车切断。标准技术：1.Rd4 把车放到第四横线，2.Kc7 出王，黑车从 c 线长将，白王沿 b6-c6-b5 走，最后 Rb4 挡住将军完成“搭桥”。',
  keyIdeas: ['第一步 Rd4，不是急着出王', '王被将军时向兵靠拢，交替走 b、c 线', '车到第四横线后就能挡住最后一次将军', '不要让黑王回到 c 线附近'],
  principleIds: ['lucena-bridge', 'rook-behind-passed-pawn', 'passed-pawn'],
  modelLine: ['Rd4', 'Ra1', 'Kc7', 'Rc1+', 'Kb6', 'Rb1+', 'Kc6', 'Rc1+', 'Kb5', 'Rb1+', 'Rb4'],
  stop: { kind: 'gameOver', maxPlies: 60 },
  target: 'win',
};
