import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ImportScenePreview } from "./ImportScenePreview";
import { importPreviewPage } from "./importPreview";

it("keeps large collapsed manuscripts out of the preview DOM", () => {
  const scene = { title: "<Chapter>", content: "UNRENDERED MANUSCRIPT ".repeat(100000) };
  const html = renderToStaticMarkup(<ImportScenePreview scene={scene} locale="en" />);
  expect(html).toContain("&lt;Chapter&gt;");
  expect(html).not.toContain("UNRENDERED");
  expect(html).not.toContain("<pre>");
  expect(html.length).toBeLessThan(1000);
});

it("reconstructs the full manuscript across bounded preview pages without splitting surrogate pairs", () => {
  const content = `${"a".repeat(3999)}😀${"가".repeat(3998)}🚀\n${"한글 👨‍👩‍👧‍👦\n".repeat(2000)}`;
  const { pages } = importPreviewPage(content, 0);
  const parts = Array.from({ length: pages }, (_, index) => importPreviewPage(content, index));
  expect(parts.map(part => part.text).join("")).toBe(content);
  for (const part of parts) {
    expect(part.text.length).toBeLessThanOrEqual(4001);
    expect(new TextDecoder().decode(new TextEncoder().encode(part.text))).toBe(part.text);
  }
  expect(content).toContain("😀");
});

it("clamps empty, out-of-range and invalid preview page selections", () => {
  expect(importPreviewPage("", 100)).toEqual({ index: 0, pages: 1, text: "" });
  const content = "a".repeat(4000) + "End";
  expect(importPreviewPage(content, 100)).toEqual({ index: 1, pages: 2, text: "End" });
  expect(importPreviewPage(content, -1).index).toBe(0);
  expect(importPreviewPage(content, Number.NaN).index).toBe(0);
  expect(importPreviewPage(content, 1.5).index).toBe(1);
});
