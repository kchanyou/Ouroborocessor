import { describe, expect, it } from "vitest";
import { isSupportedImageFile, logicalDropPoint, supportedImagePaths } from "./imageDrop";

describe("image file drops", () => {
  it("accepts supported paths on Unix and Windows without accepting lookalikes", () => {
    expect(supportedImagePaths(["/tmp/Cover.PNG", "C:\\Art\\scene.jpeg", "/tmp/image.png.exe", "/tmp/notes.pdf"]))
      .toEqual(["/tmp/Cover.PNG", "C:\\Art\\scene.jpeg"]);
  });

  it("accepts clipboard images with an empty MIME type only by extension", () => {
    expect(isSupportedImageFile({ name: "paste.webp", type: "" })).toBe(true);
    expect(isSupportedImageFile({ name: "vector.svg", type: "image/svg+xml" })).toBe(false);
    expect(isSupportedImageFile({ name: "photo.jpg", type: "image/jpeg" })).toBe(true);
  });

  it("converts physical Retina coordinates and also tolerates logical coordinates", () => {
    const bounds = { left: 100, right: 500, top: 80, bottom: 600 };
    expect(logicalDropPoint({ x: 400, y: 300 }, 2, bounds)).toEqual({ x: 200, y: 150 });
    expect(logicalDropPoint({ x: 300, y: 200 }, 3, bounds)).toEqual({ x: 300, y: 200 });
    expect(logicalDropPoint({ x: 20, y: 20 }, 2, bounds)).toBeNull();
  });
});
