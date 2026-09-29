import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncDraftMirror } from "./asyncDraftMirror";

describe("AsyncDraftMirror", () => {
  afterEach(() => vi.useRealTimers());

  it("writes only the latest rapidly scheduled draft", async () => {
    vi.useFakeTimers();
    const mirror = new AsyncDraftMirror();
    const writes: string[] = [];
    mirror.schedule("scene", async () => { writes.push("old"); });
    mirror.schedule("scene", async () => { writes.push("latest"); });
    await vi.runAllTimersAsync();
    await mirror.drain();
    expect(writes).toEqual(["latest"]);
  });

  it("flushes the pending write before cleanup", async () => {
    vi.useFakeTimers();
    const mirror = new AsyncDraftMirror();
    const order: string[] = [];
    mirror.schedule("scene", async () => { order.push("write"); });
    await mirror.then("scene", async () => { order.push("clear"); });
    expect(order).toEqual(["write", "clear"]);
  });

  it("continues after a failed operation", async () => {
    vi.useFakeTimers();
    const mirror = new AsyncDraftMirror();
    const later = vi.fn(async () => {});
    mirror.schedule("one", async () => { throw new Error("disk unavailable"); });
    await expect(mirror.flush("one")).rejects.toThrow("disk unavailable");
    mirror.schedule("two", later);
    await mirror.flush("two");
    expect(later).toHaveBeenCalledOnce();
  });
});
