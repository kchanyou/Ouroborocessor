import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readDraft, writeDraft, clearSavedDraft } from "./draftRecovery";

describe("recovery drafts", () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  it("keeps Unicode drafts isolated by project and scene", () => {
    writeDraft("a", "one", { content: "한글 日本語 español", base: "old" });
    expect(readDraft("a", "one")?.content).toBe("한글 日本語 español");
    expect(readDraft("b", "one")).toBeNull();
  });
  it("rebases newer input when an earlier save completes", () => {
    writeDraft("a", "one", { content: "latest", base: "original" });
    clearSavedDraft("a", "one", "earlier save");
    expect(readDraft("a", "one")).toEqual({ content: "latest", base: "earlier save" });
    clearSavedDraft("a", "one", "latest");
    expect(readDraft("a", "one")).toBeNull();
  });
  it("surfaces unavailable recovery storage", () => {
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("quota"); } });
    expect(() => writeDraft("a", "one", { content: "text", base: "" })).toThrow("quota");
  });
});
