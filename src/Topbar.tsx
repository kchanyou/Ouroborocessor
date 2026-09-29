import { AppIcon as Icon } from "./AppIcon";
import { ToolbarMore } from "./ToolbarMore";
import type { Locale } from "./i18n";
import type { Translate } from "./appText";
import type { SaveState } from "./types";
import { shortcutLabel, shortcuts } from "./shortcuts";

export function Topbar({ t, locale, isMac, busy, hasProject, title, saveState, saveText, canFind, state, actions }: {
  t: Translate; locale: Locale; isMac: boolean; busy: boolean; hasProject: boolean; title: string;
  saveState: SaveState; saveText: string; canFind: boolean;
  state: { navigator: boolean; inspector: boolean; focus: boolean; find: boolean; research: boolean };
  actions: {
    newProject: () => void; toggleNavigator: () => void; openAnother: () => void; exportProject: () => void;
    projectSearch: () => void; research: () => void; toggleFind: () => void;
    toggleFocus: () => void; toggleInspector: () => void; settings: () => void;
  };
}) {
  const inspectorLabel = state.inspector ? t("hideInspector") : t("showInspector");
  const focusLabel = state.focus ? t("exitFocusMode") : t("focusMode");
  // `collapse` names the width tier at which a tool leaves the toolbar for the overflow menu (see workspace.css).
  const trailingTools = [
    { id: "focus", collapse: "md", icon: "focus", label: focusLabel, title: focusLabel, pressed: state.focus, run: actions.toggleFocus },
    { id: "inspector", collapse: "lg", icon: "inspector", label: inspectorLabel, title: inspectorLabel, pressed: state.inspector, run: actions.toggleInspector },
    { id: "settings", collapse: "sm", icon: "settings", label: t("settings"), title: `${t("settings")} (${isMac ? "⌘," : "Ctrl+,"})`, pressed: undefined, run: actions.settings },
  ] as const;
  const sidebarLabel = state.navigator ? t("hideSidebar") : t("showSidebar");

  return <header inert={busy} className="topbar">
    <div className="toolbar-group toolbar-leading">
      <button type="button" className="toolbar-button icon-only" aria-label={t("newManuscript")} title={t("newManuscript")} onClick={actions.newProject}><Icon name="add" /></button>
      <button type="button" className="toolbar-button icon-only" onClick={actions.toggleNavigator} aria-pressed={state.navigator} aria-label={sidebarLabel} title={sidebarLabel}>
        <Icon name="sidebar" />
      </button>
      <button type="button" className="toolbar-button" onClick={actions.openAnother} title={t("openAnother")}>
        <Icon name="folder" /><span>{t("open")}</span>
      </button>
      <button type="button" className="toolbar-button" disabled={!hasProject} onClick={actions.exportProject} title={t("exportProject")} aria-label={t("exportProject")}>
        <Icon name="document" /><span>{t("exportProject")}</span>
      </button>
    </div>

    <div className="document-identity" aria-label={`${title}, ${saveText}`}>
      <strong>{title}</strong>
      <span className={`save-state ${saveState}`} role="status">{saveText}</span>
    </div>

    <nav aria-label={t("viewTools")} className="toolbar-group toolbar-trailing">
      <button type="button" className="toolbar-button icon-only" disabled={!hasProject} aria-label={t("projectSearch")} title={`${t("projectSearch")} (${isMac ? "⌘⇧F" : "Ctrl+Shift+F"})`} onClick={actions.projectSearch}><Icon name="searchAll" /></button>
      <button type="button" className="toolbar-button icon-only" disabled={!hasProject} aria-label={t("referencePanel")} title={`${t("referencePanel")} (${shortcutLabel(shortcuts.openResearch, isMac)})`} aria-pressed={state.research} onClick={actions.research}><Icon name="book" /></button>
      <button type="button" className="toolbar-button icon-only" disabled={!canFind} aria-label={t("findReplace")} title={t("findReplace")} aria-pressed={state.find} onClick={actions.toggleFind}><Icon name="search" /></button>
      {trailingTools.map((tool) => <button key={tool.id} type="button" className={`toolbar-button icon-only overflow-${tool.collapse}`} onClick={tool.run} aria-pressed={tool.pressed} aria-label={tool.label} title={tool.title}><Icon name={tool.icon} /></button>)}
      <ToolbarMore locale={locale}>
        {trailingTools.map((tool) => <button key={tool.id} type="button" className={`toolbar-button overflow-${tool.collapse}`} onClick={tool.run} aria-pressed={tool.pressed} title={tool.title}><Icon name={tool.icon} /><span>{tool.label}</span></button>)}
      </ToolbarMore>
    </nav>
  </header>;
}
