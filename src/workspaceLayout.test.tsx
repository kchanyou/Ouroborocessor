import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultLayout, normalizeLayout, layoutText } from "./workspaceLayout";
import { PanelResize, WorkspaceControls } from "./WorkspaceControls";
import type { Locale } from "./i18n";

it("starts with an uncluttered writing layout", () => {
  expect(normalizeLayout(null)).toEqual(defaultLayout);
  expect(defaultLayout.inspector).toBe(false);
});
it("clamps saved widths and ignores invalid preferences", () => {
  expect(normalizeLayout({ navigator: "false", inspector: true, navigatorWidth: -5, inspectorWidth: Infinity }))
    .toEqual({ navigator: true, inspector: true, navigatorWidth: 190, inspectorWidth: 280, sideWidth: 440 });
  expect(normalizeLayout({ navigatorWidth: 320, inspectorWidth: 340 }).navigatorWidth).toBe(320);
});
it("offers reset and labeled width sliders in every language", () => {
  for (const locale of Object.keys(layoutText) as Locale[]) {
    const html = renderToStaticMarkup(<WorkspaceControls locale={locale} value={defaultLayout} onChange={() => {}} />);
    expect(html).toContain(layoutText[locale].title);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain(layoutText[locale].reset);
    expect(html.match(/type="range"/g)).toHaveLength(2);
  }
});
it("exposes keyboard accessible panel separators and bounds", () => {
  const html = renderToStaticMarkup(<PanelResize value={240} min={190} max={360} side="right" label="Outline width" onChange={() => {}} />);
  expect(html).toContain('role="separator"'); expect(html).toContain('aria-valuenow="240"'); expect(html).toContain('tabindex="0"');
});
