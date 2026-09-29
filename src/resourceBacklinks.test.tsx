import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resourceBacklinks } from "./resourceBacklinks";
import { ResourceBacklinksPanel, backlinkText } from "./ResourceBacklinksPanel";
import { resourceLinkText } from "./resourceLinks";
import { editorMatchOffsets } from "./projectSearch";
import type { ManuscriptNode, ResourceCard } from "./types";
import type { Locale } from "./i18n";

const card: ResourceCard = { id: "card", name: "Mira", aliases: ["미라"], description: "", tags: [], deleted: false, kind: "character" };
const scene = (id: string, content: string, parentId: string | null = null): ManuscriptNode => ({ id, title: id, content, parentId, kind: "scene", status: "draft", synopsis: "" });

it("lists every occurrence in manuscript tree order, excluding groups", () => {
  const nodes = [scene("child", "[[미라]]", "group"), { ...scene("group", "[[Mira]]"), kind: "group" as const }, scene("last", `${resourceLinkText(card)} [[Mira]]`)];
  const result = resourceBacklinks(nodes, [card], card.id);
  expect(result.count).toBe(3); expect(result.scenes).toBe(2);
  expect(result.hits.map((hit) => hit.sceneId)).toEqual(["child", "last", "last"]);
});
it("keeps ID backlinks after rename, deletion and missing target metadata", () => {
  const nodes = [scene("one", `${resourceLinkText(card)} [[Mira]]`)];
  for (const cards of [[], [{ ...card, name: "Renamed", aliases: [] }], [{ ...card, deleted: true }]]) {
    expect(resourceBacklinks(nodes, cards, card.id).count).toBe(1);
  }
});
it("does not assign ambiguous names or aliases to either resource", () => {
  const cards = [card, { ...card, id: "other" }];
  const nodes = [scene("one", "[[Mira]] [[미라]] [[unknown]]")];
  expect(resourceBacklinks(nodes, cards, card.id).count).toBe(0);
  expect(resourceBacklinks(nodes, cards, "other").count).toBe(0);
});
it("limits rendered hits without losing total counts", () => {
  const result = resourceBacklinks([scene("one", "[[Mira]] ".repeat(205)), scene("two", "[[Mira]]")], [card], card.id);
  expect(result.hits).toHaveLength(200); expect(result.count).toBe(206); expect(result.scenes).toBe(2);
});
it("uses live source snapshots and correct emoji/CRLF selection offsets", () => {
  const source = "😀\r\n日本語 [[미라]] fin";
  const hit = resourceBacklinks([scene("one", source)], [card], card.id).hits[0];
  expect(hit.source).toBe(source);
  const offsets = editorMatchOffsets(hit);
  expect(source.replace(/\r\n/g, "\n").slice(offsets.start, offsets.end)).toBe("[[미라]]");
  expect(resourceBacklinks([scene("one", "removed")], [card], card.id).count).toBe(0);
});
it("renders localized loading and refresh controls before metadata is ready", () => {
  for (const locale of Object.keys(backlinkText) as Locale[]) {
    expect(Object.keys(backlinkText[locale]).sort()).toEqual(Object.keys(backlinkText.en).sort());
    const html = renderToStaticMarkup(<ResourceBacklinksPanel projectPath="/test" nodes={[]} resourceId="card" locale={locale} onNavigate={async () => {}} />);
    expect(html).toContain(backlinkText[locale].title);
    expect(html).toContain('role="status"');
    expect(html).toContain(backlinkText[locale].refresh);
  }
});
