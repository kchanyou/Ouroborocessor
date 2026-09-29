import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { previewProjectReplacement, replacementSelectionSummary, validateBatchSnapshot } from "./projectReplace";
import { ProjectReplacePreview } from "./ProjectReplacePreview";
import { localeOptions, translate } from "./i18n";
import type { ManuscriptNode } from "./types";

const node = (id: string, content: string, parentId: string | null = null, kind: "scene" | "group" = "scene"): ManuscriptNode => ({
  id, content, parentId, kind, title: id, synopsis: "hello", status: "draft",
});
describe("project replacement preview", () => {
  it("rejects stale, duplicate, missing and empty batch snapshots", () => {
    const nodes = [node("one", "newer")];
    expect(() => validateBatchSnapshot(nodes, [{ sceneId: "one", before: "old", after: "replacement" }])).toThrow("SEARCH_STALE");
    const change = { sceneId: "one", before: "newer", after: "replacement" };
    expect(() => validateBatchSnapshot(nodes, [change])).not.toThrow();
    expect(() => validateBatchSnapshot(nodes, [change, change])).toThrow();
    expect(() => validateBatchSnapshot([], [change])).toThrow();
    expect(() => validateBatchSnapshot(nodes, [])).toThrow("BATCH_EMPTY");
  });
  it("shows actual-save guidance only when an apply handler is connected", () => {
    const html = renderToStaticMarkup(<ProjectReplacePreview nodes={[]} locale="en" onApply={async () => {}} onUndo={async () => {}} canUndo busy />);
    expect(html).toContain(translate("en", "batchHelp"));
    expect(html).toContain('fieldset disabled=""');
    expect(html).toContain(translate("en", "batchUndo"));
  });
  it("uses tree order and excludes group bodies and notes", () => {
    const nodes = [node("group", "hello", null, "group"), node("outside", "hello"), node("nested", "hello hello", "group"), node("empty", "")];
    const preview = previewProjectReplacement(nodes, "hello", "hi", true);
    expect(preview.map((item) => item.sceneId)).toEqual(["nested", "outside"]);
    expect(preview.map((item) => item.count)).toEqual([2, 1]);
  });
  it("treats query and replacement syntax literally", () => {
    expect(previewProjectReplacement([node("one", ".* .*")], ".*", "$&", true)[0].after).toBe("$& $&");
  });
  it("supports empty replacements, case controls and multiline Unicode", () => {
    const nodes = [node("one", "Hello hello\r\n日本語 中文 한국어")];
    expect(previewProjectReplacement(nodes, "hello", "", false)[0].after).toBe(" \r\n日本語 中文 한국어");
    expect(previewProjectReplacement(nodes, "hello", "Hola", true)[0].after).toContain("Hello Hola");
    expect(previewProjectReplacement(nodes, "日本語 中文", "español 👋", true)[0].after).toContain("español 👋 한국어");
  });
  it("does not truncate actual previews at the search display cap", () => {
    const item = previewProjectReplacement([node("one", "x".repeat(250))], "x", "y", true)[0];
    expect(item.count).toBe(250); expect(item.after).toBe("y".repeat(250)); expect(item.examples).toHaveLength(5);
  });
  it("does not create no-op changes or mutate source manuscripts", () => {
    const source = Object.freeze(node("one", "hello"));
    expect(previewProjectReplacement([source], "", "x", false)).toEqual([]);
    expect(previewProjectReplacement([source], "hello", "hello", true)).toEqual([]);
    expect(previewProjectReplacement([source], "missing", "x", false)).toEqual([]);
    previewProjectReplacement([source], "hello", "hi", true);
    expect(source.content).toBe("hello"); expect(source.synopsis).toBe("hello");
  });
  it("counts only selected scenes and ignores unknown ids", () => {
    const preview = previewProjectReplacement([node("one", "x x"), node("two", "x")], "x", "y", true);
    expect(replacementSelectionSummary(preview, new Set(["one", "unknown"]))).toEqual({ scenes: 1, matches: 2 });
    expect(replacementSelectionSummary(preview, new Set())).toEqual({ scenes: 0, matches: 0 });
  });
  it("clearly labels preview-only behavior in all five languages", () => {
    for (const { code } of localeOptions) {
      const html = renderToStaticMarkup(<ProjectReplacePreview nodes={[]} locale={code} />);
      expect(html).toContain(translate(code, "replacePreviewOnly"));
      expect(html).toContain(translate(code, "replaceEmptyHint"));
    }
  });
});
