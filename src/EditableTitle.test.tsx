import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { EditableTitle, titleCommitAction } from "./EditableTitle";

it("renders the document title as a labelled heading field", () => {
  const html = renderToStaticMarkup(<EditableTitle id="item-title" value="첫 장면" label="제목 바꾸기" onChange={() => {}} onCommit={() => {}} onDone={() => {}} />);
  expect(html).toContain('<h1 id="item-title"');
  expect(html).toContain('value="첫 장면"');
  expect(html).toContain('aria-label="제목 바꾸기"');
});

it("saves changed titles and restores blank ones", () => {
  expect(titleCommitAction("첫 장면", "새 제목")).toBe("save");
  expect(titleCommitAction("첫 장면", "첫 장면")).toBe("none");
  expect(titleCommitAction("첫 장면", "   ")).toBe("revert");
});
