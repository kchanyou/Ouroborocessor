import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { importScenes, readImportFiles } from "./importManuscript";
import { revisionDiff } from "./revisionDiff";
import { goalCounts, localDay, readGoals, recordWriting, relocateGoals, saveGoals } from "./writingGoals";
import { writingToolsText } from "./writingToolsText";
import { featureText } from "./featureText";

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

it("previews multiple imports in order and preserves all text across heading splits", () => {
  const text = "Preface\n# One\n한국어😀\n```md\n# code, not a heading\n```\n## Two\n[[resource:a|Name]]\n";
  const parts = importScenes([{ name: "book.md", content: text }, { name: "notes.TXT", content: "final" }], true);
  expect(parts.map(part => part.title)).toEqual(["book", "One", "Two", "notes"]);
  expect(parts.slice(0, -1).map(part => part.content).join("")).toBe(text);
  expect(importScenes([{ name: "test.txt", content: "\uFEFFa\r\nb\rc" }], false)[0].content).toBe("a\nb\nc");
});

it("rejects binary, invalid UTF-8, unsupported files and oversized imports", async () => {
  const fake = (name: string, bytes: number[], size = bytes.length) => ({ name, size, arrayBuffer: async () => Uint8Array.from(bytes).buffer }) as File;
  await expect(readImportFiles([fake("test.md", [0xc3, 0x28])])).rejects.toThrow();
  await expect(readImportFiles([fake("test.txt", [0])])).rejects.toThrow();
  await expect(readImportFiles([fake("test.docx", [1])])).rejects.toThrow();
  await expect(readImportFiles([fake("test.md", [1], 51 * 1024 * 1024)])).rejects.toThrow();
  expect(() => importScenes(Array.from({ length: 501 }, () => ({ name: "a.txt", content: "a" })), false)).toThrow();
});

it("splits headings after inline backticks without treating them as a code fence", () => {
  const text = "```inline `code`\n# Chapter one\nBody\n## Chapter two\n";
  const scenes = importScenes([{ name: "book.md", content: text }], true);
  expect(scenes.map(scene => scene.title)).toEqual(["book", "Chapter one", "Chapter two"]);
  expect(scenes.map(scene => scene.content).join("")).toBe(text);
});

it("keeps code headings together until a matching fence with only spaces or tabs", () => {
  const text = "# Start\n````md\n# Code\n```\n# Still code\n~~~~\n# Also code\n````\u00a0\n# Not a closing fence\n  `````\t \n## End\n~~~info `allowed`\n# Tilde code\n~~~\n# Final\n";
  const scenes = importScenes([{ name: "book.md", content: text }], true);
  expect(scenes.map(scene => scene.title)).toEqual(["Start", "End", "Final"]);
  expect(scenes.map(scene => scene.content).join("")).toBe(text);
});

it("applies the import limit to heading splits including prefaces and previous files", () => {
  const chapters = Array.from({ length: 500 }, (_, i) => `# Chapter ${i}\nBody\n`).join("");
  expect(importScenes([{ name: "book.md", content: chapters }], true)).toHaveLength(500);
  expect(() => importScenes([{ name: "book.md", content: `Preface\n${chapters}` }], true)).toThrow("IMPORT_INVALID");
  expect(() => importScenes([{ name: "first.txt", content: "First" }, { name: "book.md", content: chapters }], true)).toThrow("IMPORT_INVALID");
});

it("reconstructs both revisions exactly, including repeated words, Unicode and whitespace", () => {
  const pairs = [["", "new"], ["old", ""], ["한😀 글\n", "한😀 새 글\n"], ["a a b a", "a b b a"], ["same", "same"], ["a ".repeat(1500), "b ".repeat(1500)]];
  for (const [before, after] of pairs) {
    const parts = revisionDiff(before, after);
    expect(parts.filter(part => part.kind !== "added").map(part => part.text).join("")).toBe(before);
    expect(parts.filter(part => part.kind !== "removed").map(part => part.text).join("")).toBe(after);
  }
  expect(revisionDiff("old word", "new word").map(part => part.kind)).toEqual(["removed", "added", "same"]);
});

