import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CommandPalette } from "./CommandPalette";

it("renders a keyboard-accessible command list without test-oriented mode labels", () => {
  const html = renderToStaticMarkup(<CommandPalette mode="commands" locale="ko" onClose={() => {}} items={[
    { id: "research", title: "레퍼런스 열기", shortcut: "⌘⇧R", run: () => {} },
  ]} />);
  expect(html).toContain('<dialog class="command-palette" aria-label="명령 실행"');
  expect(html).toContain('role="listbox"');
  expect(html).toContain("레퍼런스 열기");
  expect(html).toContain("⌘⇧R");
  expect(html).not.toContain("쓰기");
  expect(html).not.toContain("원문");
});
