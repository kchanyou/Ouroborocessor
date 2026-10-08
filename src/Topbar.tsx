import { AppIcon as Icon } from "./AppIcon";
import { ToolbarMore } from "./ToolbarMore";
import { ActionMenu } from "./ActionMenu";
import { uxText } from "./uxText";
import type { Locale } from "./i18n";
import type { Translate } from "./appText";
import type { SaveState } from "./types";
import { shortcutLabel, shortcuts } from "./shortcuts";

export function Topbar({ t, locale, isMac, busy, hasProject, title, saveState, saveText, canFind, state, actions }: {
  t: Translate; locale: Locale; isMac: boolean; busy: boolean; hasProject: boolean; title: string;
  saveState: SaveState; saveText: string; canFind: boolean;
  state: { navigator: boolean; inspector: boolean; focus: boolean; find: boolean; research: boolean };
  actions: {
    newProject: () => void; newScene: () => void; backupProject: () => void; toggleNavigator: () => void; openAnother: () => void; exportProject: () => void;
    projectSearch: () => void; research: () => void; toggleFind: () => void;
    toggleFocus: () => void; toggleInspector: () => void; settings: () => void;
  };
}) {
  const ux = uxText[locale];
  const inspectorLabel = state.inspector ? t("hideInspector") : t("showInspector");
  const focusLabel = state.focus ? t("exitFocusMode") : t("focusMode");
  // collapse: width tier where it goes into the overflow menu (workspace.css)
  const trailingTools = [
    { id: "find", collapse: "md", icon: "search", label: ux.findScene, title: t("findReplace"), pressed: state.find, run: actions.toggleFind, disabled: !canFind },
    { id: "research", collapse: "md", icon: "book", label: ux.research, title: `${t("referencePanel")} (${shortcutLabel(shortcuts.openResearch, isMac)})`, pressed: state.research, run: actions.research, disabled: !hasProject },
    { id: "focus", collapse: "md", icon: "focus", label: focusLabel, title: focusLabel, pressed: state.focus, run: actions.toggleFocus, disabled: false },
    { id: "inspector", collapse: "lg", icon: "inspector", label: inspectorLabel, title: inspectorLabel, pressed: state.inspector, run: actions.toggleInspector, disabled: false },
    { id: "settings", collapse: "sm", icon: "settings", label: t("settings"), title: `${t("settings")} (${isMac ? "⌘," : "Ctrl+,"})`, pressed: undefined, run: actions.settings, disabled: false },
  ] as const;
  const sidebarLabel = state.navigator ? t("hideSidebar") : t("showSidebar");

  return <header inert={busy} className="topbar">
    <div className="toolbar-group toolbar-leading">
      <button type="button" className="toolbar-button icon-only" onClick={actions.toggleNavigator} aria-pressed={state.navigator} aria-label={sidebarLabel} title={sidebarLabel}>
        <Icon name="sidebar" />
      </button>
      <ActionMenu label={ux.project} className="project-menu">
        <button type="button" onClick={actions.newProject}>{t("newManuscript")}</button>
        <button type="button" onClick={actions.openAnother}>{t("openAnother")}</button>
        <hr />
        <button type="button" disabled={!hasProject} onClick={actions.exportProject}>{ux.exportManuscript}</button>
        <button type="button" disabled={!hasProject} onClick={actions.backupProject}>{ux.backupProject}</button>
      </ActionMenu>
      <button type="button" className="toolbar-button new-scene-button" disabled={!hasProject} onClick={actions.newScene} aria-label={ux.newScene}>
        <Icon name="add" /><span>{ux.newScene}</span>
      </button>
    </div>

    <div className="document-identity" aria-label={`${title}, ${saveText}`}>
      <strong>{title}</strong>
      <span className={`save-state ${saveState}`} role="status">{saveText}</span>
    </div>

    <nav aria-label={t("viewTools")} className="toolbar-group toolbar-trailing">
      <button type="button" className="toolbar-button" disabled={!hasProject} aria-label={t("projectSearch")} title={`${t("projectSearch")} (${isMac ? "⌘⇧F" : "Ctrl+Shift+F"})`} onClick={actions.projectSearch}><Icon name="searchAll" /><span>{ux.searchProject}</span></button>
      {trailingTools.map((tool) => <button key={tool.id} type="button" disabled={tool.disabled} className={`toolbar-button ${tool.id === "find" ? "" : "icon-only"} overflow-${tool.collapse}`} onClick={tool.run} aria-pressed={tool.pressed} aria-label={tool.label} title={tool.title}><Icon name={tool.icon} />{tool.id === "find" && <span>{tool.label}</span>}</button>)}
      <ToolbarMore locale={locale}>
        {trailingTools.map((tool) => <button key={tool.id} type="button" disabled={tool.disabled} className={`toolbar-button overflow-${tool.collapse}`} onClick={tool.run} aria-pressed={tool.pressed} title={tool.title}><Icon name={tool.icon} /><span>{tool.label}</span></button>)}
      </ToolbarMore>
    </nav>
  </header>;
}
