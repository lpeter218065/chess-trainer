import type { Section } from './schema';

/** 由 src/chess/features.ts 从局面提取的特征；own = 用户方，opp = 引擎方 */
export type FeatureId =
  | 'opening-phase'
  | 'middlegame-phase'
  | 'endgame-phase'
  | 'own-king-uncastled'
  | 'opp-king-uncastled'
  | 'opposite-castling'
  | 'queens-off'
  | 'open-file'
  | 'own-isolated-pawn'
  | 'opp-isolated-pawn'
  | 'own-doubled-pawn'
  | 'opp-doubled-pawn'
  | 'own-passed-pawn'
  | 'opp-passed-pawn'
  | 'own-bishop-pair'
  | 'opp-bishop-pair'
  | 'bishop-vs-knight'
  | 'pawn-endgame'
  | 'rook-endgame'
  | 'locked-center'
  | 'material-up'
  | 'material-down';

export interface Principle {
  id: string;
  name: string;
  phase: Section[];
  statement: string;
  why: string;
  exceptions?: string;
  triggers: FeatureId[];
}

export const PRINCIPLES: Principle[] = [
  { id: 'center-control', name: '中心控制', phase: ['opening', 'middlegame'],
    statement: '占据或控制 d4/e4/d5/e5 四个中心格，是开局阶段最优先的目标之一。',
    why: '中心的子力能同时影响两翼，转移速度快；控制中心的一方还能限制对方子力的出路。',
    exceptions: '超现代开局允许对方先占中心，再用子力从侧翼施压（如王翼印度、格林菲尔德）。',
    triggers: ['opening-phase'] },
  { id: 'development-order', name: '出子顺序', phase: ['opening'],
    statement: '先出马和象，再易位，后用车和后。不要用同一个子走两次，也不要过早出后。',
    why: '每一步都是一个节奏；重复调动一个子等于让对方多走一步。后过早出动会成为对方轻子驱赶的目标。',
    exceptions: '如果对方出现具体失误，可以为战术打破顺序。',
    triggers: ['opening-phase'] },
  { id: 'king-safety-castling', name: '王的安全与易位时机', phase: ['opening', 'middlegame'],
    statement: '中心还没封闭时，尽早易位把王送到安全的角落，并把车连接起来。',
    why: '中心开放后，停在中间的王会成为所有子力的攻击目标；易位同时也让一个车进入战场。',
    exceptions: '中心完全锁死时可以推迟易位，甚至用王翼兵进攻而不易位。',
    triggers: ['own-king-uncastled', 'opp-king-uncastled'] },
  { id: 'open-file-rook', name: '车占开放线', phase: ['middlegame', 'endgame'],
    statement: '车需要开放线或半开放线才能发挥作用；先争夺开放线的一方通常能渗透到第七横线。',
    why: '车是远距离直线子，被兵挡住时价值大打折扣；第七横线上的车能同时攻击对方的兵和王。',
    triggers: ['open-file'] },
  { id: 'outpost', name: '前哨与弱格', phase: ['middlegame'],
    statement: '对方兵无法驱赶的格子叫前哨，放一个马在对方阵地的前哨上常常值一个车的作用。',
    why: '前哨上的子无法被兵赶走，只能用子交换，交换后往往留下更多弱点。',
    triggers: ['middlegame-phase'] },
  { id: 'isolated-pawn', name: '孤立兵：弱点与动力', phase: ['middlegame'],
    statement: '孤立兵是长期弱点，但它也给拥有者带来空间、开放线和子力活动，进攻方要用它的动力换取王翼攻势。',
    why: '孤兵不能靠邻兵保护，只能靠子力守，守的子被牵制在被动位置；反过来孤兵前方的格子是对方的前哨。',
    exceptions: '中局子力多时孤兵的动力占上风；子力换光后它就是单纯的弱点。',
    triggers: ['own-isolated-pawn', 'opp-isolated-pawn'] },
  { id: 'doubled-pawns', name: '叠兵', phase: ['middlegame', 'endgame'],
    statement: '叠兵通常是弱点，因为它们互相挡路、无法互相保护，还会让某条线变成半开放线。',
    why: '两个叠兵的防守能力约等于一个兵，而且它们控制的格子重复。',
    exceptions: '如果叠兵换来了开放线或中心控制，往往是可以接受的代价。',
    triggers: ['own-doubled-pawn', 'opp-doubled-pawn'] },
  { id: 'passed-pawn', name: '通路兵', phase: ['middlegame', 'endgame'],
    statement: '通路兵必须被推进，或者被牢牢封锁；在残局中它经常决定胜负。',
    why: '通路兵前方没有对方兵，只能靠子力挡，每前进一格就绑住对方更多子力。',
    triggers: ['own-passed-pawn', 'opp-passed-pawn'] },
  { id: 'pawn-chain-attack', name: '兵链与进攻方向', phase: ['middlegame'],
    statement: '兵链指向哪一翼，就应该在那一翼进攻；攻击兵链要从它的底部开始。',
    why: '兵链前方是自己控制的空间，后方是弱点；兵链底部一旦被拆掉，整条链就失去支撑。',
    triggers: ['locked-center'] },
  { id: 'bishop-pair', name: '双象', phase: ['middlegame', 'endgame'],
    statement: '在开放的局面里，双象通常优于象马或双马，尤其在残局中。',
    why: '两个象能覆盖所有颜色的格子，并能远距离同时进攻两翼；马需要更多时间调动。',
    exceptions: '封闭局面里马可以跳过兵墙，象则被自己的兵挡住。',
    triggers: ['own-bishop-pair', 'opp-bishop-pair'] },
  { id: 'good-bad-bishop', name: '好象与坏象', phase: ['middlegame', 'endgame'],
    statement: '被自己兵挡住的象是“坏象”，兵不在同色格上的象是“好象”；交换时尽量留好象、换掉对方的好象。',
    why: '象的活动范围完全取决于同色格是否被己方兵占据。',
    triggers: ['bishop-vs-knight', 'locked-center'] },
  { id: 'knight-vs-bishop', name: '马与象的比较', phase: ['middlegame', 'endgame'],
    statement: '封闭局面、兵在一翼时马更好；开放局面、兵分两翼时象更好。',
    why: '马的攻击距离短但不受阻挡；象走得远但需要开放的斜线。',
    triggers: ['bishop-vs-knight'] },
  { id: 'minority-attack', name: '少数兵进攻', phase: ['middlegame'],
    statement: '在卡尔斯巴德兵型里，用 a、b 两个兵推向对方三个兵（b4-b5），目的是制造 c6 弱点，而不是升变。',
    why: '交换后对方会留下一个落后兵或孤兵，白方的车和后能从半开放的 c 线施压。',
    triggers: ['middlegame-phase'] },
  { id: 'trade-when-ahead', name: '优势时简化，劣势时复杂化', phase: ['middlegame', 'endgame'],
    statement: '物质领先时交换子力（但保留兵），劣势时避免交换、保持复杂。',
    why: '子力越少，物质优势的相对比重越大；残局里多一个兵往往就能赢。',
    exceptions: '如果对方有主动权，先化解威胁再谈简化。',
    triggers: ['material-up', 'material-down'] },
  { id: 'attacker-avoids-trades', name: '进攻方避免交换', phase: ['middlegame'],
    statement: '进攻王的一方要保留进攻子力，防守方则应该争取交换，尤其是换掉对方的后。',
    why: '攻王需要足够的子力数量；每一次交换都削弱攻击的火力。',
    triggers: ['opposite-castling'] },
  { id: 'opposite-castling', name: '异侧易位互攻', phase: ['middlegame'],
    statement: '双方王在不同翼时，比拼的是进攻速度：用兵冲击对方王前，不要浪费任何一个节奏去防守。',
    why: '两翼互攻时防守的一步往往赶不上进攻的一步，率先打开对方王前线路的一方获胜。',
    triggers: ['opposite-castling'] },
  { id: 'initiative-tempo', name: '主动权与节奏', phase: ['opening', 'middlegame'],
    statement: '掌握主动权的一方逼迫对方应付威胁；每一步都问自己“这步是不是在逼对方做事”。',
    why: '主动权让对手没有时间执行自己的计划，即使物质不占优也能维持压力。',
    triggers: ['opening-phase', 'middlegame-phase'] },
  { id: 'prophylaxis', name: '预防性思维', phase: ['middlegame', 'endgame'],
    statement: '走棋前先问对方想干什么，用一步把对方最好的计划提前否定掉。',
    why: '大多数中局失误来自只看自己的计划；预防对方的好棋通常比推进自己的计划更有价值。',
    triggers: ['middlegame-phase'] },
  { id: 'queens-off-king-active', name: '后交换后王要主动', phase: ['endgame'],
    statement: '后一旦下了棋盘，王就从被保护的对象变成主动的子力，应该立刻向中心或对方弱兵走去。',
    why: '没有后就几乎没有对王的杀棋威胁，而王在残局里的战斗力约等于一个轻子。',
    triggers: ['queens-off', 'endgame-phase'] },
  { id: 'opposition', name: '对王', phase: ['endgame'],
    statement: '两王在同一直线上隔一格相对时，轮到走的一方“失去对王”。王兵残局里，掌握对王等于掌握关键格。',
    why: '对王决定谁不得不让路；让路的一方通常被迫放弃关键格。',
    triggers: ['pawn-endgame'] },
  { id: 'key-squares', name: '关键格', phase: ['endgame'],
    statement: '单兵的关键格是兵前方两格的三个格子（兵在第五横线以上则是前方一格）；进攻方的王占到任一关键格即可获胜，与谁走无关。',
    why: '王站在关键格时，兵可以在王的护送下一路升变，对方王不可能同时挡住兵和赶走王。',
    triggers: ['pawn-endgame'] },
  { id: 'rook-behind-passed-pawn', name: '车放在通路兵后面', phase: ['endgame'],
    statement: '无论是自己的还是对方的通路兵，车都应该放在它后面（Tarrasch 规则）。',
    why: '兵前进时后面的车活动范围越来越大，前面的车则越来越小。',
    triggers: ['rook-endgame'] },
  { id: 'lucena-bridge', name: 'Lucena：搭桥', phase: ['endgame'],
    statement: '王在兵前、对方王被切断至少一条线时，用车到第四横线“搭桥”，把王从对方车的追击中掩护出来。',
    why: '王离开兵前的格子时会被对方车不断将军，把车放在第四横线上正好能在合适的时候挡住将军。',
    triggers: ['rook-endgame'] },
  { id: 'philidor-sixth-rank', name: 'Philidor：第六横线防御', phase: ['endgame'],
    statement: '守方王守在兵前，把车放在自己的第六横线（从对方看是第三横线）阻止对方王上前；对方兵一旦推到第六横线，车立刻回到底线从后面长将。',
    why: '对方王上不了第六横线就无法组织杀棋威胁；兵推到第六横线后对方王失去了藏身的格子，从背后的将军挡不住。',
    triggers: ['rook-endgame'] },
  { id: 'zugzwang', name: '迫移', phase: ['endgame'],
    statement: '在残局里让对方“走棋反而有害”，用等待着法逼对方自己破坏阵地。',
    why: '子力越少，每一步的代价越明显；很多兵残局和车残局的胜负都取决于谁先没有好棋走。',
    triggers: ['pawn-endgame', 'rook-endgame'] },
  { id: 'rook-mate-box', name: '车杀单王：缩小方框', phase: ['endgame'],
    statement: '用车把对方王限制在一个越来越小的方框里，用自己的王去对王，只在必要时走车。',
    why: '车单独无法杀王，需要王做支点；胡乱将军只会把王赶来赶去而不缩小活动范围。',
    triggers: ['rook-endgame'] },
];

const byId = new Map(PRINCIPLES.map((p) => [p.id, p]));

export function principleById(id: string): Principle {
  const p = byId.get(id);
  if (!p) throw new Error(`未知棋理 id: ${id}`);
  return p;
}
