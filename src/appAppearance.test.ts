import { describe, expect, it } from "vitest";
import { appAppearanceTokens, editorAppearanceStyle } from "./EditorAppearance";
import { defaultWritingPreferences, type EditorTheme } from "./preferences";

describe("application-wide color palettes", () => {
  it.each<EditorTheme>(["paper", "sepia", "mist", "slate", "night", "custom"])("supplies every surface and control color for %s", editorTheme => {
    const tokens = appAppearanceTokens({ ...defaultWritingPreferences, editorTheme });
    for (const key of ["--canvas", "--chrome", "--sidebar", "--sidebar-solid", "--editor", "--control", "--ink", "--ink-secondary", "--accent", "--accent-contrast", "--focus", "--danger", "color-scheme"]) {
      expect(tokens[key], key).toBeTruthy();
    }
    expect(editorAppearanceStyle({ ...defaultWritingPreferences, editorTheme })).not.toHaveProperty("--ink");
  });
  it("lets light/dark/system themes take over again in auto mode", () => {
    expect(appAppearanceTokens(defaultWritingPreferences)).toEqual({});
  });
  it("keeps custom text and background colors and adapts native controls to their brightness", () => {
    const prefs = { ...defaultWritingPreferences, editorTheme: "custom" as const, customBackground: "#101820", customText: "#F2AA4C" };
    expect(appAppearanceTokens(prefs)).toMatchObject({ "--editor": "#101820", "--ink": "#F2AA4C", "color-scheme": "dark" });
    expect(appAppearanceTokens({ ...prefs, customBackground: "#fffaf0" })["color-scheme"]).toBe("light");
    expect(appAppearanceTokens(prefs, true)["--line"]).toBe(prefs.customText);
  });
});
