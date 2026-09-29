import type { PointerEvent as ReactPointerEvent } from "react";
import type { PaneId } from "./DocumentTabs";

export type DropHint = { left: number; top: number; width: number; height: number };
export type TabDragState = { key: string; title: string; from: PaneId; x: number; y: number; target: PaneId | null; hint: DropHint | null };

/** Where a dragged tab would land. Dropping on the right part of the main pane splits it, as in VS Code. */
export function tabDropTarget(x: number, y: number, from: PaneId): { target: PaneId | null; hint: DropHint | null } {
  const paneRect = (pane: PaneId) => document.querySelector(`[data-pane-root="${pane}"]`)?.getBoundingClientRect() ?? null;
  const contains = (rect: DOMRect | null) => Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  const hintOf = (rect: DOMRect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  const side = paneRect("side");
  const main = paneRect("main");
  if (side && contains(side)) return from === "side" ? { target: null, hint: null } : { target: "side", hint: hintOf(side) };
  if (!main || !contains(main)) return { target: null, hint: null };
  if (from === "side") return { target: "main", hint: hintOf(main) };
  if (x < main.left + main.width * 0.55) return { target: null, hint: null };
  // With a side pane already open, the tab joins it; otherwise preview the new split.
  return { target: "side", hint: side ? hintOf(side) : { left: main.left + main.width / 2, top: main.top, width: main.width / 2, height: main.height } };
}

/**
 * Tracks a pointer drag that started on a tab. Nothing happens until the pointer moves 6px, so a
 * plain click still selects the tab. `onDrop` receives the pane under the pointer on release;
 * Escape or pointercancel ends the drag without dropping.
 */
export function startTabDrag(key: string, title: string, from: PaneId, event: ReactPointerEvent<HTMLElement>,
  onUpdate: (state: TabDragState | null) => void, onDrop: (target: PaneId | null) => void) {
  // Touch users get the explicit move button instead; a drag would fight tab-strip scrolling.
  if (event.button !== 0 || event.pointerType === "touch") return;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  const move = (next: PointerEvent) => {
    if (!dragging && Math.hypot(next.clientX - startX, next.clientY - startY) < 6) return;
    if (!dragging) { dragging = true; document.documentElement.classList.add("is-tab-dragging"); }
    onUpdate({ key, title, from, x: next.clientX, y: next.clientY, ...tabDropTarget(next.clientX, next.clientY, from) });
  };
  const finish = (end: PointerEvent | null) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", escape, true);
    document.documentElement.classList.remove("is-tab-dragging");
    onUpdate(null);
    if (dragging && end) onDrop(tabDropTarget(end.clientX, end.clientY, from).target);
  };
  const up = (end: PointerEvent) => finish(end);
  const cancel = () => finish(null);
  const escape = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") { keyEvent.stopPropagation(); finish(null); } };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", escape, true);
}
