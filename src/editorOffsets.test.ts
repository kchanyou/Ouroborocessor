import { expect, it } from "vitest";
import { sourceOffsetForEditor } from "./editorOffsets";

it("splits a CRLF manuscript at the editor's visible cursor without changing its text", () => {
  const source = "첫 줄\r\n😀다음 줄\r\n마지막";
  const cursor = "첫 줄\n😀".length;
  const offset = sourceOffsetForEditor(source, cursor);
  expect(source.slice(0, offset)).toBe("첫 줄\r\n😀");
  expect(source.slice(offset)).toBe("다음 줄\r\n마지막");
});

it("maps every editor boundary across mixed line endings", () => {
  const source = "a\r\nb\rc\n😀d\r\n";
  const editor = source.replace(/\r\n?/g, "\n");
  for (let offset = 0; offset <= editor.length; offset++) {
    const prefix = source.slice(0, sourceOffsetForEditor(source, offset));
    expect(prefix.replace(/\r\n?/g, "\n")).toBe(editor.slice(0, offset));
  }
});

it("handles empty text and clamps cursor positions to source boundaries", () => {
  expect(sourceOffsetForEditor("", 3)).toBe(0);
  expect(sourceOffsetForEditor("abc", -1)).toBe(0);
  expect(sourceOffsetForEditor("a\r\nb", 100)).toBe(4);
});
