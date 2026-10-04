import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReferencePanel } from "./ReferencePanel";
import { localeOptions } from "./i18n";
import { resourceText } from "./resourceI18n";
import type { ProjectSnapshot } from "./types";

const project: ProjectSnapshot = {
  projectPath: "/test", title: "Test", canUndo: false, canRedo: false,
  nodes: [{ id: "one", kind: "scene", parentId: null, title: "First", content: "Private body", status: "draft", synopsis: "" }],
};

it("opens research as a document tab without the former pinned manuscript view", () => {
  const html = renderToStaticMarkup(<ReferencePanel project={project} locale="ko" card={null} onOpenCard={() => {}} />);
  expect(html).toContain("레퍼런스 카드");
  expect(html).not.toContain("Private body");
  expect(html).not.toContain("textarea");
});

it("provides the research tab in every supported language", () => {
  for (const { code } of localeOptions) {
    const html = renderToStaticMarkup(<ReferencePanel project={project} locale={code} card={null} onOpenCard={() => {}} />);
    expect(html).toContain(resourceText[code].title);
  }
});
