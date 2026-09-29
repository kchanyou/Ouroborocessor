import { afterEach, describe, expect, it, vi } from "vitest";
import { tabDropTarget } from "./tabDrag";

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

  it("ignores the left part of the main pane and splits on the right part", () => {
    panes(rect(0, 1000));
    expect(tabDropTarget(300, 100, "main")).toEqual({ target: null, hint: null });
    expect(tabDropTarget(800, 100, "main")).toEqual({ target: "side", hint: { left: 500, top: 0, width: 500, height: 600 } });
  });

  it("joins an open side pane and points the hint at it", () => {
    panes(rect(0, 600), rect(600, 400));
    expect(tabDropTarget(500, 100, "main").hint).toEqual({ left: 600, top: 0, width: 400, height: 600 });
    expect(tabDropTarget(700, 100, "main").target).toBe("side");
  });

  it("moves side tabs back to the main pane and ignores drops on their own pane", () => {
    panes(rect(0, 600), rect(600, 400));
    expect(tabDropTarget(200, 100, "side").target).toBe("main");
    expect(tabDropTarget(700, 100, "side")).toEqual({ target: null, hint: null });
  });
});
