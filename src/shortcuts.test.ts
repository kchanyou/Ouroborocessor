import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutLabel, shortcuts } from "./shortcuts";

describe("shortcut system", () => {
  it("uses Command on Apple platforms and Control elsewhere", () => {
    expect(matchesShortcut({ key: "p", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, shortcuts.quickOpen, true)).toBe(true);
    expect(matchesShortcut({ key: "p", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, shortcuts.quickOpen, false)).toBe(true);
  });

  it("keeps Ctrl+Tab distinct from primary-modifier shortcuts", () => {
    expect(matchesShortcut({ key: "Tab", metaKey: false, ctrlKey: true, shiftKey: false, altKey: false }, shortcuts.nextTab, true)).toBe(true);
    expect(matchesShortcut({ key: "Tab", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }, shortcuts.nextTab, true)).toBe(false);
  });

  it("formats platform-native labels", () => {
    expect(shortcutLabel(shortcuts.commandPalette, true)).toBe("⌘⇧P");
    expect(shortcutLabel(shortcuts.commandPalette, false)).toBe("Ctrl+Shift+P");
  });
});
