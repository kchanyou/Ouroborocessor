import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ResourceLinks, linkText } from "./ResourceLinkPanel";
import { ReferencePanel } from "./ReferencePanel";
import type { Locale } from "./i18n";

it("provides instructions in each locale without rendering source as HTML", () => {
  for (const locale of Object.keys(linkText) as Locale[]) {
    const html = renderToStaticMarkup(<ResourceLinks projectPath="/test" content="[[<script>alert</script>]]" editor={{ current: null }} locale={locale} onChange={() => {}} onOpen={() => {}} />);
    expect(html).toContain(linkText[locale].title);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  }
});
it("opens the linked card read-only without replacing the manuscript selection", () => {
  const html = renderToStaticMarkup(<ReferencePanel project={{ projectPath: "/test", title: "Test", nodes: [], canUndo: false, canRedo: false }} locale="en" onOpenCard={() => {}} card={{ id: "stable", name: "Mira", kind: "character", description: "<script>notes</script>", aliases: ["Alias"], tags: ["Tag"], deleted: false }} />);
  expect(html).toContain("Mira");
  expect(html).toContain("&lt;script&gt;notes&lt;/script&gt;");
  expect(html).not.toContain("<textarea");
  expect(html).toContain("Alias");
});
