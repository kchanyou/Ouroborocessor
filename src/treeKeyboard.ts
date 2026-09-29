import type { NodeKind } from "./types";

export type TreeKeyboardItem = {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  depth: number;
  hasChildren: boolean;
};

export type TreeKeyboardAction =
  | { type: "select"; id: string }
  | { type: "expand"; id: string }
  | { type: "collapse"; id: string };

export function treeKeyboardAction(
  items: TreeKeyboardItem[],
  index: number,
  key: string,
  collapsed: ReadonlySet<string>,
): TreeKeyboardAction | null {
  const item = items[index];
  if (!item) return null;
  if (key === "ArrowDown" && index < items.length - 1) return { type: "select", id: items[index + 1].id };
  if (key === "ArrowUp" && index > 0) return { type: "select", id: items[index - 1].id };
  if (key === "Home" && items.length) return { type: "select", id: items[0].id };
  if (key === "End" && items.length) return { type: "select", id: items.at(-1)!.id };
  if (key === "ArrowRight") {
    if (item.kind === "group" && item.hasChildren && collapsed.has(item.id)) return { type: "expand", id: item.id };
    const child = items[index + 1];
    if (item.kind === "group" && child?.depth > item.depth) return { type: "select", id: child.id };
  }
  if (key === "ArrowLeft") {
    if (item.kind === "group" && item.hasChildren && !collapsed.has(item.id)) return { type: "collapse", id: item.id };
    if (item.parentId) return { type: "select", id: item.parentId };
  }
  return null;
}
