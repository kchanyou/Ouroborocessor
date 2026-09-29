import { describe, expect, it } from "vitest";
import { treeKeyboardAction, type TreeKeyboardItem } from "./treeKeyboard";

const items: TreeKeyboardItem[] = [
  { id: "group", parentId: null, kind: "group", depth: 0, hasChildren: true },
  { id: "child", parentId: "group", kind: "scene", depth: 1, hasChildren: false },
  { id: "outside", parentId: null, kind: "scene", depth: 0, hasChildren: false },
];

describe("tree keyboard navigation", () => {
  it("moves through visible items and supports Home and End", () => {
    const open = new Set<string>();
    expect(treeKeyboardAction(items, 0, "ArrowDown", open)).toEqual({ type: "select", id: "child" });
    expect(treeKeyboardAction(items, 2, "ArrowUp", open)).toEqual({ type: "select", id: "child" });
    expect(treeKeyboardAction(items, 1, "Home", open)).toEqual({ type: "select", id: "group" });
    expect(treeKeyboardAction(items, 1, "End", open)).toEqual({ type: "select", id: "outside" });
  });

  it("expands, enters, collapses, and returns to a parent", () => {
    expect(treeKeyboardAction([items[0], items[2]], 0, "ArrowRight", new Set(["group"]))).toEqual({ type: "expand", id: "group" });
    expect(treeKeyboardAction(items, 0, "ArrowRight", new Set())).toEqual({ type: "select", id: "child" });
    expect(treeKeyboardAction(items, 0, "ArrowLeft", new Set())).toEqual({ type: "collapse", id: "group" });
    expect(treeKeyboardAction(items, 1, "ArrowLeft", new Set())).toEqual({ type: "select", id: "group" });
  });

  it("does nothing at boundaries or for unrelated keys", () => {
    expect(treeKeyboardAction(items, 0, "ArrowUp", new Set())).toBeNull();
    expect(treeKeyboardAction(items, 2, "ArrowDown", new Set())).toBeNull();
    expect(treeKeyboardAction(items, 1, "Enter", new Set())).toBeNull();
  });
});
