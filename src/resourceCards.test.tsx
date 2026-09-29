import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResourcePanel } from "./ResourcePanel";
import { resourceText } from "./resourceI18n";
import { draftCard, filterResourceCards, materializeCard, parseResourceDraft, resourceDraftKey } from "./resourceCards";
import type { ResourceCard } from "./types";
import type { Locale } from "./i18n";

const card: ResourceCard = { id: "stable-id", kind: "character", name: "인물", description: "日本語 中文 español", aliases: ["Alias"], tags: ["Plot"], deleted: false };
it("round-trips a draft together with its original conflict baseline", () => {
  const draft = draftCard(card, card);
  draft.card = { ...card, name: "Renamed" };
  const restored = parseResourceDraft(JSON.stringify(draft))!;
  expect(restored.expected?.name).toBe("인물");
  expect(materializeCard(restored).id).toBe(card.id);
  expect(resourceDraftKey("/one")).not.toBe(resourceDraftKey("/two"));
});
it("rejects malformed recovery data instead of silently losing it", () => {
  expect(parseResourceDraft(null)).toBeNull();
  for (const value of ["broken", "null", "{}", JSON.stringify({ ...draftCard(card, card), expected: { ...card, id: "other" } })]) {
    expect(() => parseResourceDraft(value)).toThrow();
  }
});
it("normalizes multiline aliases and tags without changing descriptions", () => {
  const draft = draftCard(card, null);
  draft.aliasesText = " Alias\r\nAlias\n別名\n";
  draft.tagsText = " tag \n\n中文";
  expect(materializeCard(draft)).toMatchObject({ aliases: ["Alias", "別名"], tags: ["tag", "中文"], description: card.description });
});
it("searches names descriptions aliases and tags, separating trash", () => {
  const deleted = { ...card, id: "deleted", deleted: true };
  for (const query of ["인물", "中文", "ALIAS", "plot", "español"]) expect(filterResourceCards([card, deleted], query, false)).toEqual([card]);
  expect(filterResourceCards([card, deleted], "", true)).toEqual([deleted]);
  expect(filterResourceCards([card], "missing", false)).toEqual([]);
});
it("renders localized loading state and disables editing until loading succeeds", () => {
  for (const locale of Object.keys(resourceText) as Locale[]) {
    expect(Object.keys(resourceText[locale]).sort()).toEqual(Object.keys(resourceText.en).sort());
    const html = renderToStaticMarkup(<ResourcePanel projectPath="/test" locale={locale} />);
    expect(html).toContain(resourceText[locale].title);
    expect(html).toContain('role="status"');
    expect(html).toContain('<fieldset disabled=""');
  }
});
