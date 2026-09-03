import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/kr-vs-k',
  section: 'endgame',
  title: '王车杀单王',
  summary: '白王 e3、车 a1 对黑王 e5，白方在 20 回合内杀王',
  startFen: '8/8/8/4k3/8/4K3/8/R7 w - - 0 1',
  playerColor: 'w',
  theme: '用车画一条线把黑王限制在半边棋盘，白王上前对王，黑王被迫后退时车再缩小方框。只在能缩小方框或黑王对王时走车，其他时候走王。目标是在边线完成杀王，避免逼和。',
  keyIdeas: ['第一步 Ra5+ 或 Rd1 把黑王限制到一侧', '王去对王，黑王让路时车再推进一线', '黑王在角落附近时留意逼和', '等待着法：黑王想对王时车横移一格'],
  principleIds: ['rook-mate-box', 'opposition', 'zugzwang'],
  stop: { kind: 'gameOver', maxPlies: 60 },
  target: 'win',
};
