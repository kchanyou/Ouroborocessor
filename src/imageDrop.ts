export const SUPPORTED_IMAGE_PATTERN = /\.(png|jpe?g|gif|webp)$/i;

export function isSupportedImageFile(file: Pick<File, "name" | "type">) {
  return file.type.startsWith("image/") && SUPPORTED_IMAGE_PATTERN.test(file.name)
    || (!file.type && SUPPORTED_IMAGE_PATTERN.test(file.name));
}

export function supportedImagePaths(paths: string[]) {
  return paths.filter((path) => SUPPORTED_IMAGE_PATTERN.test(path));
}

type Point = { x: number; y: number };
type Bounds = { left: number; right: number; top: number; bottom: number };

export function logicalDropPoint(position: Point, scale: number, bounds: Bounds): Point | null {
  const ratio = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const candidates = [{ x: position.x / ratio, y: position.y / ratio }, position];
  return candidates.find(({ x, y }) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) ?? null;
}
