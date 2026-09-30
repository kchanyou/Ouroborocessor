import type { PointerEvent as ReactPointerEvent } from "react";
import type { PaneId } from "./DocumentTabs";

export type DropHint = { left: number; top: number; width: number; height: number };
export type TabDragState = { key: string; title: string; from: PaneId; x: number; y: number; target: PaneId | null; hint: DropHint | null };

// right part of main pane = split
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
  // join the side pane if open, else preview a split
  return { target: "side", hint: side ? hintOf(side) : { left: main.left + main.width / 2, top: main.top, width: main.width / 2, height: main.height } };
}

// 6px threshold so clicks still work. Esc / pointercancel cancels
export function startTabDrag(key: string, title: string, from: PaneId, event: ReactPointerEvent<HTMLElement>,
  onUpdate: (state: TabDragState | null) => void, onDrop: (target: PaneId | null) => void) {
  // touch uses the move button, drag fights tab scrolling
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
