import type { ManuscriptNode, NodeKind } from "./types";

export type FlatTreeItem = {
  node: ManuscriptNode;
  depth: number;
  hasChildren: boolean;
};

export type DropPlacement = "before" | "inside" | "after" | "root";
export type TreeDropTarget = { targetId: string | null; placement: DropPlacement };
export type PointerDragState = {
  pointerId: number;
  nodeId: string;
  title: string;
  kind: NodeKind;
  startX: number;
  startY: number;
  active: boolean;
};

export function flattenTree(
  nodes: ManuscriptNode[],
  collapsed: Set<string>,
  query: string,
): FlatTreeItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const included = new Set<string>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, ManuscriptNode[]>();

  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentId, siblings);
  }

  if (normalizedQuery) {
    for (const node of nodes) {
      const searchableText = `${node.title}\n${node.content}\n${node.synopsis}`.toLocaleLowerCase();
      if (!searchableText.includes(normalizedQuery)) continue;
      included.add(node.id);
      let parentId = node.parentId;
      while (parentId) {
        included.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
  }

  const result: FlatTreeItem[] = [];
  function visit(parentId: string | null, depth: number) {
    for (const node of childrenByParent.get(parentId) ?? []) {
      if (normalizedQuery && !included.has(node.id)) continue;
      const hasChildren = childrenByParent.has(node.id);
      result.push({ node, depth, hasChildren });
      if (node.kind === "group" && (!collapsed.has(node.id) || normalizedQuery)) {
        visit(node.id, depth + 1);
      }
    }
  }

  visit(null, 0);
  return result;
}
