import { describe, expect, it } from "vitest";
import { findText, normalizeNumber, replaceCurrentMatch, replaceMatches } from "./findReplace";

describe("literal scene search", () => {
  it("treats regex symbols as literal text", () => {
    expect(findText("a.* [x] a.*", "a.*")).toEqual([{ start: 0, end: 3 }, { start: 8, end: 11 }]);
    expect(findText("[x]", "[x]")).toHaveLength(1);
    expect(findText("text", "")).toEqual([]);
  });
  it("keeps UTF-16 selection positions for multilingual text and emoji", () => {
    expect(findText("😀한글 日本語 한글", "한글")).toEqual([{ start: 2, end: 4 }, { start: 9, end: 11 }]);
    expect(findText("Hola hola", "hola", false)).toHaveLength(2);
    expect(findText("Hola hola", "hola", true)).toHaveLength(1);
  });
  it("replaces without interpreting dollar substitution and allows deletion", () => {
    const text = "one one";
    expect(replaceMatches(text, findText(text, "one"), "$&")).toBe("$& $&");
    expect(replaceMatches(text, [findText(text, "one")[1]], "")).toBe("one ");
  });
  it("uses non-overlapping matches", () => {
    expect(findText("aaaa", "aa")).toHaveLength(2);
  });
});

describe("numeric writing settings", () => {
  it("retains current settings for blank or invalid input", () => {
    expect(normalizeNumber("", 13, 12, 64, 1)).toBe(13);
    expect(normalizeNumber("Infinity", 13, 12, 64, 1)).toBe(13);
  });
  it("clamps and rounds to valid steps", () => {
    expect(normalizeNumber("99", 13, 12, 64, 1)).toBe(64);
    expect(normalizeNumber("1", 13, 12, 64, 1)).toBe(12);
    expect(normalizeNumber("1.83", 1.8, 1, 3.2, .05)).toBe(1.85);
    expect(normalizeNumber("13", 20, 12, 64, 1)).toBe(13);
  });
});

describe("single replacement navigation", () => {
  it("continues forward from a middle match instead of restarting", () => {
    expect(replaceCurrentMatch("cat cat cat", "cat", "dog", true, 1)).toEqual({ content: "cat dog cat", index: 1 });
  });
  it("skips search terms inside newly inserted text", () => {
    const next = replaceCurrentMatch("cat cat cat", "cat", "catcat", true, 1);
    expect(next).toEqual({ content: "cat catcat cat", index: 3 });
    expect(replaceCurrentMatch(next.content, "cat", "dog", true, next.index).content).toBe("cat catcat dog");
  });
  it("handles deletion, adjacent matches and wrapping", () => {
    expect(replaceCurrentMatch("xxx", "x", "", true, 1)).toEqual({ content: "xx", index: 1 });
    expect(replaceCurrentMatch("cat cat", "cat", "dog", true, 1)).toEqual({ content: "cat dog", index: 0 });
    expect(replaceCurrentMatch("cat", "cat", "", true, 0)).toEqual({ content: "", index: 0 });
  });
  it("advances even when replacement leaves the text unchanged", () => {
    expect(replaceCurrentMatch("cat cat", "cat", "cat", true, 0)).toEqual({ content: "cat cat", index: 1 });
  });
  it("preserves UTF-16 positions and case-insensitive matching", () => {
    expect(replaceCurrentMatch("😀 CAT cat", "cat", "🐈cat", false, 0)).toEqual({ content: "😀 🐈cat cat", index: 1 });
  });
  it("leaves unmatched text untouched", () => {
    expect(replaceCurrentMatch("cat", "dog", "x", true, 0)).toEqual({ content: "cat", index: 0 });
  });
});
