import type { ManuscriptNode } from "./types";

export function exportScope(nodes: ManuscriptNode[], rootId: string | null): Array<{ node: ManuscriptNode; depth: number }> {
  const children = new Map<string | null, ManuscriptNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node); children.set(node.parentId, siblings);
  }
  const roots = rootId ? nodes.filter((node) => node.id === rootId) : children.get(null) ?? [];
  const stack = [...roots].reverse().map((node) => ({ node, depth: 0 }));
  const result: Array<{ node: ManuscriptNode; depth: number }> = [];
  const seen = new Set<string>();
  while (stack.length) {
    const item = stack.pop()!;
    if (seen.has(item.node.id)) continue;
    seen.add(item.node.id); result.push(item);
    stack.push(...[...(children.get(item.node.id) ?? [])].reverse().map((node) => ({ node, depth: item.depth + 1 })));
  }
  return result;
}
