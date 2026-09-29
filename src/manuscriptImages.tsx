import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { WidgetType } from "@codemirror/view";

export function parseImages(content: string) {
  return Array.from(content.matchAll(/!\[([^\]\n]*)\]\(images\/(image-[a-zA-Z0-9-]+\.(?:png|jpg|gif|webp))\)/g), match => ({
    start: match.index!, end: match.index! + match[0].length, alt: match[1], name: match[2],
  }));
}
export const IMAGE_DRAG_TYPE = "application/x-ouroborocessor-image";

export function imageMove(content: string, from: number, to: number, at: number) {
  const image = parseImages(content).find((item) => item.start === from && item.end === to);
  if (!image || at < 0 || at > content.length || (at >= from && at <= to)) return null;
  const source = content.slice(from, to);
  const changes = at < from
    ? [{ from: at, to: at, insert: source }, { from, to, insert: "" }]
    : [{ from, to, insert: "" }, { from: at, to: at, insert: source }];
  const start = at < from ? at : at - (to - from);
  return { changes, selection: start + source.length };
}

export function updateImageAlt(content: string, from: number, to: number, alt: string) {
  const image = parseImages(content).find((item) => item.start === from && item.end === to);
  if (!image) return null;
  const safeAlt = alt.replace(/[\[\]\r\n]/g, " ");
  const source = `![${safeAlt}](images/${image.name})`;
  const next = content.slice(0, from) + source + content.slice(to);
  return { content: next, image: { ...image, alt: safeAlt, end: from + source.length } };
}

export function removeImage(content: string, from: number, to: number) {
  if (!parseImages(content).some((item) => item.start === from && item.end === to)) return null;
  return content.slice(0, from) + content.slice(to);
}
export async function imageUrl(projectPath: string, name: string) {
  const bytes = await invoke<number[]>("read_image", { projectPath, name });
  const mime = name.endsWith("jpg") ? "jpeg" : name.split(".").at(-1);
  return URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: `image/${mime}` }));
}
export class ManuscriptImageWidget extends WidgetType {
  constructor(readonly projectPath: string, readonly name: string, readonly alt: string, readonly from: number, readonly to: number) { super(); }
  eq(other: ManuscriptImageWidget) { return this.projectPath === other.projectPath && this.name === other.name && this.alt === other.alt && this.from === other.from && this.to === other.to; }
  toDOM() {
    const img = document.createElement("img");
    img.className = "manuscript-image"; img.alt = this.alt || this.name;
    img.draggable = true;
    img.dataset.imageFrom = String(this.from);
    img.dataset.imageTo = String(this.to);
    img.dataset.imageName = this.name;
    img.title = this.alt || this.name;
    let alive = true;
    const cleanup = () => { alive = false; if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src); };
    imageCleanup.set(img, cleanup);
    imageUrl(this.projectPath, this.name).then(url => { if (alive) img.src = url; else URL.revokeObjectURL(url); }).catch(() => { img.dataset.failed = "true"; });
    return img;
  }
  destroy(dom: HTMLElement) { imageCleanup.get(dom)?.(); imageCleanup.delete(dom); }
}
const imageCleanup = new WeakMap<HTMLElement, () => void>();
export function ManuscriptImage({ projectPath, name, alt }: { projectPath: string; name: string; alt: string }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true, loaded: string | undefined;
    imageUrl(projectPath, name).then(value => { loaded = value; if (alive) setUrl(value); else URL.revokeObjectURL(value); }).catch(() => {});
    return () => { alive = false; if (loaded) URL.revokeObjectURL(loaded); };
  }, [projectPath, name]);
  return <img className="manuscript-image" src={url} alt={alt || name} />;
}
