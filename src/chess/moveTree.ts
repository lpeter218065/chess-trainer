import type { Quality } from './quality';

export type MoveNodeId = string;

export interface MoveNode {
  id: MoveNodeId;
  san: string;
  quality: Quality | null;
  /** null = virtual root */
  parentId: MoveNodeId | null;
  children: MoveNodeId[];
}

export interface MoveTree {
  rootChildren: MoveNodeId[];
  nodes: Record<MoveNodeId, MoveNode>;
}

let nextId = 1;

/** Test helper: reset id counter */
export function resetMoveTreeIds(start = 1): void {
  nextId = start;
}

/** After hydrating a persisted tree, bump id counter past existing ids */
export function syncMoveTreeIdsFromTree(tree: MoveTree): void {
  let max = 0;
  for (const id of Object.keys(tree.nodes)) {
    const m = /^m(\d+)$/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  if (max >= nextId) nextId = max + 1;
}

function newId(): MoveNodeId {
  return `m${nextId++}`;
}

export function createEmptyTree(): MoveTree {
  return { rootChildren: [], nodes: {} };
}

export function treeFromSans(sans: string[], qualities?: (Quality | null)[]): MoveTree {
  let tree = createEmptyTree();
  let parent: MoveNodeId | null = null;
  const path: MoveNodeId[] = [];
  for (let i = 0; i < sans.length; i++) {
    const { tree: next, id } = appendChild(tree, parent, sans[i], qualities?.[i] ?? null);
    tree = next;
    path.push(id);
    parent = id;
  }
  return tree;
}

export function pathSans(tree: MoveTree, path: MoveNodeId[]): string[] {
  return path.map((id) => tree.nodes[id].san);
}

export function pathQualities(tree: MoveTree, path: MoveNodeId[]): (Quality | null)[] {
  return path.map((id) => tree.nodes[id].quality);
}

export function childrenOf(tree: MoveTree, parentId: MoveNodeId | null): MoveNodeId[] {
  return parentId === null ? tree.rootChildren : tree.nodes[parentId].children;
}

export function findChildBySan(tree: MoveTree, parentId: MoveNodeId | null, san: string): MoveNodeId | null {
  for (const id of childrenOf(tree, parentId)) {
    if (tree.nodes[id].san === san) return id;
  }
  return null;
}

/** Immutable append; returns new tree + new node id */
export function appendChild(
  tree: MoveTree,
  parentId: MoveNodeId | null,
  san: string,
  quality: Quality | null,
): { tree: MoveTree; id: MoveNodeId } {
  const id = newId();
  const node: MoveNode = { id, san, quality, parentId, children: [] };
  const nodes = { ...tree.nodes, [id]: node };
  if (parentId === null) {
    return { tree: { rootChildren: [...tree.rootChildren, id], nodes }, id };
  }
  const parent = tree.nodes[parentId];
  nodes[parentId] = { ...parent, children: [...parent.children, id] };
  return { tree: { rootChildren: tree.rootChildren, nodes }, id };
}

export function setNodeQuality(tree: MoveTree, id: MoveNodeId, quality: Quality | null): MoveTree {
  const node = tree.nodes[id];
  return { ...tree, nodes: { ...tree.nodes, [id]: { ...node, quality } } };
}

export function pathToNode(tree: MoveTree, nodeId: MoveNodeId): MoveNodeId[] {
  const node = tree.nodes[nodeId];
  if (!node) throw new Error(`unknown move node: ${nodeId}`);
  const path: MoveNodeId[] = [];
  let cur: MoveNodeId | null = nodeId;
  while (cur) {
    path.push(cur);
    cur = tree.nodes[cur].parentId;
  }
  path.reverse();
  return path;
}

/** First-child spine from root */
export function mainlineIds(tree: MoveTree): MoveNodeId[] {
  const path: MoveNodeId[] = [];
  let children = tree.rootChildren;
  while (children.length > 0) {
    const id = children[0];
    path.push(id);
    children = tree.nodes[id].children;
  }
  return path;
}
