import { useImperativeHandle, useLayoutEffect, useMemo, useRef, type Ref } from "react";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, isolateHistory } from "@codemirror/commands";
import { editorChange, createEditorLinks } from "./editorLinks";
import { IMAGE_DRAG_TYPE, imageMove, parseImages } from "./manuscriptImages";
import { isSupportedImageFile } from "./imageDrop";
import type { WritingPreferences } from "./preferences";

export class EditorPort extends EventTarget {
  view: EditorView | null = null;
  get value() { return this.view?.state.doc.toString() ?? ""; }
  get selectionStart() { return this.view?.state.selection.main.from ?? 0; }
  get selectionEnd() { return this.view?.state.selection.main.to ?? 0; }
  focus() { this.view?.focus(); }
  posAtCoords(x: number, y: number) { return this.view?.posAtCoords({ x, y }) ?? null; }
  selectImage(from: number, to: number) {
    const view = this.view;
    if (!view) return;
    view.dom.querySelectorAll(".manuscript-image.is-selected").forEach((element) => element.classList.remove("is-selected"));
    const image = view.dom.querySelector<HTMLElement>(`.manuscript-image[data-image-from="${from}"][data-image-to="${to}"]`);
    image?.classList.add("is-selected");
    view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  }
  setSelectionRange(start: number, end: number) {
    const view = this.view;
    if (!view) return;
    const clamp = (value: number) => Math.min(view.state.doc.length, Math.max(0, value));
    view.dispatch({ selection: { anchor: clamp(start), head: clamp(end) }, scrollIntoView: true });
  }
}

