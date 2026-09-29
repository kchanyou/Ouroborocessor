import { describe, expect, it, vi } from "vitest";
import { CloseSaveCoordinator } from "./closeSafety";

describe("safe window closing", () => {
  it("waits for saving before closing and coalesces repeated requests", async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const close = vi.fn(async () => {});
    const coordinator = new CloseSaveCoordinator();
    const first = coordinator.request(save, close);
    const second = coordinator.request(save, close);
    expect(first).toBe(second);
    expect(close).not.toHaveBeenCalled();
    finish(); await first;
    expect(save).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the window open after a save failure and permits retry", async () => {
    const close = vi.fn(async () => {});
    const coordinator = new CloseSaveCoordinator();
    await expect(coordinator.request(async () => { throw new Error("disk full"); }, close)).rejects.toThrow("disk full");
    expect(close).not.toHaveBeenCalled();
    await coordinator.request(async () => {}, close);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
