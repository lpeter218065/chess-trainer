import type { Lesson } from '../../schema';

export const lesson: Lesson = {
  id: 'opening/french-advance',
  section: 'opening',
  title: '法兰西前进变例：空间与破中心',
  summary: '1.e4 e6 2.d4 d5 3.e5 后白方保空间，黑方用 …c5/…Qb6 施压',
  startFen: '2r1kbnr/pp1b1ppp/1qn1p3/3pP3/1P1P4/P4N2/5PPP/RNBQKB1R w KQk - 1 9',
  playerColor: 'w',
  theme:
    '前进变例里白方用 e5 楔子换取空间，黑方则打 c5、压 d4。白方常见计划是保 d4（Be3/Qc2）、发展后翼，并限制黑方 …cxd4 后的 c 线压力。训练目标：稳住中心兵链，同时完成出子，不让黑方的 …Qb6/…Rc8 拿到免费主动。',
  keyIdeas: [
    'd4 是链条根基，优先用子力保护而不是过早放弃',
    'b4 扩展后翼可以驱赶 …c5 压力，但要防 …a5',
    'Be3、Nbd2、Bd3 是标准展开，王可短易位',
    '黑方 …cxd4 后，c 线半开放：注意 Rc1 与兑换时机',
  ],
  principleIds: ['center-control', 'pawn-chain-attack', 'development-order', 'prophylaxis'],
  modelLine: ['Be3', 'Nh6', 'Bd3', 'Nf5', 'Bxf5', 'exf5', 'O-O', 'Be7', 'Nbd2'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
  tags: ['french', 'opening'],
};
