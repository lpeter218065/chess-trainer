import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/philidor',
  section: 'endgame',
  title: 'Philidor 位置：第六横线防御',
  summary: '黑王 e8、车 b6 对白王 e5、兵 e4、车 a7，黑方守和',
  startFen: '4k3/R7/1r6/4K3/4P3/8/8/8 b - - 0 1',
  playerColor: 'b',
  theme: '守方王守在兵前，车放在第六横线（黑方视角的第三横线之外，即白方的第六横线 b6-h6）阻止白王上前。白兵推到 e6 时黑车立即回到 b1，从背后长将，白王无处躲藏。切记不要过早离开第六横线。',
  keyIdeas: ['车沿第六横线来回等待，不让白王到 f6/d6', '白兵走到 e6 的那一刻，车回到底线', '从背后将军时白王无法用兵挡住', '不要用王去吃兵或离开 e8/d8/f8'],
  principleIds: ['philidor-sixth-rank', 'zugzwang', 'rook-behind-passed-pawn'],
  modelLine: ['Rc6', 'Kd4', 'Rh6', 'e5', 'Rh1'],
  stop: { kind: 'gameOver', maxPlies: 80 },
  target: 'draw',
};
