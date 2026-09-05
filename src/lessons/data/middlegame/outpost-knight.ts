import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'middlegame/outpost-knight',
  section: 'middlegame',
  title: '前哨马：占强格与换子时机',
  summary: '西西里结构中，白方瞄准 d5 前哨，决定何时跳入、是否允许兑换',
  startFen: 'rn3rk1/1pq2ppp/p2pbb2/4p3/4P3/1NNQ4/PPP1BPPP/2KR3R w - - 4 12',
  playerColor: 'w',
  theme:
    '前哨是对方兵打不到、己方马（或子）能站稳的格子。本局白方盯着 d5：跳入后可压迫 e7/c7，若黑方用象换马，常会留下弱点或开放线。训练目标：制造并占领前哨，算清兑换后的结构。',
  keyIdeas: [
    'Nd5 是核心想法：有足够保护再跳入',
    '黑方 …Bxd5 exd5 后，e 线与通路由你掌控',
    '不要急于用马换掉对方无象，除非破坏其兵型',
    '前哨马站稳后，再调车、后增压',
  ],
  principleIds: ['outpost', 'knight-vs-bishop', 'initiative-tempo', 'attacker-avoids-trades'],
  modelLine: ['Nd5', 'Bxd5', 'exd5', 'Nd7', 'g4', 'Bg5', 'Kb1', 'Rac8', 'h4'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['outpost', 'middlegame'],
};
