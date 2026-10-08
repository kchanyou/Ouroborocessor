import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultWritingPreferences, detectPlatform, loadPreferences, normalizeWritingPreferences, sanitizeFontName } from "./preferences";

describe("writing defaults", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses 17px when no writing preferences have been saved", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    expect(loadPreferences("writing", defaultWritingPreferences).fontSize).toBe(17);
  });

  it("preserves a reader's chosen font size", () => {
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify({ fontSize: 24 }) });
    expect(loadPreferences("writing", defaultWritingPreferences).fontSize).toBe(24);
  });

  it("preserves the old 13px setting while sanitizing corrupt numeric preferences", () => {
    expect(normalizeWritingPreferences({ ...defaultWritingPreferences, fontSize: 13 }).fontSize).toBe(13);
    const loaded = normalizeWritingPreferences({ ...defaultWritingPreferences, fontSize: "large" as never, lineHeight: null as never, letterSpacing: Infinity, editorWidth: -200 });
    expect(loaded).toMatchObject({ fontSize: 17, lineHeight: 1.8, letterSpacing: 0, editorWidth: 480 });
    expect(normalizeWritingPreferences({ ...defaultWritingPreferences, fontSize: 100, lineHeight: 10, letterSpacing: -5, editorWidth: 9000 }))
      .toMatchObject({ fontSize: 64, lineHeight: 3.2, letterSpacing: -0.03, editorWidth: 1000 });
  });
});

describe("platform detection", () => {
  it("separates Android from Linux and recognizes desktop platforms", () => {
    expect(detectPlatform("Mozilla/5.0 (Linux; Android 16) AppleWebKit")).toBe("android");
    expect(detectPlatform("Mozilla/5.0 (iPad; CPU OS 27_0 like Mac OS X)")).toBe("apple");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });
});

describe("editor appearance preferences", () => {
  it("falls back to defaults for unknown themes, fonts and colors", () => {
    const loaded = normalizeWritingPreferences({ ...defaultWritingPreferences, editorTheme: "neon" as never, fontFamily: "comic" as never, customBackground: "red", customText: "#12345" });
    expect(loaded.editorTheme).toBe("auto");
    expect(loaded.fontFamily).toBe("serif");
    expect(loaded.customBackground).toBe(defaultWritingPreferences.customBackground);
    expect(loaded.customText).toBe(defaultWritingPreferences.customText);
  });

  it("keeps saved custom colors and strips characters that could escape a font-family string", () => {
    const loaded = normalizeWritingPreferences({ ...defaultWritingPreferences, editorTheme: "custom", customBackground: "#101820", customText: "#F2AA4C", customFont: ' Nanum"; } body { x ' });
    expect(loaded).toMatchObject({ editorTheme: "custom", customBackground: "#101820", customText: "#F2AA4C" });
    expect(sanitizeFontName(' Nanum"; } body { x ')).toBe("Nanum body x");
  });
});
