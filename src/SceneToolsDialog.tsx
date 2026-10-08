import { useEffect, useMemo, useRef, useState } from "react";
import { translate, type Locale } from "./i18n";
import { localizedError } from "./appText";
import { writingToolsText } from "./writingToolsText";
import { importScenes, readImportFiles, type ImportSource } from "./importManuscript";
import { listManuscriptTrash, type ManuscriptTrashItem, type SceneOperation } from "./tauriApi";
import type { ManuscriptNode, ProjectSnapshot } from "./types";
import { ImportScenePreview } from "./ImportScenePreview";

export type SceneTool = "import" | "split" | "merge" | "trash" | "restore";
export function SceneToolsDialog({ mode, project, selected, nextScene, offset, locale, onApply, onClose }: {
  mode: SceneTool; project: ProjectSnapshot; selected: ManuscriptNode | null; nextScene: ManuscriptNode | null; offset: number;
  locale: Locale; onApply: (operation: SceneOperation) => Promise<void>; onClose: () => void;
}) {
  const t = writingToolsText[locale];
  const dialog = useRef<HTMLDialogElement>(null), locked = useRef(false), fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [sources, setSources] = useState<ImportSource[]>([]), [split, setSplit] = useState(false);
  const [title, setTitle] = useState(selected?.title ?? "");
  const [trash, setTrash] = useState<ManuscriptTrashItem[]>([]);
  const label = { import: t.importManuscript, split: t.splitScene, merge: t.mergeNext, trash: t.moveTrash, restore: t.manuscriptTrash }[mode];
  const preview = useMemo(() => { try { return { scenes: importScenes(sources, split), error: "" }; } catch { return { scenes: [], error: t.invalidImport }; } }, [sources, split, t]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (mode !== "restore") return;
    let cancelled = false;
    setBusy(true);
    listManuscriptTrash(project.projectPath).then(value => { if (!cancelled) setTrash(value); }).catch(reason => { if (!cancelled) setError(localizedError(reason, locale)); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [mode, project.projectPath, locale]);
  async function apply(operation: SceneOperation) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await onApply(operation); onClose(); }
    catch (reason) {
      const code = String(reason);
      setError(code.includes("SCENE_OPERATION_CONFLICT") ? t.operationConflict : code.includes("SCENE_OPERATION_INVALID") ? t.operationInvalid : code.includes("SCENE_RESTORE_PARENT") ? t.restoreParent : localizedError(reason, locale));
    } finally { locked.current = false; setBusy(false); }
  }
  function commit() {
    if (mode === "import") void apply({ type: "import", parent: selected?.kind === "group" ? selected.id : selected?.parentId ?? null, scenes: preview.scenes });
    if (mode === "split" && selected) void apply({ type: "split", id: selected.id, offset, title });
    if (mode === "merge" && selected && nextScene) void apply({ type: "merge", id: selected.id, next: nextScene.id });
    if (mode === "trash" && selected) void apply({ type: "trash", id: selected.id });
  }
  const invalid = mode === "import" ? !preview.scenes.length || !!preview.error : mode === "split" ? !title.trim() || offset <= 0 || offset >= (selected?.content.length ?? 0) : mode === "merge" ? !nextScene : !selected;
  return <dialog ref={dialog} className="new-project-dialog export-dialog" aria-labelledby="scene-tools-title" onCancel={event => { if (locked.current) event.preventDefault(); else onClose(); }}>
    <div className="new-project-panel">
      <h2 id="scene-tools-title">{label}</h2>
      {mode === "import" ? <>
        <p>{t.importHint}</p>
        <div className="file-picker">
          <input ref={fileInput} className="hidden-file-input" type="file" accept=".txt,.md,.markdown" multiple tabIndex={-1} aria-hidden="true" onChange={event => {
            const files = Array.from(event.target.files ?? []); event.target.value = "";
            if (!files.length) return;
            setBusy(true); setError("");
            void readImportFiles(files).then(setSources).catch(() => { setSources([]); setError(t.invalidImport); }).finally(() => setBusy(false));
          }} />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{t.chooseFiles}</button>
          {sources.length > 0 && <span>{sources.map(source => source.name).join(", ")}</span>}
        </div>
        <label className="check-row"><input type="checkbox" checked={split} disabled={busy} onChange={event => setSplit(event.target.checked)} />{t.splitHeadings}</label>
        {preview.scenes.length > 0 && <>
          <p className="import-preview-hint">{t.previewHint}</p>
          <ol className="import-preview">{preview.scenes.map((scene, i) => <ImportScenePreview key={`${i}:${scene.title}`} scene={scene} locale={locale} />)}</ol>
        </>}
        {preview.error && <p role="alert">{preview.error}</p>}
      </> : mode === "restore" ? <>
        {!busy && !trash.length && <p>{t.emptyTrash}</p>}
        {trash.length > 0 && <ul className="trash-list">{trash.map(item => <li key={item.id}>
          <span><strong>{item.title}</strong><small>{item.parentAvailable ? translate(locale, "itemCount", { count: item.count }) : t.restoreParent}</small></span>
          <button type="button" disabled={busy || !item.parentAvailable} onClick={() => void apply({ type: "restore", id: item.id })}>{t.restore}</button>
        </li>)}</ul>}
      </>
      : <>
        <p>{selected?.title}{nextScene && mode === "merge" ? ` + ${nextScene.title}` : ""}</p>
        <p>{mode === "split" ? t.splitHint : mode === "merge" ? t.mergeHint : t.operationHint}</p>
        {mode === "split" && <label>{t.splitTitle}<input value={title} disabled={busy} onChange={event => setTitle(event.target.value)} /></label>}
      </>}
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{translate(locale, "close")}</button>
        {mode !== "restore" && <button type="button" className="primary" disabled={busy || invalid} onClick={commit}>{mode === "import" ? t.importAction : label}</button>}
      </div>
    </div>
  </dialog>;
}
