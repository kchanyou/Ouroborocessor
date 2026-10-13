import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";
import { startTabDrag, tabDropTarget } from "./tabDrag";

const rect = (left: number, width: number) => ({ left, top: 0, right: left + width, bottom: 600, width, height: 600 }) as DOMRect;

function panes(main: DOMRect, side?: DOMRect) {
  vi.stubGlobal("document", {
    querySelector: (selector: string) => {
      const found = selector.includes("main") ? main : selector.includes("side") ? side : undefined;
      return found ? { getBoundingClientRect: () => found } : null;
    },
  });
}

describe("tab drop target", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ignores the center and previews a right-edge split", () => {
    panes(rect(0, 1000));
    expect(tabDropTarget(500, 300, "main")).toEqual({ target: null, hint: null });
    expect(tabDropTarget(900, 300, "main")).toEqual({ target: "side", direction: "right", hint: { left: 500, top: 0, width: 500, height: 600 } });
  });

  it("joins an open side pane and points the hint at it", () => {
    panes(rect(0, 600), rect(600, 400));
    expect(tabDropTarget(500, 100, "main").target).toBeNull();
    expect(tabDropTarget(700, 100, "main").target).toBe("side");
  });

  it("moves side tabs back to the main pane and ignores drops on their own pane", () => {
    panes(rect(0, 600), rect(600, 400));
    expect(tabDropTarget(200, 100, "side").target).toBe("main");
    expect(tabDropTarget(700, 100, "side")).toEqual({ target: null, hint: null });
  });
});

it("previews left, upper and lower edge splits without a viewport breakpoint", () => {
  panes(rect(0, 360));
  expect(tabDropTarget(10, 300, "main")).toMatchObject({ direction: "left", hint: { left: 0, width: 180, height: 600 } });
  expect(tabDropTarget(180, 10, "main")).toMatchObject({ direction: "up", hint: { top: 0, width: 360, height: 300 } });
  expect(tabDropTarget(180, 590, "main")).toMatchObject({ direction: "down", hint: { top: 300, width: 360, height: 300 } });
  vi.unstubAllGlobals();
});

it("previews the saved split proportion rather than an unrelated half-width", () => {
  panes(rect(0, 1000));
  expect(tabDropTarget(990, 300, "main", 0.7)).toMatchObject({ direction: "right", hint: { width: 700 } });
  vi.unstubAllGlobals();
});

describe("tab drag lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());
  function setup() {
    panes(rect(0, 1000));
    const classes = { add: vi.fn(), remove: vi.fn() };
    Object.assign(document, { documentElement: { classList: classes } });
    const events = new EventTarget();
    vi.stubGlobal("window", events);
    const update = vi.fn(), drop = vi.fn();
    const cancel = startTabDrag("scene", "Scene", "main", { button: 0, pointerType: "mouse", pointerId: 1, clientX: 500, clientY: 300 } as ReactPointerEvent<HTMLElement>, update, drop);
    const pointer = (type: string, pointerId = 1) => events.dispatchEvent(Object.assign(new Event(type), { pointerId, clientX: 990, clientY: 300 }));
    return { events, update, drop, cancel, pointer, classes };
  }
  it("ignores other pointers and drops only once", () => {
    const s = setup();
    s.pointer("pointermove", 2); expect(s.update).not.toHaveBeenCalled();
    s.pointer("pointermove");
    s.pointer("pointerup", 2); expect(s.drop).not.toHaveBeenCalled();
    s.pointer("pointerup"); s.pointer("pointerup"); s.cancel?.();
    expect(s.drop).toHaveBeenCalledExactlyOnceWith("side", "right");
  });
  it.each(["blur", "pointercancel", "Escape", "cleanup"])("cancels without moving a tab on %s", reason => {
    const s = setup(); s.pointer("pointermove");
    if (reason === "cleanup") s.cancel?.();
    else if (reason === "Escape") {
      const event = Object.assign(new Event("keydown", { cancelable: true }), { key: "Escape" });
      s.events.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    } else if (reason === "pointercancel") s.pointer(reason);
    else s.events.dispatchEvent(new Event(reason));
    const calls = s.update.mock.calls.length;
    s.pointer("pointermove"); s.pointer("pointerup");
    expect(s.update).toHaveBeenCalledTimes(calls);
    expect(s.update).toHaveBeenLastCalledWith(null);
    expect(s.classes.remove).toHaveBeenCalledWith("is-tab-dragging");
    expect(s.drop).not.toHaveBeenCalled();
  });
});
