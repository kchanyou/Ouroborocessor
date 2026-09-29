import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { DocumentTabs, nextTabIndex, tabText } from "./DocumentTabs";
import type { ManuscriptNode } from "./types";

const nodes: ManuscriptNode[] = [
  { id: "one", kind: "scene", parentId: null, title: "첫 장면", content: "", status: "draft", synopsis: "" },
  { id: "two", kind: "group", parentId: null, title: "2부", content: "", status: "draft", synopsis: "" },
];
it("renders open documents and research as keyboard-accessible tabs", () => {
  const html = renderToStaticMarkup(<DocumentTabs nodes={nodes} references={[{ key: "reference:library", title: tabText.ko.resources }]} activeKey="node:one" locale="ko" onSelectNode={() => {}} onSelectReference={() => {}} onClose={() => {}} />);
  expect(html).toContain('aria-label="열린 탭"');
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-selected="true"');
  expect(html).toContain(tabText.ko.resources);
  expect(html).toContain("첫 장면 · 탭 닫기");
  expect(html).toContain('data-kind="reference"');
  expect(html).toContain('aria-controls="workspace-tab-content"');
  expect(html).toContain('tabindex="-1"');
});

it("wraps tab arrow navigation and supports Home and End", () => {
  expect(nextTabIndex(3, 0, "ArrowRight")).toBe(1);
  expect(nextTabIndex(3, 2, "ArrowRight")).toBe(0);
  expect(nextTabIndex(3, 0, "ArrowLeft")).toBe(2);
  expect(nextTabIndex(3, 1, "Home")).toBe(0);
  expect(nextTabIndex(3, 1, "End")).toBe(2);
  expect(nextTabIndex(3, 1, "Enter")).toBeNull();
});
