import { describe, it, expect } from 'vitest';
import {
  createEmptyTree,
  treeFromSans,
  pathSans,
  pathQualities,
  findChildBySan,
  appendChild,
  pathToNode,
  mainlineIds,
} from '../src/chess/moveTree';

describe('moveTree', () => {
  it('createEmptyTree has no nodes', () => {
    const t = createEmptyTree();
    expect(t.rootChildren).toEqual([]);
    expect(Object.keys(t.nodes)).toEqual([]);
  });

  it('treeFromSans builds a linear mainline', () => {
    const t = treeFromSans(['e4', 'e5', 'Nf3']);
    expect(pathSans(t, mainlineIds(t))).toEqual(['e4', 'e5', 'Nf3']);
    expect(pathQualities(t, mainlineIds(t))).toEqual([null, null, null]);
  });

  it('appendChild under root and under a parent', () => {
    let t = createEmptyTree();
    const { tree: t1, id: e4 } = appendChild(t, null, 'e4', null);
    const { tree: t2, id: e5 } = appendChild(t1, e4, 'e5', 'good');
    expect(pathSans(t2, [e4, e5])).toEqual(['e4', 'e5']);
    expect(t2.nodes[e5].quality).toBe('good');
  });

  it('appendChild adds sibling without replacing mainline', () => {
    let t = treeFromSans(['e4', 'e5', 'Nf3']);
    const e4 = t.rootChildren[0];
    const e5 = t.nodes[e4].children[0];
    const { tree: t2, id: bc4 } = appendChild(t, e5, 'Bc4', null);
    expect(t2.nodes[e5].children).toHaveLength(2);
    expect(t2.nodes[t2.nodes[e5].children[0]].san).toBe('Nf3');
    expect(t2.nodes[bc4].san).toBe('Bc4');
    expect(mainlineIds(t2).map((id) => t2.nodes[id].san)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('findChildBySan finds existing sibling', () => {
    const t = treeFromSans(['e4', 'e5', 'Nf3']);
    const e4 = t.rootChildren[0];
    const e5 = t.nodes[e4].children[0];
    const nf3 = findChildBySan(t, e5, 'Nf3');
    expect(nf3).toBe(t.nodes[e5].children[0]);
    expect(findChildBySan(t, e5, 'Bc4')).toBeNull();
  });

  it('pathToNode returns ancestor chain', () => {
    const t = treeFromSans(['e4', 'e5', 'Nf3']);
    const nf3 = mainlineIds(t)[2];
    expect(pathToNode(t, nf3).map((id) => t.nodes[id].san)).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('pathToNode throws for unknown id', () => {
    const t = createEmptyTree();
    expect(() => pathToNode(t, 'missing')).toThrow();
  });
});
