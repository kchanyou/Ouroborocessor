import { useEffect, useMemo, useRef, useState } from "react";
import { writingToolsText } from "./writingToolsText";
import { revisionDiff } from "./revisionDiff";
import { translate, type Locale } from "./i18n";
import { localizedError } from "./appText";
import { HelpDetails } from "./HelpDetails";
import { listSceneVersions, restoreSceneVersion, type SceneVersion } from "./tauriApi";
import type { ManuscriptNode, ProjectSnapshot } from "./types";

export function HistoryDialog({ projectPath, scene, locale, persist, onRestored, onClose }: {
  projectPath: string; scene: ManuscriptNode; locale: Locale; persist: () => Promise<void>;
  onRestored: (project: ProjectSnapshot) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [versions, setVersions] = useState<SceneVersion[]>([]);
  const [corruptCount, setCorruptCount] = useState(0);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [compare, setCompare] = useState(false), [copied, setCopied] = useState(false);
  const [selection, setSelection] = useState("");
  const tools = writingToolsText[locale];
  const oldText = versions.find(version => version.id === selected)?.content ?? "";
  const changes = useMemo(() => compare ? revisionDiff(oldText, scene.content) : [], [compare, oldText, scene.content]);
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  useEffect(() => {
    dialog.current?.showModal();
    let cancelled = false;
    void listSceneVersions(projectPath, scene.id).then((report) => {
      if (!cancelled) { setVersions(report.versions); setCorruptCount(report.corruptCount); setSelected(report.versions[0]?.id ?? ""); }
    }).catch((e) => { if (!cancelled) setError(localizedError(e, locale)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectPath, scene.id]);
  async function restore() {
    if (locked.current || !selected) return;
    locked.current = true; setBusy(true); setError("");
    try {
      await persist();
      const next = await restoreSceneVersion(projectPath, scene.id, selected, `${scene.title} — ${t("historyCopy")}`);
      onRestored(next); onClose();
    } catch (e) { setError(localizedError(e, locale)); }
    finally { locked.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="new-project-dialog export-dialog" aria-labelledby="history-title" onCancel={(e) => { if (locked.current) e.preventDefault(); else onClose(); }}>
    <div className="new-project-panel">
      <h2 id="history-title">{t("sceneHistory")} · {scene.title}</h2>
      <p>{t("historyDescription")}</p>
      <HelpDetails locale={locale}>{t("historyDescriptionDetails")}</HelpDetails>
      {corruptCount > 0 && <p role="alert">{translate(locale, "historyCorrupt", { count: corruptCount })}</p>}
      {loading ? <p role="status">{t("working")}</p> : versions.length ? <>
        <label htmlFor="history-version">{t("sceneHistory")}</label>
        <select id="history-version" disabled={busy} value={selected} onChange={(e) => { setSelected(e.target.value); setSelection(""); setCopied(false); }}>
          {versions.map((v) => <option key={v.id} value={v.id}>{new Date(v.createdAt * 1000).toLocaleString(locale)}</option>)}
        </select>
        <label className="check-row"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} />{tools.compare}</label>
        {compare && <><p className="diff-legend"><ins>{tools.added}</ins><del>{tools.removed}</del></p><pre className="revision-diff" tabIndex={0} aria-label={tools.compare}>{changes.map((part, i) => part.kind === "added" ? <ins key={i}>{part.text}</ins> : part.kind === "removed" ? <del key={i}>{part.text}</del> : <span key={i}>{part.text}</span>)}</pre>{oldText === scene.content && <p>{tools.noChanges}</p>}</>}
        <textarea className="history-preview" aria-label={t("historyPreview")} readOnly value={oldText} onSelect={event => { setSelection(event.currentTarget.value.slice(event.currentTarget.selectionStart, event.currentTarget.selectionEnd)); setCopied(false); }} />
        <div className="history-tools">
          <button type="button" disabled={!selection} onClick={() => { void navigator.clipboard.writeText(selection).then(() => setCopied(true)).catch(reason => setError(localizedError(reason, locale))); }}>{tools.copySelection}</button>
          <span role="status">{copied ? tools.copied : ""}</span>
        </div>
        <p>{t("historyRestoreHint")}</p>
      </> : !error && <p>{t("historyEmpty")}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onClose}>{t("close")}</button>
        {!loading && versions.length > 0 && <button type="button" className="primary" disabled={busy} onClick={() => void restore()}>{busy ? t("working") : t("historyRestore")}</button>}
      </div>
    </div>
  </dialog>;
}
