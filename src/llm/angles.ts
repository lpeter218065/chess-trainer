import type { Quality } from '../chess/quality';

export type Angle = 'tactics' | 'plan' | 'structure' | 'pieces' | 'king' | 'compare' | 'principle' | 'history';

export const ANGLE_LABEL: Record<Angle, string> = {
  tactics: '战术', plan: '计划', structure: '兵形', pieces: '子力',
  king: '王的安全', compare: '对比最佳着法', principle: '棋理', history: '典型例子',
};

/** GPT 在该角度下应该侧重什么，会直接写进 prompt */
export const ANGLE_GUIDE: Record<Angle, string> = {
  tactics: '侧重战术：有没有威胁、牵制、双击、悬子；说明这步为什么安全或不安全，可以引用给出的引擎线路里的具体着法。',
  plan: '侧重计划：这步在服务哪个中期计划，与本课主题的关系，接下来两三步的自然延续是什么。',
  structure: '侧重兵形：这步（或它放弃的选择）对兵结构有什么长远影响，哪些格子因此变强或变弱。',
  pieces: '侧重子力：哪个子因此变好或变坏，交换的得失，谁的子力协调性更好。',
  king: '侧重王的安全：与进攻或防守王有关的判断，王前兵是否松动，哪一方更接近制造威胁。',
  compare: '侧重对比：先直接指出用户这步的问题在哪里，再解释引擎给出的更好着法为什么更好，用给出的线路说明具体后果。',
  principle: '侧重棋理：用两三句专门讲一条给出的棋理——它说了什么、为什么成立、什么时候不成立，再把它和当前局面挂上钩。',
  history: '侧重典型例子：这个结构或局面类型在开局理论或著名对局中的地位。只说你确有把握的内容，不确定就改为讲一般规律。',
};

export interface ChooseParams {
  quality: Quality;
  evalSwing: number; // |evalAfter - evalBefore|
  history: Angle[]; // 之前回合用过的角度，按时间顺序
  random?: () => number;
}

const WEIGHTS: Record<Angle, number> = {
  plan: 3, tactics: 2, structure: 2, pieces: 2, king: 2, principle: 3, history: 1, compare: 0,
};

export function chooseAngle(p: ChooseParams): Angle {
  const random = p.random ?? Math.random;
  if (p.quality === 'blunder' || p.quality === 'mistake') return 'compare';
  if (Math.abs(p.evalSwing) >= 150) return 'tactics';
  const last = p.history[p.history.length - 1];
  const recent = p.history.slice(-3);
  if (p.history.length >= 3 && !recent.includes('principle') && last !== 'principle') return 'principle';

  const weights: Record<Angle, number> = { ...WEIGHTS };
  if (p.quality === 'inaccuracy') weights.compare = 3;
  if (last) weights[last] = 0;
  const entries = (Object.keys(weights) as Angle[]).filter((a) => weights[a] > 0);
  const total = entries.reduce((s, a) => s + weights[a], 0);
  let r = random() * total;
  for (const a of entries) {
    r -= weights[a];
    if (r < 0) return a;
  }
  return entries[entries.length - 1];
}
