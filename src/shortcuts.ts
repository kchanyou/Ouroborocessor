export type ShortcutCommand = "quickOpen" | "commandPalette" | "closeTab" | "reopenTab" | "nextTab" | "previousTab" | "insertImage" | "openResearch" | "toggleSidebar" | "splitRight";

export type Shortcut = { key: string; mod?: boolean; ctrl?: boolean; shift?: boolean };

export const shortcuts: Record<ShortcutCommand, Shortcut> = {
  reopenTab: { key: "t", mod: true, shift: true },
  quickOpen: { key: "p", mod: true },
  commandPalette: { key: "p", mod: true, shift: true },
  closeTab: { key: "w", mod: true },
  nextTab: { key: "Tab", ctrl: true },
  previousTab: { key: "Tab", ctrl: true, shift: true },
  insertImage: { key: "i", mod: true, shift: true },
  openResearch: { key: "r", mod: true, shift: true },
  toggleSidebar: { key: "b", mod: true },
  splitRight: { key: "\\", mod: true },
};

export function matchesShortcut(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">, shortcut: Shortcut, isMac: boolean) {
  const expectedCtrl = Boolean(shortcut.ctrl || (shortcut.mod && !isMac));
  const expectedMeta = Boolean(shortcut.mod && isMac);
  return event.key.toLowerCase() === shortcut.key.toLowerCase()
    && event.ctrlKey === expectedCtrl
    && event.metaKey === expectedMeta
    && event.shiftKey === Boolean(shortcut.shift)
    && !event.altKey;
}

export function shortcutLabel(shortcut: Shortcut, isMac: boolean) {
  const parts: string[] = [];
  if (shortcut.mod) parts.push(isMac ? "⌘" : "Ctrl");
  if (shortcut.ctrl) parts.push(isMac ? "⌃" : "Ctrl");
  if (shortcut.shift) parts.push(isMac ? "⇧" : "Shift");
  const key = shortcut.key === "Tab" ? "Tab" : shortcut.key.toUpperCase();
  parts.push(key);
  return isMac ? parts.join("") : parts.join("+");
}
