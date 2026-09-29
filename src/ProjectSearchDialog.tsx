import { useEffect, useRef, useState } from "react";
import { translate, type Locale } from "./i18n";
import { searchProject, type ProjectMatch } from "./projectSearch";
import type { ProjectSnapshot } from "./types";
import { ProjectReplacePreview } from "./ProjectReplacePreview";
import type { BatchChange, BatchResult } from "./projectReplace";
import { BatchHistoryPanel, historyText } from "./BatchHistoryPanel";

export function ProjectSearchDialog({ project, locale, onNavigate, onClose, errorMessage, onApply, onUndo, canUndo, onRestore }: {
  project: ProjectSnapshot; locale: Locale; onNavigate: (hit: ProjectMatch) => Promise<void>;
  onClose: () => void; errorMessage: (reason: unknown) => string;
  onApply: (changes: BatchChange[]) => Promise<BatchResult>; onUndo: () => Promise<BatchResult>; canUndo: boolean;
  onRestore: (journalId: string, sceneId: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof searchProject> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"search" | "preview" | "history">("search");
  const [batchStatus, setBatchStatus] = useState("");
  const [journal, setJournal] = useState("");
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  useEffect(() => { dialog.current?.showModal(); }, []);
  function close() { dialog.current?.close(); onClose(); }
  async function openHit(hit: ProjectMatch) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await onNavigate(hit); close(); }
    catch (reason) { setError(String(reason).includes("SEARCH_STALE") ? t("projectSearchStale") : errorMessage(reason)); }
    finally { locked.current = false; setBusy(false); }
  }
  async function runBatch(changes?: BatchChange[]) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setBatchStatus("");
    try {
      const result = changes ? await onApply(changes) : await onUndo();
      setResult(null); setJournal(result.journalPath);
      setBatchStatus(t(changes ? "batchApplied" : "batchUndone", { count: result.completed.length }));
      if (result.error) setError(`${t("batchPartial", { title: project.nodes.find((node) => node.id === result.failedScene)?.title ?? result.failedScene ?? "" })} ${errorMessage(result.error)}`);
    } catch (reason) {
      const detail = String(reason).startsWith("SAVE_CONFLICT: ") ? String(reason).slice("SAVE_CONFLICT: ".length) : "";
      setError(String(reason).includes("SEARCH_STALE") ? t("projectSearchStale") : `${errorMessage(reason)} ${detail}`);
    } finally { locked.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="new-project-dialog project-search-dialog" aria-labelledby="project-search-title"
    onCancel={(event) => { if (locked.current) event.preventDefault(); else onClose(); }}>
    <div className="new-project-panel">
      <h2 id="project-search-title">{t("projectSearch")}</h2><p>{t("projectSearchHelp")}</p>
      <div role="group" aria-label={t("projectSearch")} className="overview-view segmented">
        <button type="button" disabled={busy} aria-pressed={mode === "search"} onClick={() => setMode("search")}>{t("projectSearchRun")}</button>
        <button type="button" disabled={busy} aria-pressed={mode === "preview"} onClick={() => setMode("preview")}>{t("projectReplacePreview")}</button>
        <button type="button" disabled={busy} aria-pressed={mode === "history"} onClick={() => { setError(""); setBatchStatus(""); setJournal(""); setMode("history"); }}>{historyText[locale][0]}</button>
      </div>
      {mode === "history" ? <BatchHistoryPanel project={project} locale={locale} busy={busy} onRestore={async (journalId, sceneId) => {
        if (locked.current) return;
        locked.current = true; setBusy(true); setError("");
        try { await onRestore(journalId, sceneId); close(); }
        catch (reason) { setError(errorMessage(reason)); }
        finally { locked.current = false; setBusy(false); }
      }} /> : mode === "preview" ? <ProjectReplacePreview nodes={project.nodes} locale={locale} busy={busy} onApply={(changes) => runBatch(changes)} onUndo={() => runBatch()} canUndo={canUndo} /> : <>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy) { setResult(searchProject(project.nodes, query, matchCase)); setError(""); } }}>
        <label className="overview-search">{t("findText")}<input autoFocus type="search" value={query} disabled={busy}
          onChange={(event) => { setQuery(event.target.value); setResult(null); }}
          onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }} /></label>
        <label className="overview-descendants"><input type="checkbox" checked={matchCase} disabled={busy} onChange={(event) => { setMatchCase(event.target.checked); setResult(null); }} />{t("matchCase")}</label>
        <button type="submit" className="primary" disabled={busy || !query}>{t("projectSearchRun")}</button>
      </form>
      <p role="status">{result ? t("projectSearchCount", { count: result.count, scenes: result.scenes }) : t("projectSearchPrompt")}</p>
      {result && result.count > result.hits.length && <p>{t("projectSearchLimit", { count: result.hits.length })}</p>}
      <ol className="project-search-results">
        {result?.hits.map((hit) => <li key={`${hit.sceneId}:${hit.start}`}><button type="button" disabled={busy} onClick={() => void openHit(hit)}>
          <strong>{hit.title}</strong><span>{hit.source.slice(Math.max(0, hit.start - 40), hit.start)}<mark>{hit.source.slice(hit.start, hit.end)}</mark>{hit.source.slice(hit.end, hit.end + 60)}</span>
        </button></li>)}
      </ol>
      </>}
      {error && <p role="alert">{error}</p>}
      {batchStatus && <p role="status">{batchStatus}</p>}
      {journal && <p className="export-path">{t("batchJournal")} <code>{journal}</code></p>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={close}>{t("close")}</button></div>
    </div>
  </dialog>;
}
