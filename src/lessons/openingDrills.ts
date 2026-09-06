import type { Color } from './schema';

/** 起步方式：起始局面，或走出该开局定式前几步后轮到己方 */
export type DrillStartMode = 'from-start' | 'tabiya';

/** 开局练习：可选执白/执黑 × 两种起步 × 对手强度 */
export interface OpeningDrill {
  id: string;
  title: string;
  summary: string;
  theme: string;
  keyIdeas: string[];
  principleIds: string[];
  /**
   * 执白 · 定式：双方走出开局前几步，停在白方行棋。
   */
  whiteTabiyaLine: string[];
  /**
   * 执黑 · 定式：双方走出开局前几步，停在黑方行棋。
   */
  blackStartLine: string[];
  /**
   * 开局书：从起始局面起的 SAN 线路。对手行棋时若局面在书中则走书，否则交给引擎。
   * 第一条为主变，应覆盖 whiteTabiyaLine / blackStartLine。
   */
  opponentBook: string[][];
  /** 用户走满多少步结束（抓机会练习，略长于主题课） */
  userPlies: number;
}

export const OPENING_DRILLS: OpeningDrill[] = [
  {
    id: 'london',
    title: '伦敦体系',
    summary: '1.d4 后的金字塔结构：出子、Ne5、e4 与抓软着',
    theme:
      '伦敦体系练习：你要按体系出子并寻找对方的松弛之处（弱格、未保护子力、过早侧翼出动）。对手会按强度应战——一般对手会出软着，高级对手更接近正确续着。',
    keyIdeas: ['Bf4/e3/c3 搭金字塔', 'Nbd2 先于 Bd3', 'Ne5 与 e4 是主动计划', '抓住对方过早 …Qb6/…c5 的不当时机'],
    principleIds: ['development-order', 'center-control', 'outpost', 'initiative-tempo'],
    whiteTabiyaLine: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6'],
    blackStartLine: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'],
    opponentBook: [
      ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6', 'Bg3', 'O-O', 'Nbd2', 'c5', 'c3', 'Nc6', 'Bd3', 'Re8', 'O-O'],
      ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c5', 'e3', 'Nc6', 'c3', 'Qb6', 'Qb3', 'c4', 'Qc2'],
      ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'Bf5', 'e3', 'e6', 'Nbd2', 'Bd6', 'Bg3'],
      ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'c6', 'e3', 'Bf5', 'c4', 'e6', 'Nc3'],
      ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'Bd6', 'Bg3', 'O-O', 'Nbd2'],
      ['d4', 'Nf6', 'Nf3', 'e6', 'Bf4', 'd5', 'e3', 'Be7', 'Nbd2', 'O-O', 'Bd3'],
      ['d4', 'Nf6', 'Nf3', 'g6', 'Bf4', 'Bg7', 'e3', 'O-O', 'Be2', 'd6', 'O-O'],
      ['d4', 'e6', 'Nf3', 'd5', 'Bf4', 'Nf6', 'e3', 'Be7', 'Nbd2'],
      ['d4', 'c5', 'c3', 'cxd4', 'cxd4', 'd5', 'Nf3', 'Nf6', 'Bf4', 'Nc6', 'e3'],
      ['d4', 'c6', 'Nf3', 'd5', 'Bf4', 'Nf6', 'e3', 'Bf5', 'c4'],
    ],
    userPlies: 12,
  },
  {
    id: 'two-knights',
    title: '双马防守',
    summary: '1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6：战术与中心张力',
    theme:
      '双马防守练习：白方考验黑方在 Ng5/d4 压力下的应对；黑方则寻找反击与简化。一般对手会漏战术，高级对手计算更深——看你能否抓住机会。',
    keyIdeas: ['注意 Ng5 与 f7', 'd4 打开中心时的兑换', '出子速度优先于吃兵', '王安全：及时易位'],
    principleIds: ['development-order', 'initiative-tempo', 'king-safety-castling', 'center-control'],
    whiteTabiyaLine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'],
    blackStartLine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    opponentBook: [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'Ng5', 'd5', 'exd5', 'Na5', 'Bb5+', 'c6', 'dxc6', 'bxc6', 'Be2', 'h6', 'Nf3', 'e4', 'Ne5', 'Bd6'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3', 'Be7', 'O-O', 'O-O', 'Re1', 'd6', 'a4'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd4', 'exd4', 'e5', 'd5', 'Bb5', 'Ne4', 'Nxd4', 'Bd7', 'Bxc6', 'Bxc6', 'O-O'],
    ],
    userPlies: 12,
  },
  {
    id: 'queens-gambit',
    title: '后翼弃兵',
    summary: '1.d4 d5 2.c4：中心争夺、解放与结构弱点',
    theme:
      '后翼弃兵练习：白方压中心与制造结构弱点，黑方稳固后寻求 …c5/…e5 解放。练习在「一般 / 高级」对手下识别错着与反击时机。',
    keyIdeas: ['c4 对 d5 的压力', '出子完成前进攻', '注意孤立兵/卡尔斯巴德结构', '黑方及时解放中心'],
    principleIds: ['center-control', 'development-order', 'isolated-pawn', 'prophylaxis'],
    whiteTabiyaLine: ['d4', 'd5', 'c4', 'e6'],
    blackStartLine: ['d4', 'd5', 'c4'],
    opponentBook: [
      ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'c6', 'Bd3', 'dxc4', 'Bxc4'],
      ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'cxd5', 'exd5', 'Bg5', 'Be7', 'e3', 'O-O', 'Bd3', 'Nbd7'],
      ['d4', 'd5', 'c4', 'dxc4', 'Nf3', 'Nf6', 'e3', 'e6', 'Bxc4', 'c5', 'O-O', 'a6'],
      ['d4', 'd5', 'c4', 'c6', 'Nf3', 'Nf6', 'Nc3', 'e6', 'Bg5', 'Nbd7', 'e3'],
      ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'd5', 'Bg5', 'Be7', 'e3', 'O-O'],
    ],
    userPlies: 12,
  },
  {
    id: 'french',
    title: '法兰西开局',
    summary: '1.e4 e6：封闭中心、兵链进攻与坏象',
    theme:
      '法兰西练习：白方用空间与王翼/突破施压，黑方用 …c5/…f6 打链。一般对手容易在链条上失误，高级对手会更严谨——练习抓住结构性机会。',
    keyIdeas: ['e5 楔子与保 d4', '…c5 打基础', '好象坏象的处理', '打开线路的时机'],
    principleIds: ['pawn-chain-attack', 'good-bad-bishop', 'center-control', 'prophylaxis'],
    whiteTabiyaLine: ['e4', 'e6', 'd4', 'd5'],
    blackStartLine: ['e4', 'e6', 'd4', 'd5', 'e5'],
    opponentBook: [
      ['e4', 'e6', 'd4', 'd5', 'e5', 'c5', 'c3', 'Nc6', 'Nf3', 'Qb6', 'a3', 'c4', 'Nbd2'],
      ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e5', 'Nfd7', 'Bxe7', 'Qxe7'],
      ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4', 'e5', 'c5', 'a3', 'Bxc3+', 'bxc3'],
      ['e4', 'e6', 'd4', 'd5', 'Nd2', 'Nf6', 'e5', 'Nfd7', 'Bd3', 'c5', 'c3', 'Nc6'],
    ],
    userPlies: 12,
  },
  {
    id: 'ruy-lopez',
    title: '西班牙开局',
    summary: '1.e4 e5 2.Nf3 Nc6 3.Bb5：慢速压力与中心',
    theme:
      '西班牙练习：白方用轻象牵制与 c3-d4 施压，黑方用 …a6/…b5 与中心反击。在两种对手强度下练习计划执行与抓机会。',
    keyIdeas: ['保留西班牙好象', 'c3 支持 d4', 'Nbd2-f1-g3 马道', '黑方 …d5 解放的时机'],
    principleIds: ['development-order', 'center-control', 'prophylaxis', 'king-safety-castling'],
    whiteTabiyaLine: ['e4', 'e5', 'Nf3', 'Nc6'],
    blackStartLine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    opponentBook: [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7', 'Re1', 'b5', 'Bb3', 'd6', 'c3', 'O-O', 'h3', 'Na5', 'Bc2', 'c5'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O', 'f6', 'd4'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6', 'O-O', 'Nxe4', 'd4', 'Nd6', 'Bxc6', 'dxc6', 'dxe5', 'Nf5', 'Qxd8+', 'Kxd8'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'd6', 'd4', 'Bd7', 'Nc3', 'Nf6', 'O-O'],
    ],
    userPlies: 12,
  },
  {
    id: 'italian',
    title: '意大利开局',
    summary: '1.e4 e5 2.Nf3 Nc6 3.Bc4：古典出子与中心',
    theme:
      '意大利练习：双方古典出子，白方可走慢速 c3-d3 或更尖锐的中心。练习在对手软着时扩大优势，在强对手下保持结构与节奏。',
    keyIdeas: ['Bc4 瞄准 f7', 'c3/d3 稳健展开', '及时 O-O', '中心张力：d4 的时机'],
    principleIds: ['development-order', 'center-control', 'king-safety-castling', 'initiative-tempo'],
    whiteTabiyaLine: ['e4', 'e5', 'Nf3', 'Nc6'],
    blackStartLine: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    opponentBook: [
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd3', 'd6', 'O-O', 'O-O', 'Nbd2', 'a6', 'Bb3', 'Ba7'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6', 'O-O', 'd6', 'c3', 'a5', 'Re1'],
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4', 'Bxb4', 'c3', 'Ba5', 'd4', 'exd4', 'O-O'],
    ],
    userPlies: 12,
  },
];

export function openingDrillById(id: string): OpeningDrill | undefined {
  return OPENING_DRILLS.find((d) => d.id === id);
}

/** 解析 drillToLesson 生成的 lesson id；非该格式返回 null（纯字符串解析，不依赖 chess.js） */
export function parseDrillLessonId(id: string): { drillId: string; color: Color; startMode: DrillStartMode } | null {
  const m = /^drill\/(.+)\/(w|b)\/(start|tabiya)$/.exec(id);
  if (!m) return null;
  return { drillId: m[1], color: m[2] as Color, startMode: m[3] === 'start' ? 'from-start' : 'tabiya' };
}