it("counts visible graphemes and keeps daily net edits across reopen and midnight", () => {
  expect(goalCounts("가 😀\n[[resource:id|이름]]![a](images/image-a.png)")).toEqual({ spaces: 5, compact: 4 });
  const first = new Date(2026, 9, 3, 23, 59), second = new Date(2026, 9, 4, 0, 1);
  recordWriting("one", "", "가 나", first);
  recordWriting("one", "가 나", "가", first);
  expect(readGoals("one").days[localDay(first)]).toEqual({ spaces: 1, compact: 1 });
  saveGoals("one", { ...readGoals("one"), enabled: true, includeSpaces: false });
  recordWriting("one", "가", "가 나 다", second);
  expect(readGoals("one").days[localDay(second)]).toEqual({ spaces: 4, compact: 2 });
  expect(readGoals("one").includeSpaces).toBe(false);
  expect(readGoals("two").days).toEqual({});
  recordWriting("one", "old", "", second);
  expect(readGoals("one").days[localDay(second)].compact).toBe(-1);
});

it("provides every added string in all supported languages", () => {
  for (const dictionary of [featureText, writingToolsText]) for (const locale of ["ko", "en", "es", "ja", "zh"] as const) {
    expect(Object.keys(dictionary[locale]).sort()).toEqual(Object.keys(dictionary.en).sort());
    expect(Object.values(dictionary[locale]).every(value => value.trim().length > 0)).toBe(true);
  }
});

it("restores valid goal counts while dropping malformed stored entries", () => {
  localStorage.setItem("ouroborocessor.goals.v1:one", JSON.stringify({
    enabled: true, daily: -3, project: "100", days: {
      "2026-10-01": { spaces: 12, compact: 9, extra: "ignored" },
      "2026-10-02": { spaces: -4, compact: -3 },
      "2026-10-03": null,
      "2026-10-04": { spaces: "12", compact: 9 },
      "2026-10-05": { spaces: 1.5, compact: 1 },
      "2026-10-06": { spaces: Number.MAX_SAFE_INTEGER + 1, compact: 1 },
      invalid: { spaces: 2, compact: 1 },
    },
  }));
  expect(readGoals("one")).toMatchObject({ enabled: true, daily: 1, project: 100000 });
  expect(readGoals("one").days).toEqual({
    "2026-10-01": { spaces: 12, compact: 9 },
    "2026-10-02": { spaces: -4, compact: -3 },
  });
  recordWriting("one", "", "abc", new Date(2026, 9, 3));
  expect(readGoals("one").days["2026-10-03"]).toEqual({ spaces: 3, compact: 3 });
});

it("keeps goals and daily progress when reconnecting a moved project", () => {
  saveGoals("old", { ...readGoals("old"), enabled: true, includeSpaces: false, daily: 500, project: 5000 });
  recordWriting("old", "", "가 나", new Date(2026, 9, 3));
  const goals = readGoals("old");
  relocateGoals("old", "moved");
  expect(readGoals("moved")).toEqual(goals);
  expect(readGoals("old")).toEqual(goals);
  recordWriting("moved", "", "abc", new Date(2026, 9, 4));
  const updated = readGoals("moved");
  relocateGoals("old", "moved");
  expect(readGoals("moved")).toEqual(updated);
  relocateGoals("moved", "moved");
  expect(readGoals("moved")).toEqual(updated);
});

it("does not create goal settings from a missing source and tolerates unavailable storage", () => {
  const setItem = vi.spyOn(localStorage, "setItem");
  relocateGoals("missing", "new");
  expect(setItem).not.toHaveBeenCalled();
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } });
  expect(() => relocateGoals("old", "new")).not.toThrow();
  expect(() => recordWriting("one", "", "abc")).not.toThrow();
});
