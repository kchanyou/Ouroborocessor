import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroupOverview, overviewItems } from "./GroupOverview";
import { localeOptions, translate } from "./i18n";
import type { ManuscriptNode } from "./types";

const node = (id: string, parentId: string | null, kind: "group" | "scene" = "scene"): ManuscriptNode => ({
  id, parentId, kind, title: id, content: "본문", synopsis: "", status: "draft",
});
const nodes = [node("root", null, "group"), node("outside", null), node("first", "root"), node("nested", "root", "group"),
  { ...node("last", "nested"), synopsis: "한국어 日本語 中文 Español <script>text</script>", status: "complete" }];
describe("group overview", () => {
  it("uses tree order and excludes the root and unrelated manuscripts", () => {
    expect(overviewItems(nodes, "root", "", true).map(({ node }) => node.id)).toEqual(["first", "nested", "last"]);
  });
  it("limits the view to direct children when requested", () => {
    expect(overviewItems(nodes, "root", "", false).map(({ node }) => node.id)).toEqual(["first", "nested"]);
  });
  it("searches titles and multilingual notes without searching body text", () => {
    expect(overviewItems(nodes, "root", " ESPAÑOL ", true).map(({ node }) => node.id)).toEqual(["last"]);
    expect(overviewItems(nodes, "root", "FIRST", true)).toHaveLength(1);
    expect(overviewItems(nodes, "root", "본문", true)).toHaveLength(0);
  });
  it("handles empty and unknown groups", () => {
    expect(overviewItems(nodes, "missing", "", true)).toEqual([]);
    expect(overviewItems([nodes[0]], "root", "", true)).toEqual([]);
  });
  it("renders an outline with escaped notes, translated states and scene counts", () => {
    const html = renderToStaticMarkup(<GroupOverview nodes={nodes} group={nodes[0]} locale="en" onSelect={() => {}} onAdd={() => {}} />);
    expect(html).toContain('aria-label="Outliner"');
    expect(html).not.toContain('scene-card');
    expect(html).not.toContain('overview-view');
    expect(html).toContain("Complete");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain(">outside<");
    expect(html).toContain("2 chars");
  });
  it("renders an accessible outline in all five languages", () => {
    for (const { code } of localeOptions) {
      const html = renderToStaticMarkup(<GroupOverview nodes={nodes} group={nodes[0]} locale={code} onSelect={() => {}} onAdd={() => {}} />);
      expect(html).toContain('<th scope="col">');
      expect(html).toContain('<th scope="row">');
      expect(html).toContain(translate(code, "sceneOutline"));
      expect(html).toContain(`${translate(code, "folderCount", { count: 1 })} · ${translate(code, "exportSceneCount", { count: 2 })}`);
    }
  });
});
