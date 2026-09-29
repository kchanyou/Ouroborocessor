import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type ReactNode,
  type SetStateAction,
} from "react";
import { localeOptions, translate, type Locale } from "./i18n";
import { localizedError, type Translate } from "./appText";
import { exportScope } from "./exportScope";
import { type AppPreferences } from "./preferences";
import { ProjectSceneSaveError } from "./projectSave";
import {
  chooseFolder,
  createProject,
  exportDocx,
  exportProject,
} from "./tauriApi";
import type { ProjectSnapshot } from "./types";
import { HelpDetails } from "./HelpDetails";

type NewProjectDialogProps = {
  locale: Locale;
  onCreated: (project: ProjectSnapshot) => void;
  onClose: () => void;
};

export function NewProjectDialog({ locale, onCreated, onClose }: NewProjectDialogProps) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const t: Translate = (key, values) => translate(locale, key, values);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const path = await chooseFolder(t("chooseProjectFolder"));
      if (path) {
        onCreated(await createProject(path, title, t("firstGroup"), t("firstScene")));
      }
    } catch (reason) {
      setError(localizedError(reason, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="new-project-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form onSubmit={create} className="new-project-panel">
        <h2>{t("newManuscript")}</h2>
        <label htmlFor="project-title">{t("manuscriptTitle")}</label>
        <input
          id="project-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoFocus
          required
          disabled={busy}
        />
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>{t("close")}</button>
          <button className="primary" disabled={busy || !title.trim()}>
            {busy ? t("preparing") : t("createManuscript")}
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </dialog>
  );
}

type ExportDialogProps = {
  project: ProjectSnapshot;
  selectedId: string | null;
  persist: () => Promise<void>;
  locale: Locale;
  onClose: () => void;
};

export function ExportDialog({ project, selectedId, persist, locale, onClose }: ExportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"backup" | "docx">("backup");
  const [rootId, setRootId] = useState<string | null>(null);
  const [paperSize, setPaperSize] = useState<"a4" | "letter">("a4");
  const [marginPreset, setMarginPreset] = useState<"narrow" | "normal" | "wide">("normal");
  const scope = useMemo(() => exportScope(project.nodes, rootId), [project.nodes, rootId]);
  const t: Translate = (key, values) => translate(locale, key, values);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function runExport() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setResult("");
    try {
      await persist();
      const destination = await chooseFolder(t("exportDestination"));
      if (!destination) return;
      const output = format === "docx"
        ? await exportDocx(project.projectPath, destination, rootId, paperSize, marginPreset)
        : await exportProject(project.projectPath, destination);
      setResult(output);
    } catch (reason) {
      if (reason instanceof ProjectSceneSaveError) {
        const detail = reason.stage === "recovery"
          ? t("recoveryFailed")
          : localizedError(reason.reason, locale);
        setError(`${t("exportSaveFailed", { title: reason.sceneTitle })} ${detail}`);
      } else if (String(reason).includes("EXPORT_DESTINATION")) {
        setError(t("exportInvalid"));
      } else if (String(reason).includes("EXPORT_INVALID_CHARACTER")) {
        setError(t("exportCharacterError"));
      } else if (String(reason).includes("EXPORT_PAGE_OPTIONS")) {
        setError(t("exportPageError"));
      } else {
        setError(localizedError(reason, locale));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="new-project-dialog export-dialog"
      aria-labelledby="export-title"
      aria-describedby="export-description"
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault();
        else onClose();
      }}
    >
      <div className="new-project-panel">
        <h2 id="export-title">{t("exportProject")}</h2>
        <label htmlFor="export-format">{t("exportFormat")}</label>
        <select
          id="export-format"
          disabled={busy}
          value={format}
          onChange={(event) => {
            setFormat(event.target.value as "backup" | "docx");
            setResult("");
            setError("");
          }}
        >
          <option value="backup">{t("backupFormat")}</option>
          <option value="docx">DOCX</option>
        </select>
        <p id="export-description">{t(format === "docx" ? "docxDescription" : "exportDescription")}</p>
        <HelpDetails locale={locale}>{t(format === "docx" ? "docxDescriptionDetails" : "exportDescriptionDetails")}</HelpDetails>
        <p>{t("exportSaveAll")}</p>
        {format === "docx" && (
          <>
            <label htmlFor="export-scope">{t("exportScope")}</label>
            <select
              id="export-scope"
              disabled={busy}
              value={rootId ?? ""}
              onChange={(event) => {
                setRootId(event.target.value || null);
                setResult("");
              }}
            >
              <option value="">{t("wholeProject")}</option>
              {selectedId && (
                <option value={selectedId}>
                  {t("selectedSubtree")} · {project.nodes.find((node) => node.id === selectedId)?.title}
                </option>
              )}
            </select>
            <label htmlFor="export-paper-size">{t("paperSize")}</label>
            <select
              id="export-paper-size"
              disabled={busy}
              value={paperSize}
              onChange={(event) => {
                setPaperSize(event.target.value as "a4" | "letter");
                setResult("");
              }}
            >
              <option value="a4">{t("paperA4")}</option>
              <option value="letter">{t("paperLetter")}</option>
            </select>
            <label htmlFor="export-page-margins">{t("pageMargins")}</label>
            <select
              id="export-page-margins"
              disabled={busy}
              value={marginPreset}
              onChange={(event) => {
                setMarginPreset(event.target.value as "narrow" | "normal" | "wide");
                setResult("");
              }}
            >
              <option value="narrow">{t("marginNarrow")}</option>
              <option value="normal">{t("marginNormal")}</option>
              <option value="wide">{t("marginWide")}</option>
            </select>
            <p>{t("exportSceneCount", { count: scope.filter(({ node }) => node.kind === "scene").length })}</p>
            <ol className="export-outline" aria-label={t("exportOrder")}>
              {scope.map(({ node, depth }) => (
                <li key={node.id} style={{ paddingInlineStart: `${Math.min(depth, 8) * 12}px` }}>
                  {node.title}
                </li>
              ))}
            </ol>
          </>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onClose}>{t("close")}</button>
          <button type="button" className="primary" disabled={busy} onClick={() => void runExport()}>
            {busy ? t("working") : t("exportStart")}
          </button>
        </div>
        <div role="status">
          {result && (
            <>
              <p>{t(format === "docx" ? "docxDone" : "exportDone")}</p>
              <code className="export-path">{result}</code>
            </>
          )}
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </dialog>
  );
}

type SettingsDialogProps = {
  preferences: AppPreferences;
  setPreferences: Dispatch<SetStateAction<AppPreferences>>;
  onClose: () => void;
  t: Translate;
  workspaceSection?: ReactNode;
  editorSection?: ReactNode;
};

export function SettingsDialog({ preferences, setPreferences, onClose, t, workspaceSection, editorSection }: SettingsDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled])",
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function update<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header className="settings-header">
          <h2 id="settings-title">{t("settings")}</h2>
          <button ref={closeRef} type="button" className="dialog-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </header>

        <div className="settings-content">
          <section className="settings-section" aria-labelledby="general-settings">
            <h3 id="general-settings">{t("general")}</h3>
            <label className="setting-row">
              <span>{t("language")}</span>
              <select value={preferences.locale} onChange={(event) => update("locale", event.target.value as Locale)}>
                {localeOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </label>
            <label className="setting-row">
              <span>{t("theme")}</span>
              <select value={preferences.theme} onChange={(event) => update("theme", event.target.value as AppPreferences["theme"])}>
                <option value="system">{t("themeSystem")}</option>
                <option value="light">{t("themeLight")}</option>
                <option value="dark">{t("themeDark")}</option>
              </select>
            </label>
          </section>

          {editorSection}

          {workspaceSection}

          <section className="settings-section" aria-labelledby="accessibility-settings">
            <h3 id="accessibility-settings">{t("accessibility")}</h3>
            <label className="switch-row compact-switch">
              <span>{t("reduceMotion")}</span>
              <input type="checkbox" checked={preferences.reduceMotion} onChange={(event) => update("reduceMotion", event.target.checked)} />
            </label>
            <label className="switch-row compact-switch">
              <span>{t("reduceTransparency")}</span>
              <input type="checkbox" checked={preferences.reduceTransparency} onChange={(event) => update("reduceTransparency", event.target.checked)} />
            </label>
            <label className="switch-row compact-switch">
              <span>{t("increaseContrast")}</span>
              <input type="checkbox" checked={preferences.increaseContrast} onChange={(event) => update("increaseContrast", event.target.checked)} />
            </label>
          </section>

          <section className="settings-section storage-section" aria-labelledby="storage-settings">
            <h3 id="storage-settings">{t("storageAndPrivacy")}</h3>
            <p>{t("storageDescription")}</p>
          </section>
        </div>
      </section>
    </div>
  );
}
