import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultLayout, normalizeLayout, layoutText, splitRatioAt } from "./workspaceLayout";
import { PanelResize, SplitResize, WorkspaceControls } from "./WorkspaceControls";
import type { Locale } from "./i18n";

it("starts with an uncluttered writing layout", () => {
  expect(normalizeLayout(null)).toEqual(defaultLayout);
  expect(defaultLayout.inspector).toBe(false);
});
it("clamps saved widths and ignores invalid preferences", () => {
  expect(normalizeLayout({ navigator: "false", inspector: true, navigatorWidth: -5, inspectorWidth: Infinity }))
    .toEqual({ ...defaultLayout, navigator: true, inspector: true, navigatorWidth: 190, inspectorWidth: 280, sideWidth: 440 });
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

it("preserves explicit split direction and proportion and migrates old sessions", () => {
  for (const splitDirection of ["left", "right", "up", "down"]) expect(normalizeLayout({ splitDirection, splitRatio: 0.7 })).toMatchObject({ splitDirection, splitRatio: 0.7 });
  expect(normalizeLayout({ splitDirection: "automatic", splitRatio: Infinity })).toMatchObject({ splitDirection: "right", splitRatio: 0.5 });
  expect(normalizeLayout({ sideWidth: 600 })).toMatchObject({ splitDirection: "right", splitRatio: 0.5 });
  expect(normalizeLayout({ splitRatio: 1 })).toMatchObject({ splitRatio: 0.85 });
});
it("resizes relative to the pane container in all four directions", () => {
  const bounds = { left: 200, top: 100, width: 800, height: 600 };
  expect(splitRatioAt("right", 800, 300, bounds)).toBe(0.25);
  expect(splitRatioAt("left", 400, 300, bounds)).toBe(0.25);
  expect(splitRatioAt("down", 400, 550, bounds)).toBe(0.25);
  expect(splitRatioAt("up", 400, 250, bounds)).toBe(0.25);
  expect(splitRatioAt("left", -100, 0, bounds)).toBe(0.15);
  expect(splitRatioAt("down", 0, 0, { ...bounds, height: 0 })).toBe(0.5);
});
it("announces the divider axis and percentage for stacked and side-by-side groups", () => {
  for (const direction of ["right", "left", "up", "down"] as const) {
    const html = renderToStaticMarkup(<SplitResize direction={direction} value={0.6} label="Resize" onChange={() => {}} />);
    expect(html).toContain(`aria-orientation="${direction === "right" || direction === "left" ? "vertical" : "horizontal"}"`);
    expect(html).toContain('aria-valuenow="60"');
  }
});
