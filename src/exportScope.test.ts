import { describe, expect, it } from "vitest";
import { exportScope } from "./exportScope";
import type { ManuscriptNode } from "./types";

const node = (id: string, parentId: string | null, kind: "group" | "scene" = "scene"): ManuscriptNode => ({ id, parentId, kind, title: id, content: "", status: "draft", synopsis: "" });
describe("export preview", () => {
  const nodes = [node("group", null, "group"), node("outside", null), node("first", "group"), node("nested", "group", "group"), node("last", "nested")];
  it("shows tree order rather than storage order", () => {
    expect(exportScope(nodes, null).map(({ node }) => node.id)).toEqual(["group", "first", "nested", "last", "outside"]);
  });
  it("limits groups to descendants and scenes to themselves", () => {
    expect(exportScope(nodes, "nested").map(({ node }) => node.id)).toEqual(["nested", "last"]);
    expect(exportScope(nodes, "first")).toHaveLength(1);
    expect(exportScope(nodes, "missing")).toEqual([]);
  });
});
