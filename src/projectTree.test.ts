import { describe, expect, it } from "vitest";
import { flattenTree } from "./projectTree";
import type { ManuscriptNode } from "./types";

const nodes: ManuscriptNode[] = [
  { id: "part", title: "Part One", kind: "group", parentId: null, content: "", status: "draft", synopsis: "" },
  { id: "chapter", title: "Chapter", kind: "group", parentId: "part", content: "", status: "draft", synopsis: "" },
  { id: "scene", title: "Arrival", kind: "scene", parentId: "chapter", content: "The train arrived.", status: "draft", synopsis: "station" },
  { id: "appendix", title: "Appendix", kind: "scene", parentId: null, content: "Notes", status: "draft", synopsis: "" },
];

describe("flattenTree", () => {
  it("keeps project order and omits descendants of collapsed groups", () => {
    const visible = flattenTree(nodes, new Set(["part"]), "");
    expect(visible.map(({ node, depth }) => [node.id, depth])).toEqual([
      ["part", 0],
      ["appendix", 0],
    ]);
  });

  it("reveals matching descendants and their ancestors while searching", () => {
    const visible = flattenTree(nodes, new Set(["part", "chapter"]), "station");
    expect(visible.map(({ node, depth }) => [node.id, depth])).toEqual([
      ["part", 0],
      ["chapter", 1],
      ["scene", 2],
    ]);
  });
});
