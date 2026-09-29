import { expect, it } from "vitest";
import { parseResourceLinks, resolveResourceLink, resourceLinkText, resourceQuery, suggestResources } from "./resourceLinks";
import type { ResourceCard } from "./types";
const card: ResourceCard = { id: "stable-id", name: "인물|名前[%]", kind: "character", description: "", aliases: ["Mira"], tags: [], deleted: false };
it("round trips special labels and uses stable IDs after rename", () => {
  const link = parseResourceLinks(resourceLinkText(card))[0];
  expect(link.label).toBe(card.name);
  const renamed = { ...card, name: "New name" };
  expect(resolveResourceLink(link, [renamed])).toEqual([renamed]);
  expect(resolveResourceLink(link, [{ ...renamed, deleted: true }])).toEqual([]);
});
it("detects missing and ambiguous manually typed aliases", () => {
  const link = parseResourceLinks("[[Mira]]")[0];
  expect(resolveResourceLink(link, [card])).toEqual([card]);
  expect(resolveResourceLink(link, [card, { ...card, id: "other" }])).toHaveLength(2);
  expect(resolveResourceLink(parseResourceLinks("[[unknown]]")[0], [card])).toEqual([]);
});
it("finds completion only at a collapsed unclosed bracket token", () => {
  expect(resourceQuery("Hi [[Mi", 7, 7)).toEqual({ start: 3, end: 7, query: "Mi" });
  expect(resourceQuery("[[Mi]]", 4, 4)).toEqual({ start: 0, end: 6, query: "Mi" });
  expect(resourceQuery("[[Mi]]", 6, 6)).toBeNull();
  expect(resourceQuery("[[Mi", 2, 4)).toBeNull();
  expect(resourceQuery("[[a\nb", 5, 5)).toBeNull();
  expect(resourceQuery("[[resource:abc", 14, 14)).toBeNull();
});
it("caps suggestions and excludes trash, while matching aliases", () => {
  expect(suggestResources([card, { ...card, deleted: true }], "mIr")).toEqual([card]);
  expect(suggestResources(Array.from({ length: 20 }, (_, i) => ({ ...card, id: String(i) })), "")).toHaveLength(8);
});
it("ignores malformed encodings and preserves UTF16 source offsets", () => {
  expect(parseResourceLinks("[[resource:id|%GG]]")).toEqual([]);
  const text = "😀 [[Mira]] 日本語";
  const link = parseResourceLinks(text)[0];
  expect(text.slice(link.start, link.end)).toBe("[[Mira]]");
});
