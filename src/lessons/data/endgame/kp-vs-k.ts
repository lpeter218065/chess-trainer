import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/kp-vs-k',
  section: 'endgame',
  title: '王兵对王：对王与关键格',
  summary: '白王 d5、兵 e4 对黑王 e7，白方走棋取胜',
  startFen: '8/4k3/8/3K4/4P3/8/8/8 w - - 0 1',
  playerColor: 'w',
  theme: 'e4 兵的关键格是 d6、e6、f6。白王要先于兵到达关键格，办法是抢对王：1.Ke5! 之后黑王让路，白王进入 d6 或 f6，兵再跟上。过早推兵会导致和棋。',
  keyIdeas: ['先走王，不要先推兵', 'Ke5 抢对王，逼黑王让开', '白王到 d6/e6/f6 任一格就必胜', '兵到第六横线时注意别把王堵在兵前'],
  principleIds: ['opposition', 'key-squares', 'zugzwang'],
  modelLine: ['Ke5', 'Kd7', 'Kf6', 'Ke8', 'e5', 'Kf8', 'e6'],
  stop: { kind: 'gameOver', maxPlies: 60 },
  target: 'win',
};
