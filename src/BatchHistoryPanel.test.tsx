import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { BatchHistoryPanel, historyText, journalLabel } from "./BatchHistoryPanel";
import type { Locale } from "./i18n";

it("provides complete recovery guidance and loading feedback in five languages", () => {
  for (const locale of Object.keys(historyText) as Locale[]) {
    expect(historyText[locale]).toHaveLength(9);
    expect(historyText[locale].every((value) => value.length > 0)).toBe(true);
    const html = renderToStaticMarkup(<BatchHistoryPanel project={{ projectPath: "/test", title: "Test", nodes: [], canUndo: false, canRedo: false }} locale={locale} busy={false} onRestore={async () => {}} />);
    expect(html).toContain(historyText[locale][1]);
    expect(html).toContain('role="status"');
    expect(html).not.toContain("<textarea");
  }
});

it("keeps the exact record identity alongside its human readable timestamp", () => {
  expect(journalLabel("batch-1789887453559544000.json", "en")).toContain(" · batch-1789887453559544000.json");
  expect(journalLabel("invalid", "ko")).toBe("invalid");
  expect(journalLabel(`batch-${"9".repeat(40)}.json`, "en")).toBe(`batch-${"9".repeat(40)}.json`);
});
