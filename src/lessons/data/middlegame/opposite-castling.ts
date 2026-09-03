import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/opposite-castling',
  section: 'middlegame',
  title: '异侧易位互攻：龙式变例',
  summary: '白方长易位、黑方短易位，比拼进攻速度',
  startFen: '2rq1rk1/pp1bppbp/3p1np1/4n3/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 0 12',
  playerColor: 'w',
  theme: '西西里龙式南斯拉夫进攻的典型局面。白方用 h4-h5 打开 h 线，配合 Bh6 换掉 g7 象；黑方用 c 线和 ...Nc4、...Qa5 反击。每一步都问：这步是在加快我的进攻，还是在浪费节奏？',
  keyIdeas: ['h4-h5 是主计划，hxg6 后 h 线是白方的', 'Bh6 换掉龙象是削弱黑王的关键', '注意 c3 马被 ...Rxc3 弃换的威胁，Kb1 常常是必要的预防', '不要轻易换后，换后就等于放弃进攻'],
  principleIds: ['opposite-castling', 'attacker-avoids-trades', 'prophylaxis', 'initiative-tempo'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
