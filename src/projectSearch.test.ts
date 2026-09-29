import { describe, expect, it } from "vitest";
import { editorMatchOffsets, searchProject } from "./projectSearch";
import type { ManuscriptNode } from "./types";
const node = (id: string, content: string, parentId: string | null = null, kind: "scene" | "group" = "scene"): ManuscriptNode => ({ id, content, parentId, kind, title: id, synopsis: "hidden query", status: "draft" });
describe("project body search", () => {
  it("returns tree-ordered scene results, skipping group bodies and notes", () => {
    const nodes = [node("group", "query", null, "group"), node("outside", "query"), node("child", "query query", "group")];
    const result = searchProject(nodes, "query", true);
    expect(result.count).toBe(3); expect(result.scenes).toBe(2);
    expect(result.hits.map((hit) => hit.sceneId)).toEqual(["child", "child", "outside"]);
    expect(searchProject(nodes, "hidden", true).count).toBe(0);
  });
  it("treats regex syntax literally and supports case controls", () => {
    const nodes = [node("one", "Hello hello .* [x]")];
    expect(searchProject(nodes, "hello", false).count).toBe(2);
    expect(searchProject(nodes, "hello", true).count).toBe(1);
    expect(searchProject(nodes, ".*", true).count).toBe(1);
    expect(searchProject(nodes, "[x]", true).count).toBe(1);
  });
  it("uses latest unsaved Unicode bodies and UTF-16 offsets", () => {
    const content = "👨‍👩‍👧‍👦 한국어 日本語 中文 español";
    for (const query of ["한국어", "日本語", "中文", "español", "👨‍👩‍👧‍👦"]) {
      const hit = searchProject([node("one", content)], query, true).hits[0];
      expect(hit.source.slice(hit.start, hit.end)).toBe(query);
    }
  });
  it("caps result allocation but counts all matches and scenes", () => {
    const result = searchProject([node("one", "x".repeat(250)), node("two", "x")], "x", true);
    expect(result.hits).toHaveLength(200); expect(result.count).toBe(251); expect(result.scenes).toBe(2);
  });
  it("handles empty queries, empty manuscripts and no matches", () => {
    expect(searchProject([node("one", "abc")], "", true)).toEqual({ hits: [], count: 0, scenes: 0 });
    expect(searchProject([], "x", false).count).toBe(0);
    expect(searchProject([node("one", "")], "x", true).hits).toEqual([]);
  });
  it("maps CRLF and emoji offsets to textarea positions", () => {
    const content = "👋\r\nfirst\r\n日本語";
    const hit = searchProject([node("one", content)], "日本語", true).hits[0];
    const offsets = editorMatchOffsets(hit);
    expect(content.replace(/\r\n/g, "\n").slice(offsets.start, offsets.end)).toBe("日本語");
  });
});
