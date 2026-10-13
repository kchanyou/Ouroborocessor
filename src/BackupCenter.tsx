import { useEffect, useRef, useState } from "react";
import { localizedError } from "./appText";
import { backupText } from "./backupText";
import { backupDue, backupSettingsKey, readBackupSettings, type BackupSettings } from "./backupSettings";
import { chooseFolder, listBackups, previewBackup, restoreBackup, type BackupEntry, type BackupReport } from "./tauriApi";
import type { Locale } from "./i18n";
import type { ProjectSnapshot } from "./types";

export function BackupCenter({ projectPath, locale, open, blocked, onClose, backup, onOpen, onFailure }: {
  projectPath: string; locale: Locale; open: boolean; blocked: boolean; onClose: () => void;
  backup: (destination: string) => Promise<BackupEntry>; onOpen: (path: string) => Promise<void>;
  onFailure: (message: string) => void;
}) {
  const t = backupText[locale];
  const [settings, setSettings] = useState(() => readBackupSettings(projectPath));
  const currentSettings = useRef(settings);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<BackupReport | null>(null);
  const [preview, setPreview] = useState<ProjectSnapshot | null>(null);
  const [selected, setSelected] = useState("");
  const [restored, setRestored] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const explain = (reason: unknown) => String(reason).includes("EXPORT_DESTINATION") ? t.destinationError
    : String(reason).includes("BACKUP_CHANGED") ? t.changed
    : /BACKUP_(INVALID|SYMLINK)/.test(String(reason)) ? t.invalidError : localizedError(reason, locale);
  function commit(next: BackupSettings) {
    currentSettings.current = next;
    if (mounted.current) setSettings(next);
    try { localStorage.setItem(backupSettingsKey(projectPath), JSON.stringify(next)); }
    catch { if (mounted.current) setError(t.settingsError); }
  }
  async function refresh(destination = currentSettings.current.destination) {
    const result = await listBackups(destination);
    if (mounted.current) setReport(result);
  }
  async function runBackup() {
    if (locked.current || blocked || !currentSettings.current.destination) return;
    locked.current = true; setBusy(true); setError("");
    const before = currentSettings.current;
    commit({ ...before, lastAttempt: Date.now() });
    try {
      const result = await backup(before.destination);
      commit({ ...currentSettings.current, lastSuccess: result.createdAt * 1000, lastPath: result.path, lastError: "" });
    } catch (reason) {
      commit({ ...currentSettings.current, lastError: String(reason) });
      if (mounted.current) setError(explain(reason));
      onFailure(`${t.failed}: ${explain(reason)}`);
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  const tick = useRef(() => {});
  tick.current = () => {
    if (projectPath && !blocked && !locked.current && !document.querySelector("dialog[open]") && backupDue(currentSettings.current, Date.now())) void runBackup();
  };
  useEffect(() => {
    const timer = window.setInterval(() => tick.current(), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    setPreview(null); setSelected(""); setRestored(""); setReport(null); setError("");
    let cancelled = false;
    if (currentSettings.current.destination) {
      void listBackups(currentSettings.current.destination).then(result => { if (!cancelled) setReport(result); })
        .catch(reason => { if (!cancelled) setError(explain(reason)); });
    }
    return () => { cancelled = true; };
  }, [open, settings.destination, settings.lastSuccess]);
  async function act(action: () => Promise<void>) {
    if (locked.current || blocked) return;
    locked.current = true; setBusy(true); setError("");
    try { await action(); }
    catch (reason) { if (mounted.current) setError(explain(reason)); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  if (!open) return null;
  return <dialog ref={dialog} className="new-project-dialog export-dialog backup-center" aria-labelledby="backup-title" onCancel={event => {
    if (locked.current) event.preventDefault(); else onClose();
  }}>
    <div className="new-project-panel">
      <h2 id="backup-title">{t.title}</h2><p>{t.description}</p>
      <fieldset disabled={busy || blocked} className="backup-controls">
        <label>{t.folder}<output className="backup-path">{settings.destination || t.none}</output></label>
        <button type="button" onClick={() => void act(async () => {
          const path = await chooseFolder(t.folder);
          if (!path) return;
          commit({ ...currentSettings.current, destination: path, enabled: false, lastAttempt: 0 });
          setReport(null); setPreview(null); setSelected("");
        })}>{t.choose}</button>
        <label className="check-row"><input type="checkbox" disabled={!projectPath || !settings.destination} checked={settings.enabled} onChange={event => {
          commit({ ...currentSettings.current, enabled: event.target.checked, lastAttempt: Date.now() });
        }} />{t.automatic}</label>
        <button type="button" disabled={!projectPath || !settings.destination} onClick={() => void runBackup()}>{t.now}</button>
      </fieldset>
      <p>{t.last}: {settings.lastSuccess ? new Date(settings.lastSuccess).toLocaleString(locale) : t.never}</p>
      {settings.lastPath && <p>{t.location}<span className="backup-path">{settings.lastPath}</span></p>}
      {settings.lastError && <p role="status">{t.failed}: {explain(settings.lastError)}</p>}
      <p className="help-text">{t.retention}</p>
      {error && <p role="alert">{error}</p>}
      <p role="status">{busy ? t.working : ""}</p>
      <div className="dialog-actions"><h3>{t.list}</h3><button type="button" disabled={busy || blocked || !settings.destination} onClick={() => void act(() => refresh())}>{t.refresh}</button></div>
      {report && <>
        {report.invalidCount > 0 && <p role="status">{t.invalid} {report.invalidCount}</p>}
        {!report.entries.length && <p>{t.empty}</p>}
        <ul className="recent-list backup-list">{report.entries.map(entry => <li key={entry.path}>
          <button type="button" disabled={busy || blocked} aria-pressed={selected === entry.path} onClick={() => void act(async () => {
            setPreview(null); setSelected(""); setRestored("");
            const snapshot = await previewBackup(entry.path);
            setPreview(snapshot); setSelected(entry.path);
          })}><strong>{entry.title}</strong><small>{new Date(entry.createdAt * 1000).toLocaleString(locale)} · {t.scenes}: {entry.scenes} · {t.preview}</small></button>
        </li>)}</ul>
      </>}
      {preview && <section aria-label={t.preview} className="backup-preview">
        <h3>{preview.title}</h3>
        {preview.nodes.filter(node => node.kind === "scene").map(node => <details key={node.id}><summary>{node.title}</summary><pre>{node.content}</pre></details>)}
        <button type="button" disabled={busy || blocked} onClick={() => void act(async () => {
          const destination = await chooseFolder(t.restoreFolder);
          if (destination) setRestored(await restoreBackup(selected, destination));
        })}>{t.restore}</button>
      </section>}
      {restored && <div role="status"><p>{t.restored}<span className="backup-path">{restored}</span></p><button type="button" disabled={busy || blocked} onClick={() => void act(async () => { await onOpen(restored); onClose(); })}>{t.open}</button></div>}
      <div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>{t.close}</button></div>
    </div>
  </dialog>;
}
