import { START_FEN } from '../chess/pgn';
import { fenAfter } from './play';
import type { FollowUp, Island } from './types';

const e4 = fenAfter(START_FEN, ['e4']);
const nf3 = fenAfter(START_FEN, ['e4', 'c5', 'Nf3']);
const alapin = fenAfter(START_FEN, ['e4', 'c5', 'c3']);
const nc3 = fenAfter(START_FEN, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3']);
const najdorf = fenAfter(START_FEN, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']);

const whyC5: FollowUp = {
  kind: 'tap',
  prompt: '西西里的 c 兵盯着哪个格子？',
  square: 'd4',
  choices: ['d4', 'e5', 'a4'],
  explainOk: '对，盯 d4。白棋以后最想冲这个格子，再用马占上。走 e5 也能下，可那是对称的开放对局。',
  explainBad: '再看中心。c 兵盯的是 d4，不是再拱 e 兵。',
};

const nf3BookAsk: FollowUp = {
  kind: 'choice',
  prompt: '他走了最常见的马。要是走出后或象呢？',
  options: [
    { id: 'switch', label: '改计划：后瞄 c5，象瞄 f7', correct: true },
    { id: 'same', label: '还是背纳伊道夫，继续等 d4', correct: false },
    { id: 'resign', label: '他不走马我就认了', correct: false },
  ],
  explainOk: '对。Nf3 才是开放西西里的正路。后出来瞄 c5，象出来瞄 f7，都要当场改想法。',
  explainBad: '别死背。他走马，你再等 d4；他走出后或象，计划就变了。',
};

const threeShores: FollowUp = {
  kind: 'choice',
  prompt: '…d6 这条岸，主要是为了什么？',
  options: [
    { id: 'open', label: '准备开放西西里，先拦住 e5', correct: true },
    { id: 'mate', label: '马上将死白王', correct: false },
    { id: 'hide', label: '把兵藏起来不打仗', correct: false },
  ],
  explainOk: '对。…d6 先拦住白棋的 e5，等他冲 d4 再吃。…Nc6 是斯维斯尼科夫那座岛，…e6 是卡恩 / 泰马诺夫，以后再去。',
  explainBad: '…d6 是为了走进开放西西里，不是藏起来，也不是马上将死。',
};

const offBookAsk: FollowUp = {
  kind: 'choice',
  prompt: '他没冲 d4。你觉得他想干什么？',
  options: [
    { id: 'f7', label: '象瞄着 f7，先出子', correct: true },
    { id: 'castle', label: '准备长易位打对攻', correct: false },
    { id: 'same', label: '还是开放西西里，继续背纳伊道夫', correct: false },
  ],
  explainOk: '对。象出来瞄 f7，这是反西西里。别再等一个没有的 d4。e4 也空了，可以盯。',
  explainBad: '他没冲 d4，就不是开放西西里了。象在瞄 f7，中心的 e4 也没人好好保。',
};

const bc4F7Ask: FollowUp = {
  kind: 'choice',
  prompt: '象瞄着 f7。现在能直接吃吗？',
  options: [
    { id: 'no', label: '吃不了，马还在 g8 看着', correct: true },
    { id: 'yes', label: '能白吃，你挡不住', correct: false },
    { id: 'mate', label: '吃了就将死', correct: false },
  ],
  explainOk: '对。现在马还在，象吃 f7 会丢掉。所以你不用慌，先出马盯他空着的 e4。',
  explainBad: '别怕。马还在 g8，象现在吃 f7 是送子。真正空的是他的 e4。',
};

const earlyQueenAsk: FollowUp = {
  kind: 'choice',
  prompt: '后瞄着 c5。为什么还是松的？',
  options: [
    { id: 'early', label: '能吃 c5，可后自己也不安全', correct: true },
    { id: 'take', label: '后吃掉 c5 你就没了，没办法', correct: false },
    { id: 'mate', label: '后马上要将死你', correct: false },
  ],
  explainOk: '对。它确实能吃 c5。可后孤零零的：你一打它就得逃；真吃了，你还能吃回 e4。',
  explainBad: '后能吃 c5，但它自己也不安全。先看好兵，或出马打后。',
};

const qxc5IfNf6: FollowUp = {
  kind: 'choice',
  prompt: '他要是顺势吃掉 c5 呢？',
  options: [
    { id: 'take-e4', label: '你吃 e4，马正好打着后', correct: true },
    { id: 'lost', label: '少一个兵，认了', correct: false },
    { id: 'mate', label: '后吃了就能将死你', correct: false },
  ],
  explainOk: '对。后吃 c5，你就吃 e4，马正好打着后。他白忙。先看好再打后，两条路都能走。',
  explainBad: '别怕少兵。吃他的 e4，后还得再逃。',
};

const qxc5IfNc6: FollowUp = {
  kind: 'choice',
  prompt: '现在后还敢吃 c5 吗？',
  options: [
    { id: 'no', label: '不敢，马看着，吃了会丢后', correct: true },
    { id: 'yes', label: '敢，你挡不住', correct: false },
    { id: 'mate', label: '吃了就将死', correct: false },
  ],
  explainOk: '对。马看着 c5，后吃就要丢掉。下一手还可以出马打后，把他赶回去。',
  explainBad: '马已经看着 c5 了，后吃就是送后。',
};

const looseE4Ask: FollowUp = {
  kind: 'tap',
  prompt: '他没保哪个兵？点出来。',
  square: 'e4',
  choices: ['e4', 'd4', 'h2'],
  explainOk: '对，e4 没人保。马可以盯，空了就能吃。边兵走了也一样，先看中心。',
  explainBad: '看中心：e4 那个兵现在没保护。',
};

const slowD4Ask: FollowUp = {
  kind: 'choice',
  prompt: '他只走了 d3。你还要干等 d4 吗？',
  options: [
    { id: 'develop', label: '不等了，先出马到 f6', correct: true },
    { id: 'wait', label: '继续等他冲 d4', correct: false },
    { id: 'mate', label: '马上将死', correct: false },
  ],
  explainOk: '对。慢一步的 d4，你先出子。e4 有 d3 护着，先盯着就行，别去吃。',
  explainBad: '别干等。他暂时不冲 d4，你就先出马。e4 有兵护着，先盯着。',
};

const afterNxe4Ask: FollowUp = {
  kind: 'choice',
  prompt: '吃了 e4，他用象打马怎么办？',
  options: [
    { id: 'calm', label: '马可以退，或者你也打回来', correct: true },
    { id: 'lost', label: '马没了，认输', correct: false },
    { id: 'mate', label: '他下一步将死你', correct: false },
  ],
  explainOk: '对。吃空兵不是送子。他打马，你退或兑，中心已经赚了。',
  explainBad: '别慌。空兵吃了就是赚。他打马，你再想下一步。',
};

const whyMustTake: FollowUp = {
  kind: 'choice',
  prompt: '他冲了 d4。不吃会怎样？',
  options: [
    { id: 'center', label: '他占中心，你的 c5 也白盯了', correct: true },
    { id: 'safer', label: '不吃更稳，先出子', correct: false },
    { id: 'queen', label: '用后吃更好', correct: false },
  ],
  explainOk: '对。c5 就是为了换这个兵。不吃，他就压过来。后吃太早，会被马赶。用 c 兵吃刚刚好。',
  explainBad: '西西里的约定：他冲 d4，你用 c 兵吃。不吃中心就被占了；后吃则出来太早。',
};

const whyNotQueenTakesD4: FollowUp = {
  kind: 'choice',
  prompt: '为什么他用马吃 d4，不用后吃？',
  options: [
    { id: 'early', label: '后吃会被赶，马站在中心更稳', correct: true },
    { id: 'better', label: '后吃更赚，他走错了', correct: false },
    { id: 'same', label: '后吃马吃都一样', correct: false },
  ],
  explainOk: '对。后站 d4 会被你的马或兵赶。马站在那儿又吃又守，这才是开放西西里。',
  explainBad: '后出来太早。马吃 d4，既占中心，后还藏着。',
};

const alapinAsk: FollowUp = {
  kind: 'choice',
  prompt: '他垫了 c3。以后还会冲 d4 吗？',
  options: [
    { id: 'later', label: '会，想用 c 兵补中心', correct: true },
    { id: 'never', label: '不会了，这辈子不冲 d4', correct: false },
    { id: 'mate', label: '马上将死你', correct: false },
  ],
  explainOk: '对。阿拉平是慢一拍的 d4：先垫 c3，再冲，想用兵补中心。别再背 a6 那套。',
  explainBad: '他还是想冲 d4，只是先垫一只兵。这不是开放西西里，也不是龙式。',
};

const islandSplitAsk: FollowUp = {
  kind: 'choice',
  prompt: '白马保住 e4 了。现在分岛，纳伊道夫走哪？',
  options: [
    { id: 'a6', label: 'a6，挡住 Bb5', correct: true },
    { id: 'g6', label: 'g6，进龙式', correct: false },
    { id: 'nc6', label: 'Nc6，进古典西西里', correct: false },
  ],
  explainOk: '对。三条岛在这儿分开：a6 纳伊道夫，g6 龙式，Nc6 古典。今天只走纳伊道夫。',
  explainBad: '门牌是 a6。g6 是龙，Nc6 是古典，以后再去那两座岛。',
};

const pickA6: FollowUp = {
  kind: 'choice',
  prompt: '纳伊道夫为什么先走 a6？',
  options: [
    { id: 'bb5', label: '挡住白象到 b5 的牵制', correct: true },
    { id: 'rush', label: '马上冲 a 兵到底', correct: false },
    { id: 'castle', label: '好让王走到 a8', correct: false },
  ],
  explainOk: '对。a6 先挡住 Bb5，再决定 …e5 还是 …e6。不走 a6 走 g6，就是龙式，另一座岛。',
  explainBad: 'a6 是为了挡住白象到 b5，不是让王乱跑，也不是马上冲到底。',
};

const e5orE6Ask: FollowUp = {
  kind: 'choice',
  prompt: 'e5 和 e6，差在哪？',
  options: [
    { id: 'style', label: 'e5 赶马更凶，e6 更稳', correct: true },
    { id: 'same', label: '两步完全一样', correct: false },
    { id: 'mate', label: 'e5 马上将死', correct: false },
  ],
  explainOk: '对。e5 把白马从 d4 赶走，对攻味道浓；e6 先把门关好，再出象。两条都对，先定中心再出子。',
  explainBad: '不一样。e5 凶，赶马；e6 稳，先看家。都比乱冲兵强。',
};

const englishFaceAsk: FollowUp = {
  kind: 'choice',
  prompt: '白棋接下来最想做什么？',
  options: [
    { id: 'attack', label: 'f3、Qd2，再长易位攻黑王', correct: true },
    { id: 'trade', label: '把所有子兑光求和', correct: false },
    { id: 'a4', label: '马上冲 a 兵', correct: false },
  ],
  explainOk: '对。Be3、f3、Qd2、长易位，这就是英国式进攻的脸。还有 Be2 平稳、Bg5 尖锐，那是别的岛。',
  explainBad: '白棋想 f3、Qd2、长易位，攻你的王。不是兑光，也不是先冲 a 兵。',
};

export const SICILIAN_ISLAND: Island = {
  id: 'open-najdorf',
  title: '西西里群岛',
  blurb: '你是黑棋。沿着 c5 往岛里走，每一步只记一条思路。',
  levels: [
    {
      kind: 'recognize',
      id: 'sicilian-1',
      title: '为什么走 c5',
      summary: '白棋走了 e4。西西里不对称地抢中心。',
      ideaCard: '不对称地抢中心',
      fen: e4,
      orientation: 'black',
      lastMove: { from: 'e2', to: 'e4' },
      question: '白棋走了 e4。西西里为什么回 c5？',
      options: [
        { id: 'fight', label: '用 c 兵盯 d4，换中心、下不对称', correct: true },
        { id: 'mate', label: '这样能马上将死', correct: false },
        { id: 'e5', label: '其实该走 e5，两边对齐更稳', correct: false },
      ],
      explain: '对。走 e5 也能下，那是对称的开放对局。西西里故意不对称：用边上的 c 兵盯 d4，以后换他的中心兵。',
      highlights: ['c5', 'd4', 'e4'],
      followUp: whyC5,
    },
    {
      kind: 'sail',
      id: 'sicilian-2',
      title: '第一脚：c5',
      summary: '对面走了 e4。走出西西里的第一脚。',
      ideaCard: '他走 e4，我走 c5',
      playerColor: 'b',
      orientation: 'black',
      leadSans: ['e4'],
      steps: [
        {
          correctSans: ['c5'],
          tell: 'c5',
          correct: {
            tone: 'ok',
            say: '对，c5。走 e5 也能下，可那是对齐的下法。西西里用边上的兵换中心。',
            remember: '他走 e4，我走 c5',
            highlights: ['c5', 'd4', 'e4'],
            followUp: whyC5,
          },
          wrong: {
            tone: 'retry',
            say: 'e5 是另一盘棋。西西里第一件事：用 c 兵走到 c5，盯他想冲的 d4。',
            highlights: ['c5'],
          },
          replyBook: 'Nf3',
          replyBookSay: '最常见：马出来，还准备冲 d4。后或象现在没出来，你先记住这条正路。',
          replyBookHighlights: ['f3', 'd4'],
          replyBookFollowUp: nf3BookAsk,
          replyDeviate: [
            {
              san: 'Qh5',
              say: '停。后到了 h5，顺着第 5 横线瞄着你的 c5 兵。',
              highlights: ['h5', 'c5'],
              ask: earlyQueenAsk,
              punishSans: ['Nc6', 'Nf6'],
              punishTell: 'Nc6 看好兵，或 Nf6 打后',
              punishOk: {
                tone: 'ok',
                say: '抓住了。',
                remember: '后瞄 c5，先看好或打后',
                highlights: ['h5', 'c5'],
              },
              punishOkBySan: {
                Nf6: {
                  tone: 'ok',
                  say: '马打后。他要是顺势吃 c5，你就吃 e4，后还得再逃。',
                  remember: '后吃 c5，我就吃 e4',
                  highlights: ['f6', 'h5', 'c5', 'e4'],
                  followUp: qxc5IfNf6,
                },
                Nc6: {
                  tone: 'ok',
                  say: '马看着 c5，后现在吃就要丢后。下一手还可以出马打后。',
                  remember: '先看好 c5，后就吃不到',
                  highlights: ['c6', 'c5', 'h5'],
                  followUp: qxc5IfNc6,
                },
              },
              punishWrong: {
                tone: 'retry',
                say: '两条路：Nc6 看好 c5，或 Nf6 打后。别让后白吃。',
                highlights: ['c5', 'c6', 'f6'],
              },
            },
            {
              san: 'Bc4',
              say: '他没走马，象先出来了。瞄 f7，可 e4 有点空。',
              highlights: ['c4', 'e4', 'f7'],
              ask: offBookAsk,
              punishSans: ['Nf6'],
              punishTell: 'Nf6',
              punishOk: {
                tone: 'ok',
                say: '对，马到 f6 盯 e4。象瞄 f7 吓人，可现在马还在，吃不了。',
                remember: '象出来不保 e4，就盯 e4',
                highlights: ['f6', 'e4', 'f7'],
                followUp: bc4F7Ask,
              },
              punishWrong: {
                tone: 'retry',
                say: '别先去护 f7。惩罚是出马盯 e4。走 Nf6。',
                highlights: ['f6', 'e4'],
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'recognize',
      id: 'sicilian-3',
      title: '三条岸',
      summary: '2.Nf3 之后，…d6、…Nc6、…e6 是三条岸。',
      ideaCard: '三条岸',
      fen: nf3,
      orientation: 'black',
      lastMove: { from: 'g1', to: 'f3' },
      question: '白马跳到 f3。…d6 这条岸，是哪一条？',
      options: [
        { id: 'd6', label: '先拦住 e5，准备开放西西里', correct: true },
        { id: 'nc6', label: '马上出马，斯维斯尼科夫', correct: false },
        { id: 'e6', label: '先走 e6，卡恩 / 泰马诺夫', correct: false },
      ],
      explain: '对。三条岸都能下：…d6 开放西西里，…Nc6 斯维斯尼科夫，…e6 卡恩。今天只走 …d6 这条。',
      highlights: ['d6', 'c5', 'f3'],
      followUp: threeShores,
    },
    {
      kind: 'sail',
      id: 'sicilian-4',
      title: '他冲 d4，我就吃',
      summary: '走出 …d6。他若冲 d4 就吃；他若拐走，就改计划。',
      ideaCard: '他冲 d4，我就吃',
      playerColor: 'b',
      orientation: 'black',
      leadSans: ['e4', 'c5', 'Nf3'],
      steps: [
        {
          correctSans: ['d6'],
          tell: 'd6',
          correct: {
            tone: 'ok',
            say: '对，d6。先拦住 e5，不让白兵冲过来，等他冲 d4。现在不出 Nc6，那是另一座岛。',
            remember: 'd6 先守，再等 d4',
            highlights: ['d6', 'd4'],
          },
          wrong: {
            tone: 'retry',
            say: '这条岸先走 d6。Nc6、e6 以后再去，别急着乱冲。',
            highlights: ['d6'],
          },
          replyBook: 'd4',
          replyBookSay: '他冲 d4 了。c5 就是为了换这个兵。不吃，中心就被他占了。',
          replyBookHighlights: ['d4', 'c5'],
          replyBookFollowUp: whyMustTake,
          replyDeviate: [
            {
              san: 'Bc4',
              say: '停。他没冲 d4，象走到 c4，瞄 f7，e4 有点空。',
              highlights: ['c4', 'e4', 'f7'],
              ask: offBookAsk,
              punishSans: ['Nf6'],
              punishTell: 'Nf6',
              punishOk: {
                tone: 'ok',
                say: '抓住了。马盯 e4。象瞄 f7 吓人，可现在吃不了。',
                remember: '他不冲 d4，我就盯 e4',
                highlights: ['f6', 'e4', 'f7'],
                followUp: bc4F7Ask,
              },
              punishWrong: {
                tone: 'retry',
                say: '别再等 d4。出马走到 f6，盯他的 e 兵。',
                highlights: ['f6', 'e4'],
              },
            },
            {
              san: 'd3',
              say: '他冲得很慢，只走了 d3。以后还能冲 d4，可现在慢一拍，你先出子。',
              highlights: ['d3', 'e4'],
              ask: slowD4Ask,
              punishSans: ['Nf6'],
              punishTell: 'Nf6',
              punishOk: {
                tone: 'done',
                say: '对。他不冲 d4，你照样出马。e4 有 d3 护着，先盯着，别去吃。',
                remember: '他走慢了，就先出马',
                highlights: ['f6', 'e4'],
              },
              punishWrong: {
                tone: 'retry',
                say: '他还没冲过来。先走 Nf6，别干等。',
                highlights: ['f6'],
              },
            },
          ],
        },
        {
          correctSans: ['cxd4'],
          tell: 'cxd4',
          correct: {
            tone: 'ok',
            say: '对，用 c 兵吃。后吃太早，会被赶；不吃，中心就被占了。',
            remember: '他冲 d4，我就吃',
            highlights: ['d4', 'c5'],
            followUp: {
              kind: 'tap',
              prompt: '你刚换掉的是哪个中心格子？',
              square: 'd4',
              choices: ['d4', 'e4', 'f3'],
              explainOk: '对，吃的就是 d4。换来半条开放的 c 线。',
              explainBad: '你吃掉的是 d4 那个兵。',
            },
          },
          wrong: {
            tone: 'retry',
            say: '他冲 d4 了。西西里第一件事：用 c 兵吃它。别用后。',
            highlights: ['c5', 'd4'],
          },
          replyBook: 'Nxd4',
          replyBookSay: '白马站到 d4。后没出来，这样既占中心，后还藏着。开放西西里打开了。',
          replyBookHighlights: ['d4'],
          replyBookFollowUp: whyNotQueenTakesD4,
        },
      ],
    },
    {
      kind: 'recognize',
      id: 'sicilian-5',
      title: '这还是开放西西里吗',
      summary: '先认出反西西里，别继续背主变。',
      ideaCard: '先认出反西西里',
      fen: alapin,
      orientation: 'black',
      lastMove: { from: 'c2', to: 'c3' },
      question: '白棋走了 c3，没走 Nf3。这还是开放西西里吗？',
      options: [
        { id: 'no', label: '不是。这是阿拉平，他想以后再冲 d4', correct: true },
        { id: 'yes', label: '是，继续走纳伊道夫 a6', correct: false },
        { id: 'dragon', label: '是龙式，该走 g6', correct: false },
      ],
      explain: '对。c3 是阿拉平：他还想冲 d4，只是先垫一只兵补中心。别再背 a6，也别走 g6。',
      highlights: ['c3', 'd4', 'c5'],
      followUp: alapinAsk,
    },
    {
      kind: 'sail',
      id: 'sicilian-6',
      title: '换中心，出马',
      summary: '吃掉 d4 之后，马走到 f6 盯 e4。',
      ideaCard: '换中心，出马',
      playerColor: 'b',
      orientation: 'black',
      leadSans: ['e4', 'c5', 'Nf3', 'd6', 'd4'],
      steps: [
        {
          correctSans: ['cxd4'],
          tell: 'cxd4',
          correct: {
            tone: 'ok',
            say: '吃掉。中心换成你的 c 线。后先别出来。',
            highlights: ['d4'],
          },
          wrong: {
            tone: 'retry',
            say: '他冲了 d4，就用 c 兵吃。别用后。',
            highlights: ['c5', 'd4'],
          },
          replyBook: 'Nxd4',
          replyBookSay: '白马站上 d4。下一步出你的马，盯他的 e4。',
          replyBookHighlights: ['d4'],
        },
        {
          correctSans: ['Nf6'],
          tell: 'Nf6',
          correct: {
            tone: 'ok',
            say: '对，马到 f6，盯着 e4。他现在该保这个兵。',
            remember: '换中心，出马',
            highlights: ['f6', 'e4'],
          },
          wrong: {
            tone: 'retry',
            say: '先把马走到 f6，盯他的 e4 兵。别先走 a6，门还没到。',
            highlights: ['f6', 'e4'],
          },
          replyBook: 'Nc3',
          replyBookSay: '白马出来保 e4。岛口到了：下一步才分纳伊道夫、龙式、古典。',
          replyBookHighlights: ['c3', 'e4'],
          replyBookFollowUp: islandSplitAsk,
          replyDeviate: [
            {
              san: 'Be2',
              say: '停。他只把象走到 e2，e4 兵没人保。',
              highlights: ['e4', 'e2'],
              ask: looseE4Ask,
              punishSans: ['Nxe4'],
              punishTell: 'Nxe4',
              punishOk: {
                tone: 'ok',
                say: '抓住了！没保护的兵就吃。他要是用象打马，你再退或兑。',
                remember: '他不保 e4，我就吃 e4',
                highlights: ['e4'],
                followUp: afterNxe4Ask,
              },
              punishWrong: {
                tone: 'retry',
                say: 'e4 是空的。用马吃掉它。',
                highlights: ['f6', 'e4'],
              },
            },
            {
              san: 'a3',
              say: '他走了边兵 a3，中心的 e4 没人看着。',
              highlights: ['a3', 'e4'],
              ask: looseE4Ask,
              punishSans: ['Nxe4'],
              punishTell: 'Nxe4',
              punishOk: {
                tone: 'ok',
                say: '对，吃掉。边兵走了，中心就可以拿。他打马你再想。',
                remember: '他不保 e4，我就吃 e4',
                highlights: ['e4'],
                followUp: afterNxe4Ask,
              },
              punishWrong: {
                tone: 'retry',
                say: '别看 a 线。中心 e4 可以吃。',
                highlights: ['e4'],
              },
            },
          ],
        },
      ],
    },
    {
      kind: 'recognize',
      id: 'sicilian-7',
      title: '纳伊道夫先 a6',
      summary: '5.Nc3 之后，a6、g6、Nc6 是不同的岛。',
      ideaCard: '纳伊道夫先 a6',
      fen: nc3,
      orientation: 'black',
      lastMove: { from: 'b1', to: 'c3' },
      question: '白马到了 c3。纳伊道夫下一步走哪？',
      options: [
        { id: 'a6', label: 'a6，挡住 Bb5', correct: true },
        { id: 'g6', label: 'g6，这是龙式', correct: false },
        { id: 'nc6', label: 'Nc6，这是古典西西里', correct: false },
      ],
      explain: '对。a6 是纳伊道夫的门牌。g6 是龙，Nc6 是古典。三座岛在这儿分开。',
      highlights: ['a6', 'b5'],
      followUp: pickA6,
    },
    {
      kind: 'sail',
      id: 'sicilian-8',
      title: '走进纳伊道夫',
      summary: '走出 a6，挡住白象。',
      ideaCard: '先 a6，挡 Bb5',
      playerColor: 'b',
      orientation: 'black',
      leadSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'],
      steps: [
        {
          correctSans: ['a6'],
          tell: 'a6',
          correct: {
            tone: 'ok',
            say: '对，a6。白象不能到 b5 来烦你了。现在再决定 e5 还是 e6。',
            remember: '先 a6，挡 Bb5',
            highlights: ['a6', 'b5'],
            followUp: pickA6,
          },
          wrong: {
            tone: 'retry',
            say: 'g6 是龙式，Nc6 是古典。纳伊道夫的门牌是 a6。',
            highlights: ['a6'],
          },
          replyBook: 'Be3',
          replyBookSay: '白象到 e3，英国式进攻常见的第一步。还有 Be2 平稳、Bg5 尖锐，那是别的打法。',
          replyBookHighlights: ['e3'],
          replyBookFollowUp: englishFaceAsk,
        },
      ],
    },
    {
      kind: 'boss',
      id: 'sicilian-9',
      title: '岛主：防英国式',
      summary: '他准备 Be3、f3、Qd2。你先把架子搭好。',
      ideaCard: '防英国式进攻的前几步',
      playerColor: 'b',
      orientation: 'black',
      leadSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be3'],
      steps: [
        {
          correctSans: ['e6', 'e5'],
          tell: 'e6 或 e5',
          correct: {
            tone: 'ok',
            say: '好。e5 赶马更凶，e6 更稳。先定中心兵，再出子。',
            remember: '先定中心，再出子',
            highlights: ['e5', 'e6'],
            followUp: e5orE6Ask,
          },
          wrong: {
            tone: 'retry',
            say: '别急着冲兵乱打。先走 e6 或 e5，把中心定住。',
            highlights: ['e6', 'e5'],
          },
          replyBook: 'f3',
          replyBookBySan: { e5: 'Nb3', e6: 'f3' },
          replyBookSay: '他走 f3，护 e4，还准备 Qd2、长易位。记住这张进攻的脸。',
          replyBookSayBySan: {
            e5: '马被赶了，退到 b3。下一步还是 f3、Qd2、长易位，这就是英国式进攻。',
            e6: '他走 f3，护 e4，还准备 Qd2、长易位。记住这张进攻的脸。',
          },
          replyBookHighlights: ['f3', 'd2'],
          replyBookHighlightsBySan: {
            e5: ['b3', 'e5'],
            e6: ['f3', 'd2'],
          },
        },
      ],
    },
    {
      kind: 'boss',
      id: 'sicilian-10',
      title: '潜入白营',
      summary: '这次你执白，看看对方想攻哪。',
      ideaCard: '白棋想攻哪',
      playerColor: 'w',
      orientation: 'white',
      leadSans: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
      steps: [
        {
          correctSans: ['Be3', 'Be2', 'Bg5', 'f3'],
          tell: 'Be3',
          correct: {
            tone: 'ok',
            say: '对。Be3 是英国式的架子。Be2 更稳，Bg5 更尖，今天先认这张脸。',
            remember: '白棋想攻王翼、长易位',
            highlights: ['e3', 'd2'],
            followUp: englishFaceAsk,
          },
          wrong: {
            tone: 'retry',
            say: '先把象走到 e3，摆英国式进攻的架子。也可以 Be2 或 Bg5，那是别的打法。',
            highlights: ['e3'],
          },
          replyBook: 'e5',
          replyBookSay: '黑棋用 e5 赶马，这是凶的应法。e6 则更稳。你已经看见白棋想攻哪了。',
          replyBookHighlights: ['e5', 'd4'],
        },
      ],
    },
  ],
};

export const LATER_ISLANDS: Island[] = [
  { id: 'dragon', title: '龙式岛', blurb: '…g6 那一座。打通第一座再开。', locked: true, levels: [] },
  { id: 'sveshnikov', title: '斯维斯尼科夫岛', blurb: '…Nc6 和 …e5。打通第一座再开。', locked: true, levels: [] },
  { id: 'anti', title: '反西西里岛', blurb: '阿拉平、封闭、莫拉。打通第一座再开。', locked: true, levels: [] },
];

export const najdorfFen = najdorf;
