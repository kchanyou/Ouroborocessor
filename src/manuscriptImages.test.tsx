import { expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { imageMove, parseImages, removeImage, updateImageAlt } from "./manuscriptImages";

it("finds only project image syntax and preserves source ranges", () => {
  const text = "앞 ![표지](images/image-123.png) 뒤 ![외부](https://example.com/a.png)";
  const images = parseImages(text);
  expect(images).toEqual([{ start: 2, end: 29, alt: "표지", name: "image-123.png" }]);
  expect(text.slice(images[0].start, images[0].end)).toBe("![표지](images/image-123.png)");
});
it("rejects path traversal and unsupported extensions", () => {
  expect(parseImages("![](images/../secret.png) ![](images/image-x.svg)")).toEqual([]);
});
it("moves a complete image source as one undoable edit", () => {
  const source = "A ![표지](images/image-123.png) B C";
  const image = parseImages(source)[0];
  const move = imageMove(source, image.start, image.end, source.length)!;
  const state = EditorState.create({ doc: source }).update({ changes: move.changes, selection: { anchor: move.selection } }).state;
  expect(state.doc.toString()).toBe("A  B C![표지](images/image-123.png)");
  expect(state.selection.main.head).toBe(state.doc.length);
});
it("rejects stale, malformed, and self-drops", () => {
  const source = "A ![표지](images/image-123.png) B";
  const image = parseImages(source)[0];
  expect(imageMove(source, image.start + 1, image.end, 0)).toBeNull();
  expect(imageMove(source, image.start, image.end, image.start + 2)).toBeNull();
  expect(imageMove(source, image.start, image.end, source.length + 1)).toBeNull();
});
it("updates accessible alternative text without changing the stored image", () => {
  const source = "앞 ![old](images/image-123.png) 뒤";
  const image = parseImages(source)[0];
  const result = updateImageAlt(source, image.start, image.end, "새 설명]\n")!;
  expect(result.content).toBe("앞 ![새 설명  ](images/image-123.png) 뒤");
  expect(result.image.name).toBe("image-123.png");
  expect(result.content.slice(result.image.start, result.image.end)).toContain("새 설명");
});
it("removes only an exact current image range", () => {
  const source = "A ![cover](images/image-123.png) B";
  const image = parseImages(source)[0];
  expect(removeImage(source, image.start, image.end)).toBe("A  B");
  expect(removeImage(source, image.start + 1, image.end)).toBeNull();
});
