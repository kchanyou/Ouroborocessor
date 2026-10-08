import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { projectOpenFeedback } from "./projectOpenFeedback";
import { ProjectSceneSaveError } from "./projectSave";
import { featureText } from "./featureText";
import { translate } from "./i18n";
import { RecentProjectsDialog } from "./RecentProjectsDialog";
import { SettingsDialog } from "./AppDialogs";
import { CommandPalette } from "./CommandPalette";
import { defaultAppPreferences } from "./preferences";

afterEach(() => vi.unstubAllGlobals());

it("distinguishes failed saves from missing projects and explains the affected scene", () => {
  const result = projectOpenFeedback(new ProjectSceneSaveError("First chapter", "STORAGE_FULL", "save"), "en", "save");
  expect(result).toContain(featureText.en.switchSaveFailed);
  expect(result).toContain("First chapter");
  expect(result).toContain(translate("en", "storageFullError"));
  expect(result).not.toContain(featureText.en.missingProject);
});

it("explains recovery cleanup failures and metadata conflicts before switching", () => {
  expect(projectOpenFeedback(new ProjectSceneSaveError("Scene", "blocked", "recovery"), "ko", "save")).toContain(translate("ko", "recoveryFailed"));
  expect(projectOpenFeedback("METADATA_CONFLICT", "en", "save")).toContain("Item details changed outside the app");
});

it("preserves recognizable open errors and offers relocation guidance for other open failures", () => {
  expect(projectOpenFeedback("STORAGE_PERMISSION", "en", "open")).toBe(translate("en", "storagePermissionError"));
  expect(projectOpenFeedback("missing file", "en", "open")).toBe(featureText.en.missingProject);
});

it("labels search and history-only removal in every supported language", () => {
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify([{ path: "/book.story", title: "My book" }]) });
  for (const locale of ["ko", "en", "es", "ja", "zh"] as const) {
    const html = renderToStaticMarkup(<RecentProjectsDialog locale={locale} beforeOpen={async () => {}} onOpen={async () => {}} onLocate={async () => false} onClose={() => {}} />);
    expect(html).toContain(`aria-label="${featureText[locale].searchProjects}"`);
    expect(html).toContain(featureText[locale].recentHint);
    expect(html).toContain(`${featureText[locale].removeRecent}: My book · /book.story`);
    expect(Object.keys(featureText[locale]).sort()).toEqual(Object.keys(featureText.en).sort());
  }
});

it("uses native dialogs and a single combobox tab stop for command results", () => {
  const settings = renderToStaticMarkup(<SettingsDialog preferences={defaultAppPreferences} setPreferences={() => {}} onClose={() => {}} t={key => translate("en", key)} />);
  expect(settings).toContain('<dialog class="settings-dialog" aria-labelledby="settings-title"');
  const palette = renderToStaticMarkup(<CommandPalette mode="commands" locale="en" items={[{ id: "save", title: "Save", run: () => {} }]} onClose={() => {}} />);
  expect(palette).toContain('<dialog class="command-palette"');
  expect(palette).toContain('role="option" tabindex="-1"');
  expect(palette).toContain('aria-activedescendant="palette-item-0"');
});
