import { START_FEN } from '../chess/pgn';
import { fenAfter } from './play';
import type { CampaignLevel, FollowUp, Island } from './types';

const d4d5 = fenAfter(START_FEN, ['d4', 'd5']);
const qga = fenAfter(START_FEN, ['d4', 'd5', 'c4', 'dxc4']);
const londonFace = fenAfter(START_FEN, ['d4', 'd5', 'Bf4']);
const londonE3 = fenAfter(START_FEN, ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6']);

const whoGuardsD4: FollowUp = {
  kind: 'tap',
  prompt: '这个中心兵，谁在后面护着？点出来。',
  square: 'd1',
  choices: ['d1', 'e1', 'a2'],
  explainOk: '对，后在 d1 护着。所以 d4 不像 e4 那样，一冲出去就没人看着。',
  explainBad: '看后所在的格子。d 兵一冲，后就护上了。',
};

const twoIslandsAsk: FollowUp = {
  kind: 'choice',
  prompt: '他对齐了。白棋现在两条岛，差在哪？',
  options: [
    { id: 'split', label: 'c4 打 d5 是后翼弃兵；Bf4 是伦敦金字塔', correct: true },
    { id: 'same', label: '两条完全一样', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。c4 献兵打他的中心；Bf4 象先出来，再垫 e3、c3。今天两条都要认得。',
  explainBad: '不一样。c4 是后翼弃兵，Bf4 是伦敦。先认岛，再走路。',
};

const nf6Ask: FollowUp = {
  kind: 'choice',
  prompt: '他没走 d5。现在怎么走？',
  options: [
    { id: 'none', label: '没有兵可吃，先出子或占空间', correct: true },
    { id: 'ghost', label: '还是打 d5，他会补过来', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。没有 d5 可打。出马、出象，或走 c4 占空间，都对。',
  explainBad: '他不出 d5，就没有兵可吃。先出子，也可以走 c4 占格子。',
};

const e5Ask: FollowUp = {
  kind: 'choice',
  prompt: '他送了中心兵。现在能吃吗？',
  options: [
    { id: 'take', label: '能吃，后护着 d4', correct: true },
    { id: 'poison', label: '吃了会丢掉后', correct: false },
    { id: 'mate', label: '吃了就将死', correct: false },
  ],
  explainOk: '对。e5 没人好好保。你的 d 兵吃，后还看着。',
  explainBad: '不是送后。d 兵吃 e5，后在后面护着。',
};

const tookC4Ask: FollowUp = {
  kind: 'choice',
  prompt: '他吃了 c4。你少兵了吗？',
  options: [
    { id: 'no', label: '不是真弃。垫 e3，回头用象吃回来', correct: true },
    { id: 'lost', label: '少一个兵，认了', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。献 c 兵是为了换中心。他吃了，你垫 e3，象就能吃回来。',
  explainBad: '别怕少兵。垫 e3，象从 f1 吃回 c4，中心还是你的。',
};

const slavAsk: FollowUp = {
  kind: 'choice',
  prompt: '他用 c6 护着 d5。现在能白吃 d5 吗？',
  options: [
    { id: 'no', label: '吃不了，c6 护着', correct: true },
    { id: 'yes', label: '能白吃', correct: false },
    { id: 'mate', label: '吃了就将死', correct: false },
  ],
  explainOk: '对。这是斯拉夫：c 兵护中心。别硬吃，先出马。',
  explainBad: 'c6 护着 d5。不是白吃。先出子。',
};

const stillThereAsk: FollowUp = {
  kind: 'choice',
  prompt: '他垫了 e6。c 兵还在吗？',
  options: [
    { id: 'yes', label: '还在。他不吃，你就压中心', correct: true },
    { id: 'lost', label: '少了 c 兵，认了', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。他不吃，兵还在。你继续出马压中心。',
  explainBad: '他没吃 c4，兵还在。这不是真的少兵。',
};

const recaptureTap: FollowUp = {
  kind: 'tap',
  prompt: '想把象吃回 c4，先垫哪只兵？点出来。',
  square: 'e3',
  choices: ['e3', 'a3', 'h4'],
  explainOk: '对，垫 e3。象从 f1 就能吃回 c4，中心还是你的。',
  explainBad: '垫 e3。别冲边兵。象要走这条路回家。',
};

const developAsk: FollowUp = {
  kind: 'choice',
  prompt: '他出马了。下一步想干什么？',
  options: [
    { id: 'develop', label: '继续出子，马或象出来', correct: true },
    { id: 'rush', label: '马上冲 e4 打开王门', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。先出子。e4 是以后的事，现在王还在中间。',
  explainBad: '别急着冲 e4。马和象还没出来，王门先别开。',
};

const tarraschAsk: FollowUp = {
  kind: 'choice',
  prompt: '他打 c5。中心要开了。你怎么办？',
  options: [
    { id: 'hold', label: '可以换，也可以继续出子护中心', correct: true },
    { id: 'run', label: '把 d4 送掉跑了', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。这是塔拉什。中心会打开，你出子、护 d4，或按时换。',
  explainBad: '别送 d4。可以换，也可以出子护着。',
};

const londonOrGambit: FollowUp = {
  kind: 'choice',
  prompt: '伦敦的金字塔，要垫哪两只兵？',
  options: [
    { id: 'pyramid', label: 'e3 和 c3，护 d4，象已经在外面', correct: true },
    { id: 'edge', label: 'a4 和 h4，冲边', correct: false },
    { id: 'none', label: '不垫兵，象自己能飞', correct: false },
  ],
  explainOk: '对。e3、c3 护 d4，f4 象在金字塔尖上。',
  explainBad: '垫 e3 和 c3。边兵不是这座岛的路。',
};

const c5VsLondon: FollowUp = {
  kind: 'choice',
  prompt: '他打 c5。d4 兵怎么办？',
  options: [
    { id: 'guard', label: '用 c 兵或 e 兵护着', correct: true },
    { id: 'gift', label: '送掉，反正有后', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。金字塔就是为了护 d4。垫 c3 或 e3。',
  explainBad: '别送。c3 或 e3 护着，这就是金字塔。',
};

const missingC3: FollowUp = {
  kind: 'choice',
  prompt: '金字塔还缺哪只兵？',
  options: [
    { id: 'c3', label: 'c3，护 d4', correct: true },
    { id: 'a3', label: 'a3，防后面的马', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。c3 补上，d4 就稳了。这是伦敦的脸。',
  explainBad: '缺的是 c3。护中心，不是边兵。',
};

const guardD5Ask: FollowUp = {
  kind: 'choice',
  prompt: '他打 c4。你的 d5 怎么护？',
  options: [
    { id: 'pad', label: 'e6 或 c6，先护住', correct: true },
    { id: 'gift', label: '随便送', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。e6 是后翼弃兵拒绝，c6 是斯拉夫。先护中心。',
  explainBad: '别送。垫 e6 或 c6。',
};

const londonFaceAsk: FollowUp = {
  kind: 'choice',
  prompt: '象到 f4 了。你还要硬冲 c4 吗？',
  options: [
    { id: 'develop', label: '先出子。这是伦敦，不是弃兵', correct: true },
    { id: 'c4', label: '还是走 c4，两座岛一起走', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。他走伦敦。你出马、出象，别对着金字塔乱冲 c4。',
  explainBad: '这不是后翼弃兵。象已经出来了，你先出子。',
};

export const QUEEN_PAWN_ISLAND: Island = {
  id: 'queen-pawn',
  title: '后兵群岛',
  blurb: '你是白棋。沿着 d4 往岛里走，每一步只记一条思路。',
  levels: [
    {
      kind: 'recognize',
      id: 'qp-1',
      title: '为什么走 d4',
      summary: '后兵开局第一步。后护着中心兵。',
      ideaCard: '后护着中心兵',
      fen: START_FEN,
      orientation: 'white',
      lastMove: null,
      question: '后兵开局第一步，为什么走 d4？',
      options: [
        { id: 'guard', label: '走 d4 占中心，后在 d1 护着它', correct: true },
        { id: 'mate', label: '这样能马上将死', correct: false },
        { id: 'e4', label: '其实该走 e4，打开王门更凶', correct: false },
      ],
      explain: '对。走 e4 也能下，那是王兵开局。d4 占中心，后在后面护着，王门先不开。',
      highlights: ['d4', 'd1'],
      followUp: whoGuardsD4,
    },
    {
      kind: 'sail',
      id: 'qp-2',
      title: '第一脚：d4',
      summary: '走出后兵开局的第一脚。',
      ideaCard: '他走 d5，我对齐占中心',
      playerColor: 'w',
      orientation: 'white',
      leadSans: [],
      steps: [
        {
          correctSans: ['d4'],
          tell: 'd4',
          correct: {
            tone: 'ok',
            say: '对，d4。走 e4 也能下，可那是王兵开局。后兵用后护着中心。',
            remember: '后护着中心兵',
            highlights: ['d4', 'd1'],
            followUp: whoGuardsD4,
          },
          wrong: {
            tone: 'retry',
            say: 'e4 是另一盘棋。后兵第一件事：把 d 兵走到 d4。',
            highlights: ['d4'],
          },
          replyBook: 'd5',
          replyBookSay: '最常见：他对齐占中心。c 兵还没动，你先记住这条正路。',
          replyBookHighlights: ['d5', 'd4'],
          replyBookFollowUp: twoIslandsAsk,
          replyDeviate: [
            {
              san: 'Nf6',
              say: '停。他不出兵，先出马。这是印度防御。',
              highlights: ['f6', 'd4'],
              ask: nf6Ask,
              punishSans: ['Bf4', 'Nf3', 'c4'],
              punishTell: 'Bf4 出象，或 Nf3 出马',
              punishOk: {
                tone: 'ok',
                say: '抓住了。没有 d5 可打，就先出子。',
                remember: '他不出 d5，我先出子',
                highlights: ['f6', 'd4'],
              },
              punishOkBySan: {
                Bf4: {
                  tone: 'ok',
                  say: '象到 f4。没有 d5，伦敦这套仍然能走。',
                  remember: '他不出 d5，我先出子',
                  highlights: ['f4', 'f6'],
                },
                Nf3: {
                  tone: 'ok',
                  say: '马出来。先占中心格子，再看他怎么走。',
                  remember: '他不出 d5，我先出子',
                  highlights: ['f3', 'f6'],
                },
                c4: {
                  tone: 'ok',
                  say: 'c4 现在不打兵，是占空间。也可以，先记住出子更稳。',
                  remember: '他不出 d5，我先出子',
                  highlights: ['c4', 'f6'],
                },
              },
              punishWrong: {
                tone: 'retry',
                say: '没有 d5 可打。出象到 f4，出马到 f3，或走 c4 占空间。',
                highlights: ['f4', 'f3', 'c4'],
              },
            },
            {
              san: 'e5',
              say: '停。他送了 e 兵。后护着你的 d4，可以吃。',
              highlights: ['e5', 'd4', 'd1'],
              ask: e5Ask,
              punishSans: ['dxe5'],
              punishTell: 'dxe5',
              punishOk: {
                tone: 'ok',
                say: '抓住了。送过来的中心兵就吃。',
                remember: '他送中心兵，我就吃',
                highlights: ['e5'],
              },
              punishWrong: {
                tone: 'retry',
                say: 'e5 是空的。用 d 兵吃掉它。',
                highlights: ['d4', 'e5'],
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'recognize',
      id: 'qp-3',
      title: '三条岸',
      summary: '1.d4 之后，…d5、…Nf6、…f5 是三条岸。',
      ideaCard: '对齐占中心是第一条岸',
      fen: d4d5,
      orientation: 'white',
      lastMove: { from: 'd7', to: 'd5' },
      question: '黑棋走了 d5。这是哪一条岸？',
      options: [
        { id: 'd5', label: '对齐占中心，准备后翼弃兵或伦敦', correct: true },
        { id: 'nf6', label: '印度防御，先出马', correct: false },
        { id: 'f5', label: '荷兰，走 f5', correct: false },
      ],
      explain: '对。三条岸都能下：…d5 对齐，…Nf6 印度，…f5 荷兰。今天只走 …d5 这条。',
      highlights: ['d5', 'd4'],
      followUp: twoIslandsAsk,
    },
    {
      kind: 'sail',
      id: 'qp-4',
      title: '献 c 兵',
      summary: '走 c4，打他的 d5。不是真的送兵。',
      ideaCard: '用 c 兵打 d5',
      playerColor: 'w',
      orientation: 'white',
      leadSans: ['d4', 'd5'],
      steps: [
        {
          correctSans: ['c4'],
          tell: 'c4',
          correct: {
            tone: 'ok',
            say: '对，c4。Bf4 是伦敦，另一座岛。这条岛用 c 兵打他的中心。',
            remember: '用 c 兵打 d5',
            highlights: ['c4', 'd5'],
          },
          wrong: {
            tone: 'retry',
            say: '这条岛先走 c4。Bf4 是伦敦，以后再去。',
            highlights: ['c4'],
          },
          replyBook: 'e6',
          replyBookSay: '他垫了 e6。不吃你的 c 兵。兵还在，你继续压中心。',
          replyBookHighlights: ['e6', 'c4', 'd5'],
          replyBookFollowUp: stillThereAsk,
          replyDeviate: [
            {
              san: 'dxc4',
              say: '他吃了。不是白送。下一步夺回中心。',
              highlights: ['c4', 'e3'],
              ask: tookC4Ask,
              punishSans: ['e3', 'e4', 'Nf3'],
              punishTell: 'e3，让象吃回 c4',
              punishOk: {
                tone: 'ok',
                say: '抓住了。垫上就能把象吃回来。',
                remember: '他吃 c4，我垫 e3 吃回来',
                highlights: ['e3', 'c4'],
              },
              punishOkBySan: {
                e3: {
                  tone: 'ok',
                  say: '垫 e3。象从 f1 就能吃回 c4。',
                  remember: '他吃 c4，我垫 e3 吃回来',
                  highlights: ['e3', 'f1', 'c4'],
                  followUp: recaptureTap,
                },
                e4: {
                  tone: 'ok',
                  say: '冲 e4 更凶，中心两个兵。回头也要吃回 c4。',
                  remember: '他吃 c4，我垫兵吃回来',
                  highlights: ['e4', 'c4'],
                },
                Nf3: {
                  tone: 'ok',
                  say: '先出马也行，回头还是要垫 e3 把象吃回来。',
                  remember: '他吃 c4，我垫 e3 吃回来',
                  highlights: ['f3', 'c4'],
                },
              },
              punishWrong: {
                tone: 'retry',
                say: '别急着乱吃。先垫 e3，象才能回家。',
                highlights: ['e3', 'c4'],
              },
            },
            {
              san: 'c6',
              say: '他用 c 兵护 d5。这是斯拉夫。护得很稳。',
              highlights: ['c6', 'd5'],
              ask: slavAsk,
              punishSans: ['Nc3', 'Nf3'],
              punishTell: 'Nc3 或 Nf3',
              punishOk: {
                tone: 'ok',
                say: '对，先出马。别硬吃他护着的兵。',
                remember: '他护 d5，我先出马',
                highlights: ['c6', 'd5'],
              },
              punishWrong: {
                tone: 'retry',
                say: '吃不了 d5。出马到 c3 或 f3。',
                highlights: ['c3', 'f3'],
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'recognize',
      id: 'qp-5',
      title: '他还是吃了吗',
      summary: '先认出：献 c 兵不是真的少兵。',
      ideaCard: '献 c 兵不是真弃',
      fen: qga,
      orientation: 'white',
      lastMove: { from: 'd5', to: 'c4' },
      question: '他吃了 c4。白棋少兵了吗？',
      options: [
        { id: 'no', label: '不是真弃。垫 e3，回头用象吃回来', correct: true },
        { id: 'yes', label: '少一个兵，认了', correct: false },
        { id: 'mate', label: '马上将死', correct: false },
      ],
      explain: '对。后翼弃兵的约定：他吃了，你垫 e3，象吃回 c4。d4 还在，不是真的少兵。',
      highlights: ['c4', 'e3', 'd4'],
      followUp: recaptureTap,
    },
    {
      kind: 'sail',
      id: 'qp-6',
      title: '他垫 e6，出马',
      summary: '兵还在。出马压中心。',
      ideaCard: '他不吃，我就出马压中心',
      playerColor: 'w',
      orientation: 'white',
      leadSans: ['d4', 'd5', 'c4', 'e6'],
      steps: [
        {
          correctSans: ['Nc3', 'Nf3'],
          tell: 'Nc3',
          correct: {
            tone: 'ok',
            say: '对，出马。中心要压住，别急着冲 e4。',
            remember: '他不吃，我就出马压中心',
            highlights: ['c3', 'd5', 'c4'],
          },
          wrong: {
            tone: 'retry',
            say: '先把马走到 c3 或 f3。别乱冲边兵。',
            highlights: ['c3', 'f3'],
          },
          replyBook: 'Nf6',
          replyBookSay: '他出马了。下一步还是出子，马或象出来。',
          replyBookHighlights: ['f6', 'd4'],
          replyBookFollowUp: developAsk,
          replyDeviate: [
            {
              san: 'c5',
              say: '停。他打 c5。中心要开了。这是塔拉什。',
              highlights: ['c5', 'd4'],
              ask: tarraschAsk,
              punishSans: ['cxd5', 'e3'],
              punishTell: 'cxd5 换掉，或 e3 护中心',
              punishOk: {
                tone: 'ok',
                say: '抓住了。中心打开也不慌，出子或按时换。',
                remember: '他打 c5，我护中心或换',
                highlights: ['c5', 'd4'],
              },
              punishWrong: {
                tone: 'retry',
                say: '别送 d4。吃掉 d5 换中心，或垫 e3 护着。',
                highlights: ['d4', 'c5'],
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'recognize',
      id: 'qp-7',
      title: '伦敦还是弃兵',
      summary: '象先出来，就不是后翼弃兵了。',
      ideaCard: 'Bf4 是伦敦，不是弃兵',
      fen: londonFace,
      orientation: 'white',
      lastMove: { from: 'c1', to: 'f4' },
      question: '白棋走了 Bf4。这还是后翼弃兵吗？',
      options: [
        { id: 'no', label: '不是。这是伦敦，象先出来搭金字塔', correct: true },
        { id: 'yes', label: '是，继续走 c4', correct: false },
        { id: 'sicilian', label: '是西西里，该走 c5', correct: false },
      ],
      explain: '对。Bf4 是伦敦：象站好，再垫 e3、c3。别再背 c4 那套。',
      highlights: ['f4', 'd4', 'e3'],
      followUp: londonOrGambit,
    },
    {
      kind: 'sail',
      id: 'qp-8',
      title: '伦敦金字塔',
      summary: '象到 f4，再垫 e3。',
      ideaCard: '象先出来，再垫 e3',
      playerColor: 'w',
      orientation: 'white',
      leadSans: ['d4', 'd5'],
      steps: [
        {
          correctSans: ['Bf4'],
          tell: 'Bf4',
          correct: {
            tone: 'ok',
            say: '对，象到 f4。c4 是后翼弃兵，另一座岛。',
            remember: '象先出来，再垫 e3',
            highlights: ['f4', 'd4'],
          },
          wrong: {
            tone: 'retry',
            say: '这条岛走 Bf4。c4 是后翼弃兵，别走混了。',
            highlights: ['f4'],
          },
          replyBook: 'Nf6',
          replyBookSay: '他出马。下一步垫 e3，把金字塔的腰搭上。',
          replyBookHighlights: ['f6', 'e3'],
          replyDeviate: [
            {
              san: 'c5',
              say: '他马上打 c5。金字塔还是要搭，先护 d4。',
              highlights: ['c5', 'd4'],
              ask: c5VsLondon,
              punishSans: ['e3', 'c3'],
              punishTell: 'e3 或 c3',
              punishOk: {
                tone: 'ok',
                say: '对，先护中心。伦敦不怕 …c5，垫上就稳。',
                remember: '他打 c5，我垫兵护 d4',
                highlights: ['d4', 'c5'],
              },
              punishWrong: {
                tone: 'retry',
                say: '别送 d4。垫 e3 或 c3。',
                highlights: ['e3', 'c3'],
              },
            },
          ],
        },
        {
          correctSans: ['e3'],
          tell: 'e3',
          correct: {
            tone: 'ok',
            say: '对，e3。腰有了。回头再垫 c3，金字塔就完整。',
            remember: '象先出来，再垫 e3',
            highlights: ['e3', 'f4', 'd4'],
          },
          wrong: {
            tone: 'retry',
            say: '先垫 e3。让象待在 f4，别急着乱冲。',
            highlights: ['e3'],
          },
          replyBook: 'e6',
          replyBookSay: '他垫 e6。金字塔还缺 c3。记住这张脸。',
          replyBookHighlights: ['e6', 'c3', 'd4'],
          replyBookFollowUp: missingC3,
          replyDeviate: [
            {
              san: 'c5',
              say: '他又打 c5。缺的还是 c3，把 d4 护上。',
              highlights: ['c5', 'd4', 'c3'],
              ask: c5VsLondon,
              punishSans: ['c3'],
              punishTell: 'c3',
              punishOk: {
                tone: 'ok',
                say: 'c3 补上。这就是伦敦的脸。',
                remember: '金字塔：d4、Bf4、e3、c3',
                highlights: ['c3', 'd4'],
              },
              punishWrong: {
                tone: 'retry',
                say: '垫 c3，护 d4。',
                highlights: ['c3'],
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'boss',
      id: 'qp-9',
      title: '岛主：认出伦敦的脸',
      summary: '金字塔搭好前两层。下一步出子。',
      ideaCard: '金字塔：d4、Bf4、e3、c3',
      playerColor: 'w',
      orientation: 'white',
      leadSans: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6'],
      steps: [
        {
          correctSans: ['Nf3', 'c3', 'Nd2', 'Bd3'],
          tell: 'Nf3',
          correct: {
            tone: 'ok',
            say: '好。出子或垫 c3，都是伦敦的路。',
            remember: '金字塔：d4、Bf4、e3、c3',
            highlights: ['f3', 'f4', 'd4'],
          },
          wrong: {
            tone: 'retry',
            say: '先出马到 f3，或垫 c3。别乱冲边兵。',
            highlights: ['f3', 'c3'],
          },
          replyBook: 'c5',
          replyBookSay: '他打 c5。伦敦最稳的垫法是 c3，把金字塔补上。',
          replyBookHighlights: ['c5', 'c3', 'd4'],
          replyBookFollowUp: missingC3,
        },
      ],
    },
    {
      kind: 'boss',
      id: 'qp-10',
      title: '潜入黑营',
      summary: '这次你执黑，看看后兵开局长什么样。',
      ideaCard: '对齐占中心，再护 d5',
      playerColor: 'b',
      orientation: 'black',
      leadSans: ['d4'],
      steps: [
        {
          correctSans: ['d5'],
          tell: 'd5',
          correct: {
            tone: 'ok',
            say: '对，d5。今天走对齐这条岸。Nf6 是印度，另一座岛。',
            remember: '对齐占中心，再护 d5',
            highlights: ['d5', 'd4'],
          },
          wrong: {
            tone: 'retry',
            say: '今天走 d5 对齐。e5 是送兵，Nf6 是另一座岛。',
            highlights: ['d5'],
          },
          replyBook: 'c4',
          replyBookSay: '他献 c 兵打你。先护 d5，别慌。',
          replyBookHighlights: ['c4', 'd5'],
          replyBookFollowUp: guardD5Ask,
          replyDeviate: [
            {
              san: 'Bf4',
              say: '他走伦敦。象到 f4，金字塔要来了。',
              highlights: ['f4', 'd5'],
              ask: londonFaceAsk,
              punishSans: ['Nf6', 'e6', 'Bf5'],
              punishTell: 'Nf6 出马，或 e6 关门',
              punishOk: {
                tone: 'ok',
                say: '对，先出子。这是伦敦，不是弃兵。',
                remember: '他对伦敦，我先出子',
                highlights: ['f4', 'd5'],
              },
              punishWrong: {
                tone: 'retry',
                say: '先出马到 f6，或垫 e6。别乱冲。',
                highlights: ['f6', 'e6'],
              },
            },
          ],
        },
      ],
    },
  ] satisfies CampaignLevel[],
};

export const QUEEN_PAWN_LATER: Island[] = [
  { id: 'indian', title: '印度群岛', blurb: '…Nf6 那一座。打通第一座再开。', locked: true, levels: [] },
  { id: 'dutch', title: '荷兰岛', blurb: '…f5。打通第一座再开。', locked: true, levels: [] },
  { id: 'slav', title: '斯拉夫岛', blurb: '…c6 护 d5。打通第一座再开。', locked: true, levels: [] },
];

export const londonE3Fen = londonE3;
