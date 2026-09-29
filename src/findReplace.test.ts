import { describe, expect, it } from "vitest";
import { findText, normalizeNumber, replaceMatches } from "./findReplace";

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
