import { useRef, useState } from "react";
import type { Locale } from "./i18n";
import { translate } from "./i18n";
import { featureText } from "./featureText";
import { forgetProject, recentProjects, restoreRecentProject, type RecentProject } from "./workspaceSession";
import { searchText } from "./quickOpen";
import { projectOpenFeedback, type ProjectOpenStage } from "./projectOpenFeedback";
import { useModalDialog } from "./useModalDialog";

export function RecentProjectsDialog({ locale, beforeOpen, onOpen, onLocate, onClose }: {
  locale: Locale; beforeOpen: () => Promise<void>; onOpen: (path: string) => Promise<void>; onLocate: (oldPath?: string) => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useModalDialog();
  const search = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ path?: string; stage: ProjectOpenStage; message: string } | null>(null);
  const [query, setQuery] = useState("");
  const [removed, setRemoved] = useState<{ project: RecentProject; index: number } | null>(null);
  const t = featureText[locale];
  const [projects, setProjects] = useState(recentProjects);
  const matches = projects.filter(item => searchText(`${item.title} ${item.path}`, query));
  async function run(path?: string, locate = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFailure(null);
    let stage: ProjectOpenStage = "save";
    try {
      await beforeOpen();
      stage = "open";
      if (locate) {
        if (await onLocate(path)) onClose();
        else setFailure(failure);
      }
      else if (path) { await onOpen(path); onClose(); }
    } catch (reason) { setFailure({ path, stage, message: projectOpenFeedback(reason, locale, stage) }); }
    finally { locked.current = false; setBusy(false); }
  }
  function remove(item: RecentProject) {
    const next = forgetProject(item.path);
    if (next.some(project => project.path === item.path)) return;
    setRemoved({ project: item, index: projects.findIndex(project => project.path === item.path) });
    setProjects(next);
    if (failure?.path === item.path) setFailure(null);
    search.current?.focus();
  }
  return <dialog ref={dialog} className="new-project-dialog export-dialog" aria-labelledby="recent-project-title" onCancel={event => { if (locked.current) event.preventDefault(); else onClose(); }}>
    <div className="new-project-panel">
      <h2 id="recent-project-title">{t.recentProjects}</h2>
      <input ref={search} type="search" autoFocus aria-label={t.searchProjects} placeholder={t.searchProjects} value={query} disabled={busy} onChange={event => setQuery(event.target.value)} />
      <p className="recent-hint">{t.recentHint}</p>
      {matches.length ? <ul className="recent-list">
        {matches.map(item => <li key={item.path}><button type="button" className="recent-open" disabled={busy} onClick={() => void run(item.path)}>
          <strong>{item.title}</strong><small>{item.path}</small>
        </button><button type="button" className="recent-remove" disabled={busy} aria-label={`${t.removeRecent}: ${item.title} · ${item.path}`} title={t.removeRecent} onClick={() => remove(item)}>×</button></li>)}
      </ul> : <p role="status">{query.trim() ? t.noMatchingProjects : t.noRecent}</p>}
      {removed && <div className="recent-undo"><p role="status">{removed.project.title} · {t.removedRecent}</p>
        <button type="button" disabled={busy} onClick={() => { setProjects(restoreRecentProject(removed.project, removed.index)); setRemoved(null); search.current?.focus(); }}>{t.undoRemove}</button></div>}
      {failure && <div className="recent-error" role="alert"><p>{failure.message}</p>
        {failure.stage === "open" && <button type="button" disabled={busy} onClick={() => void run(failure.path, true)}>{t.reconnect}</button>}</div>}
      {busy && <p role="status">{translate(locale, "working")}</p>}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onClose}>{translate(locale, "close")}</button>
        <button type="button" disabled={busy} onClick={() => void run(undefined, true)}>{t.openFolder}</button>
      </div>
    </div>
  </dialog>;
}