export function ManuscriptEditor(props: {
  ref: Ref<EditorPort>; content: string; projectPath: string; label: string; placeholder: string;
  /** DOM id of the editable area; the main editor keeps "editor" for the skip link. */
  editorId?: string;
  preferences: WritingPreferences; onChange: (content: string) => void;
  onComposition: (active: boolean) => void; onKeyDown: (event: KeyboardEvent) => void;
  onImages: (files: File[], from: number, to: number) => void;
  onImageError: () => void;
  onImageSelect: (image: { from: number; to: number; name: string; alt: string } | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  const port = useMemo(() => new EditorPort(), []);
  const editorLinks = useMemo(() => createEditorLinks(props.projectPath), [props.projectPath]);
  const attributes = useMemo(() => new Compartment(), []);
  const fromProps = useRef(false);
  useImperativeHandle(props.ref, () => port, [port]);
  useLayoutEffect(() => {
    if (!host.current) return;
    const forward = (event: KeyboardEvent) => {
      const copy = new KeyboardEvent(event.type, { key: event.key, code: event.code, keyCode: event.keyCode, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey, isComposing: event.isComposing, cancelable: true });
      port.dispatchEvent(copy);
      if (copy.defaultPrevented) { event.preventDefault(); return true; }
      if (event.type === "keydown") current.current.onKeyDown(event);
      return event.defaultPrevented;
    };
    const view = new EditorView({ parent: host.current, state: EditorState.create({
      doc: current.current.content.replace(/\r\n?/g, "\n"),
      extensions: [history(), keymap.of([...historyKeymap, ...defaultKeymap]), EditorView.lineWrapping,
        placeholder(current.current.placeholder), editorLinks,
        attributes.of(EditorView.contentAttributes.of({ "aria-label": current.current.label, spellcheck: "true", id: current.current.editorId ?? "editor" })),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            if (!fromProps.current) current.current.onChange(update.state.doc.toString());
            port.dispatchEvent(new Event("input"));
          }
          if (update.selectionSet) {
            const selection = update.state.selection.main;
            const image = parseImages(update.state.doc.toString()).find((item) => item.start === selection.from && item.end === selection.to);
            current.current.onImageSelect(image ? { from: image.start, to: image.end, name: image.name, alt: image.alt } : null);
            port.dispatchEvent(new Event("select"));
          }
        }),
        // Completion must consume Enter/arrows before CodeMirror's default keymap.
        Prec.highest(EditorView.domEventHandlers({
          keydown: forward, keyup: forward,
          dragstart: (event) => {
            const image = event.target instanceof Element ? event.target.closest<HTMLImageElement>(".manuscript-image") : null;
            const from = Number(image?.dataset.imageFrom), to = Number(image?.dataset.imageTo);
            if (!image || !event.dataTransfer || !Number.isInteger(from) || !Number.isInteger(to)) return false;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(IMAGE_DRAG_TYPE, JSON.stringify({ from, to }));
            image.classList.add("is-dragging");
            return false;
          },
          dragend: (event) => {
            if (event.target instanceof Element) event.target.closest(".manuscript-image")?.classList.remove("is-dragging");
            return false;
          },
          paste: (event, editor) => {
            const dropped = Array.from(event.clipboardData?.files ?? []);
            const files = dropped.filter(isSupportedImageFile);
            if (dropped.length && !files.length) { event.preventDefault(); current.current.onImageError(); return true; }
            if (!files.length) return false;
            event.preventDefault();
            const selection = editor.state.selection.main;
            current.current.onImages(files, selection.from, selection.to);
            return true;
          },
          dragover: (event) => {
            const transfer = event.dataTransfer;
            const internal = Array.from(transfer?.types ?? []).includes(IMAGE_DRAG_TYPE);
            const external = Array.from(transfer?.items ?? []).some(item => item.kind === "file" && (!item.type || item.type.startsWith("image/")));
            if (!internal && !external) return false;
            event.preventDefault();
            if (transfer) transfer.dropEffect = internal ? "move" : "copy";
            return true;
          },
          drop: (event, editor) => {
            const encoded = event.dataTransfer?.getData(IMAGE_DRAG_TYPE);
            if (encoded) {
              event.preventDefault();
              try {
                const range = JSON.parse(encoded) as { from?: unknown; to?: unknown };
                if (typeof range.from !== "number" || typeof range.to !== "number") return true;
                const position = editor.posAtCoords({ x: event.clientX, y: event.clientY }) ?? editor.state.selection.main.from;
                const move = imageMove(editor.state.doc.toString(), range.from, range.to, position);
                if (move) editor.dispatch({ changes: move.changes, selection: { anchor: move.selection }, scrollIntoView: true, userEvent: "move" });
              } catch { /* Ignore malformed data from outside the editor. */ }
              return true;
            }
            const dropped = Array.from(event.dataTransfer?.files ?? []);
            const files = dropped.filter(isSupportedImageFile);
            if (dropped.length && !files.length) { event.preventDefault(); current.current.onImageError(); return true; }
            if (!files.length) return false;
            event.preventDefault();
            const position = editor.posAtCoords({ x: event.clientX, y: event.clientY }) ?? editor.state.selection.main.from;
            current.current.onImages(files, position, position);
            return true;
          },
          click: (event, editor) => {
            const image = event.target instanceof Element ? event.target.closest<HTMLImageElement>(".manuscript-image") : null;
            editor.dom.querySelectorAll(".manuscript-image.is-selected").forEach((element) => element.classList.remove("is-selected"));
            if (image) {
              const from = Number(image.dataset.imageFrom), to = Number(image.dataset.imageTo);
              if (Number.isInteger(from) && Number.isInteger(to)) {
                image.classList.add("is-selected");
                editor.dispatch({ selection: { anchor: from, head: to } });
                current.current.onImageSelect({ from, to, name: image.dataset.imageName ?? "", alt: image.alt });
              }
            } else current.current.onImageSelect(null);
            port.dispatchEvent(new Event("click"));
            return false;
          },
          compositionstart: () => { current.current.onComposition(true); port.dispatchEvent(new Event("compositionstart")); return false; },
          compositionend: () => { current.current.onComposition(false); port.dispatchEvent(new Event("compositionend")); return false; },
        })),
      ],
    }) });
    port.view = view;
    return () => { port.view = null; view.destroy(); current.current.onComposition(false); };
  }, [port, attributes, editorLinks]);
  useLayoutEffect(() => {
    const view = port.view;
    const content = props.content.replace(/\r\n?/g, "\n");
    if (!view || content === port.value) return;
    fromProps.current = true;
    try { view.dispatch({ changes: editorChange(port.value, content), annotations: isolateHistory.of("full") }); }
    finally { fromProps.current = false; }
  }, [props.content, port]);
  useLayoutEffect(() => { port.view?.dispatch({ effects: attributes.reconfigure(EditorView.contentAttributes.of({ "aria-label": props.label, spellcheck: "true", id: props.editorId ?? "editor" })) }); }, [props.label, port, attributes]);
  return <div ref={host} className={`manuscript-editor rich-manuscript font-${props.preferences.fontFamily}`}
    style={{ fontSize: `${props.preferences.fontSize}px`, lineHeight: props.preferences.lineHeight, letterSpacing: `${props.preferences.letterSpacing}em` }} />;
}
