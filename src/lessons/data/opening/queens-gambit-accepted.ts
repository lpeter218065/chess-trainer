import type { Lesson } from '../../schema';

/** 后翼弃兵接受：白方夺回中心 */
export const lesson: Lesson = {
  id: 'opening/queens-gambit-accepted',
  section: 'opening',
  title: '后翼弃兵接受：白方夺回中心',
  summary: '1.d4 d5 2.c4 dxc4 后白方用 e3/Nf3/Bxc4 重建中心并压制 …c5',
  startFen: 'rnbqkb1r/pp3ppp/4pn2/2p5/2BP4/4PN2/PP3PPP/RNBQK2R w KQkq - 0 6',
  playerColor: 'w',
  theme:
    '黑方吃掉 c4 兵换取半开放局面。白方标准续着是 e3、Bxc4、Nf3，尽快 O-O，再用 Qe2/Rd1 或 dxc5 处理中心张力。训练重点：不要死守 d4，而要用出子速度把主动权拿回来；黑方 …a6/…b5 抢侧翼时要用 a4 或 Bb3 限制。',
  keyIdeas: [
    'Bxc4 后优先 O-O，再谈中心定型',
    '面对 …c5，常见选择是 O-O 后 Qe2，或适时 dxc5',
    '黑方 …a6 准备 …b5 时，a4 或 Bb3 是预防手段',
    '避免过早 Nb1-c3 被 …Bb4 牵制，除非已易位',
  ],
  principleIds: ['center-control', 'development-order', 'initiative-tempo', 'prophylaxis'],
  modelLine: ['O-O', 'a6', 'Qe2', 'b5', 'Bb3', 'Bb7', 'Rd1', 'Nbd7', 'a4'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['queens-gambit', 'qga', 'opening'],
};
