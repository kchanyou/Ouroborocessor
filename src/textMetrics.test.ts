import { describe, expect, it } from "vitest";
import { getCharacterCount, getTextMetrics } from "./textMetrics";

describe("getTextMetrics", () => {
  it("keeps lightweight sidebar counts identical to full metrics", () => {
    for (const text of ["", "\r\n\n", "한국어 English español 日本語 中文", "e\u0301 👨‍👩‍👧‍👦 🇰🇷", "a\tb\r\nc"]) {
      expect(getCharacterCount(text)).toBe(getTextMetrics(text).charactersWithSpaces);
    }
  });
  it("counts Windows and Unix line endings identically", () => {
    expect(getTextMetrics("안녕\r\n세계")).toEqual(getTextMetrics("안녕\n세계"));
  });
  it("counts Korean characters with and without spaces", () => {
    const result = getTextMetrics("안녕 세계");
    expect(result.charactersWithSpaces).toBe(5);
    expect(result.charactersWithoutSpaces).toBe(4);
    expect(result.words).toBe(2);
  });

  it("counts composed emoji as one grapheme", () => {
    const result = getTextMetrics("👨‍👩‍👧‍👦");
    expect(result.charactersWithSpaces).toBe(1);
  });

  it("ignores blank lines when counting paragraphs", () => {
    const result = getTextMetrics("첫 문단\n\n둘째 문단\n");
    expect(result.paragraphs).toBe(2);
  });
});
