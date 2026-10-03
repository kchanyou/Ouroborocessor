import { useEffect, useRef, useState } from "react";
import type { Locale } from "./i18n";
import { translate } from "./i18n";
import { featureText } from "./featureText";
import { recentProjects } from "./workspaceSession";

export function RecentProjectsDialog({ locale, onOpen, onLocate, onClose }: {
  locale: Locale; onOpen: (path: string) => Promise<void>; onLocate: (oldPath?: string) => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const t = featureText[locale];
  const [projects] = useState(recentProjects);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function run(path?: string, locate = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFailed(null);
    try {
      if (locate) { if (await onLocate(path)) onClose(); }
      else if (path) { await onOpen(path); onClose(); }
    } catch { setFailed(path ?? ""); }
    finally { locked.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="new-project-dialog export-dialog" aria-labelledby="recent-project-title" onCancel={event => { if (locked.current) event.preventDefault(); else onClose(); }}>
    <div className="new-project-panel">
      <h2 id="recent-project-title">{t.recentProjects}</h2>
      {projects.length ? <ul className="recent-list">
        {projects.map(item => <li key={item.path}><button type="button" disabled={busy} onClick={() => void run(item.path)}>
          <strong>{item.title}</strong><small>{item.path}</small>
        </button></li>)}
      </ul> : <p>{t.noRecent}</p>}
      {failed !== null && <div className="recent-error" role="alert"><p>{t.missingProject}</p>
        <button type="button" disabled={busy} onClick={() => void run(failed || undefined, true)}>{t.reconnect}</button></div>}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onClose}>{translate(locale, "close")}</button>
        <button type="button" disabled={busy} onClick={() => void run(undefined, true)}>{t.openFolder}</button>
      </div>
    </div>
  </dialog>;
}
