import { StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { parseResourceLinks } from "./resourceLinks";
import { ManuscriptImageWidget, parseImages } from "./manuscriptImages";

class ResourceLabel extends WidgetType {
  constructor(readonly label: string) { super(); }
  eq(other: ResourceLabel) { return other.label === this.label; }
  toDOM() {
    const span = document.createElement("span");
    span.className = "editor-resource-label";
    span.textContent = this.label;
    span.setAttribute("aria-label", this.label);
    return span;
  }
}
export function linkDecorations(content: string, projectPath = ""): DecorationSet {
  const images = projectPath ? parseImages(content) : [];
  return Decoration.set([
    ...parseResourceLinks(content).filter(link => !images.some(image => link.start < image.end && link.end > image.start)).map((link) => Decoration.replace({ widget: new ResourceLabel(link.label) }).range(link.start, link.end)),
    ...images.map(image => Decoration.replace({ widget: new ManuscriptImageWidget(projectPath, image.name, image.alt, image.start, image.end) }).range(image.start, image.end)),
  ], true);
}
export const createEditorLinks = (projectPath = "") => StateField.define<DecorationSet>({
  create: (state) => linkDecorations(state.doc.toString(), projectPath),
  update: (value, transaction) => transaction.docChanged ? linkDecorations(transaction.state.doc.toString(), projectPath) : value,
  provide: (field) => [EditorView.decorations.from(field), EditorView.atomicRanges.of((view) => view.state.field(field))],
});
export const editorLinks = createEditorLinks();

export function snapLinkSelection(content: string, from: number, to: number) {
  const collapsed = from === to;
  for (const link of [...parseResourceLinks(content), ...parseImages(content)].sort((a, b) => a.start - b.start)) {
    if (from > link.start && from < link.end) from = collapsed ? link.end : link.start;
    if (to > link.start && to < link.end) to = link.end;
  }
  return { anchor: from, head: to };
}

// Keep a small change instead of replacing the entire document, preserving
// selection mapping and useful undo entries when a tool inserts a link.
export function editorChange(before: string, after: string) {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  // don't split surrogate pairs
  if (from && /[\uD800-\uDBFF]/.test(before[from - 1])) from--;
  let to = before.length, end = after.length;
  while (to > from && end > from && before[to - 1] === after[end - 1]) { to--; end--; }
  if (to < before.length && /[\uDC00-\uDFFF]/.test(before[to])) { to++; end++; }
  return { from, to, insert: after.slice(from, end) };
}
