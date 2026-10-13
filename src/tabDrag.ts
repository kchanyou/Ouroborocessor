import type { PointerEvent as ReactPointerEvent } from "react";
import type { PaneId } from "./DocumentTabs";
import type { SplitDirection } from "./workspaceLayout";

export type DropHint = { left: number; top: number; width: number; height: number };
export type TabDragState = { key: string; title: string; from: PaneId; x: number; y: number; target: PaneId | null; hint: DropHint | null; direction?: SplitDirection };

// Edges choose split direction; viewport size never changes it.
export function tabDropTarget(x: number, y: number, from: PaneId, ratio = 0.5): { target: PaneId | null; hint: DropHint | null; direction?: SplitDirection } {
  const paneRect = (pane: PaneId) => document.querySelector(`[data-pane-root="${pane}"]`)?.getBoundingClientRect() ?? null;
  const contains = (rect: DOMRect | null) => Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  const hintOf = (rect: DOMRect) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  const side = paneRect("side");
  const main = paneRect("main");
  if (side && contains(side)) return from === "side" ? { target: null, hint: null } : { target: "side", hint: hintOf(side) };
  if (!main || !contains(main)) return { target: null, hint: null };
  if (from === "side") return { target: "main", hint: hintOf(main) };
  if (side) return { target: null, hint: null };
  const distances = [
    { direction: "left" as const, distance: (x - main.left) / main.width },
    { direction: "right" as const, distance: (main.right - x) / main.width },
    { direction: "up" as const, distance: (y - main.top) / main.height },
    { direction: "down" as const, distance: (main.bottom - y) / main.height },
  ].sort((a, b) => a.distance - b.distance);
  const { direction, distance } = distances[0];
  if (distance > 0.25) return { target: null, hint: null };
  const horizontal = direction === "left" || direction === "right";
  const share = Math.max(0.15, Math.min(0.85, ratio));
  return { target: "side", direction, hint: {
    left: main.left + (direction === "right" ? main.width * (1 - share) : 0),
    top: main.top + (direction === "down" ? main.height * (1 - share) : 0),
    width: horizontal ? main.width * share : main.width,
    height: horizontal ? main.height : main.height * share,
  } };
}

// 6px threshold so clicks still work. Esc / pointercancel cancels
export function startTabDrag(key: string, title: string, from: PaneId, event: ReactPointerEvent<HTMLElement>,
  onUpdate: (state: TabDragState | null) => void, onDrop: (target: PaneId | null, direction?: SplitDirection) => void, ratio = 0.5) {
  // touch uses the move button, drag fights tab scrolling
  if (event.button !== 0 || event.pointerType === "touch") return;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let finished = false;
  const move = (next: PointerEvent) => {
    if (next.pointerId !== event.pointerId) return;
    if (!dragging && Math.hypot(next.clientX - startX, next.clientY - startY) < 6) return;
    if (!dragging) { dragging = true; document.documentElement.classList.add("is-tab-dragging"); }
    onUpdate({ key, title, from, x: next.clientX, y: next.clientY, ...tabDropTarget(next.clientX, next.clientY, from, ratio) });
  };
  const finish = (end: PointerEvent | null) => {
    if (finished) return;
    finished = true;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", pointerCancel);
    window.removeEventListener("blur", cancel);
    window.removeEventListener("keydown", escape, true);
    document.documentElement.classList.remove("is-tab-dragging");
    onUpdate(null);
    if (dragging && end) { const drop = tabDropTarget(end.clientX, end.clientY, from, ratio); onDrop(drop.target, drop.direction); }
  };
  const up = (end: PointerEvent) => { if (end.pointerId === event.pointerId) finish(end); };
  const cancel = () => finish(null);
  const pointerCancel = (end: PointerEvent) => { if (end.pointerId === event.pointerId) cancel(); };
  const escape = (keyEvent: KeyboardEvent) => { if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopPropagation(); finish(null); } };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", pointerCancel);
  window.addEventListener("blur", cancel);
  window.addEventListener("keydown", escape, true);
  return cancel;
}
