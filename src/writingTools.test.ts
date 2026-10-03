import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { importScenes, readImportFiles } from "./importManuscript";
import { revisionDiff } from "./revisionDiff";
import { goalCounts, localDay, readGoals, recordWriting, saveGoals } from "./writingGoals";
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
