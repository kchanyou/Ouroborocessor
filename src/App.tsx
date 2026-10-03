import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { AppIcon as Icon } from "./AppIcon";
import { Topbar } from "./Topbar";
import { ExportDialog, NewProjectDialog, SettingsDialog } from "./AppDialogs";
import {
  imageDropText,
  isCompactViewport,
  localizedError,
  statusLabel,
  type Translate,
} from "./appText";
import { PanelResize, WorkspaceControls } from "./WorkspaceControls";
import { EditorAppearanceSettings, editorAppearanceStyle } from "./EditorAppearance";
import { InspectorPanel } from "./InspectorPanel";
import { SideEditor } from "./SideEditor";
import { ManuscriptNavigator } from "./ManuscriptNavigator";
import { startTabDrag, type TabDragState } from "./tabDrag";
import { layoutKey, layoutText, readLayout, sideWidthRange } from "./workspaceLayout";
import {
  addNode,
  applyBatchEdit,
  bootstrapProject,
  chooseFolder,
  indentNode,
  moveNode,
  openProject,
  outdentNode,
  reparentNode,
  saveScene,
  preserveConflictCopy,
  restoreBatchCopy,
  listRecoveryDrafts,
  writeRecoveryDraft,
  clearRecoveryDraft,
  importImage,
  saveImage,
  updateNode,
  undoProjectEdit,
} from "./tauriApi";
import { translate } from "./i18n";
import {
  defaultAppPreferences,
  defaultWritingPreferences,
  normalizeWritingPreferences,
  detectPlatform,
  loadPreferences,
  savePreferences,
  type WritingPreferences,
} from "./preferences";
import { getCharacterCount, getTextMetrics } from "./textMetrics";
import { FindPanel } from "./FindPanel";
import { DocumentTabs, tabText, type PaneId, type ReferenceTab } from "./DocumentTabs";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ResourceLinks } from "./ResourceLinkPanel";
import { ManuscriptEditor, type EditorPort } from "./ManuscriptEditor";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import { readSession, saveSession, rememberProject, relocateSession, insertTab, type ClosedTab, type ReferenceSession } from "./workspaceSession";
import { quickOpenDocuments } from "./quickOpen";
import { featureText } from "./featureText";
import { RecentProjectsDialog } from "./RecentProjectsDialog";
import { SceneToolsDialog, type SceneTool } from "./SceneToolsDialog";
import { applySceneOperation, listResourceCards, type SceneOperation } from "./tauriApi";
import { writingToolsText } from "./writingToolsText";
import "./writingTools.css";
import { WritingGoals } from "./WritingGoalsPanel";
import { recordWriting } from "./writingGoals";
import { matchesShortcut, shortcutLabel, shortcuts } from "./shortcuts";
import { isSupportedImageFile, logicalDropPoint, supportedImagePaths } from "./imageDrop";
import { removeImage, updateImageAlt } from "./manuscriptImages";
import { CloseSaveCoordinator } from "./closeSafety";
import { readableResourceText } from "./resourceLinks";
import type { ResourceCard } from "./types";
import { GroupOverview } from "./GroupOverview";
import { validateBatchSnapshot, type BatchChange } from "./projectReplace";
import { editorMatchOffsets, type ProjectMatch } from "./projectSearch";
import { recoverProjectDrafts, writeDraft, clearSavedDraft } from "./draftRecovery";
import type { RecoveryDraftEntry } from "./draftRecovery";
import { AsyncDraftMirror } from "./asyncDraftMirror";
import { treeKeyboardAction } from "./treeKeyboard";
import { mergeProjectStructure, persistProjectScenes, ProjectSceneSaveError } from "./projectSave";
import type { ManuscriptNode, NodeKind, ProjectSnapshot, SaveState } from "./types";
import { storageKeys } from "./storageKeys";
import {
  flattenTree,
  type DropPlacement,
  type PointerDragState,
  type TreeDropTarget,
} from "./projectTree";

const HistoryDialog = lazy(() => import("./HistoryDialog").then((module) => ({ default: module.HistoryDialog })));
const ReferencePanel = lazy(() => import("./ReferencePanel").then((module) => ({ default: module.ReferencePanel })));
const ProjectSearchDialog = lazy(() => import("./ProjectSearchDialog").then((module) => ({ default: module.ProjectSearchDialog })));

const SAVE_DELAY_MS = 450;
const APP_PREFERENCES_KEY = storageKeys.appPreferences;
const WRITING_PREFERENCES_KEY = storageKeys.writingPreferences;

function App() {
  const metricsCache = useRef(new WeakMap<ManuscriptNode, number>());
  function nodeMetrics(node: ManuscriptNode) {
    const cached = metricsCache.current.get(node);
    if (cached !== undefined) return cached;
    const next = getCharacterCount(readableResourceText(node.content));
    metricsCache.current.set(node, next);
    return next;
  }
  const [appPreferences, setAppPreferences] = useState(() =>
    loadPreferences(APP_PREFERENCES_KEY, defaultAppPreferences),
  );
  const [writingPreferences, setWritingPreferences] = useState(() =>
    normalizeWritingPreferences(loadPreferences(WRITING_PREFERENCES_KEY, defaultWritingPreferences)),
  );
  const [project, setProject] = useState<ProjectSnapshot | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [documentTabs, setDocumentTabs] = useState<string[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<string[]>([]);
  const [recentProjectsOpen, setRecentProjectsOpen] = useState(false);
  const [sceneTool, setSceneTool] = useState<{ mode: SceneTool; offset: number } | null>(null);
  const closedTabs = useRef<ClosedTab[]>([]);
  useEffect(() => {
    setDocumentTabs(current => {
      const valid = current.filter(id => project?.nodes.some(node => node.id === id));
      return selectedNodeId && project?.nodes.some(node => node.id === selectedNodeId) && !valid.includes(selectedNodeId) ? [...valid, selectedNodeId] : valid;
    });
  }, [selectedNodeId, project?.projectPath, project?.nodes.length]);
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(() => new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState("");
  const [layout, setLayout] = useState(readLayout);
  const [showNavigator, setShowNavigator] = useState(layout.navigator);
  const [showInspector, setShowInspector] = useState(layout.inspector);
  const [focusMode, setFocusMode] = useState(false);
  useEffect(() => {
    if (!focusMode) { try { localStorage.setItem(layoutKey, JSON.stringify({ ...layout, navigator: showNavigator, inspector: showInspector })); } catch { /* ignore */ } }
  }, [layout, showNavigator, showInspector, focusMode]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // shared by both panes, each pane has its own key order
  const [referenceTabs, setReferenceTabs] = useState<Array<ReferenceTab & { card: ResourceCard | null }>>([]);
  const [mainReferenceKeys, setMainReferenceKeys] = useState<string[]>([]);
  const [activeReferenceKey, setActiveReferenceKey] = useState<string | null>(null);
  // same keys as main tabs. a doc can be open in both panes (one in-memory copy)
  const [sideTabs, setSideTabs] = useState<string[]>([]);
  const [sideActiveKey, setSideActiveKey] = useState<string | null>(null);
  const [tabDrag, setTabDrag] = useState<TabDragState | null>(null);
  const tabDropActions = useRef({ toSide: (_key: string) => {}, toMain: (_key: string) => {} });
  const [paletteMode, setPaletteMode] = useState<"commands" | "files" | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [nativeImageDrag, setNativeImageDrag] = useState(false);
  const nativeDragHasImages = useRef(false);
  const [selectedImage, setSelectedImage] = useState<{ sceneId: string; from: number; to: number; name: string; alt: string } | null>(null);
  const [imageAltDraft, setImageAltDraft] = useState("");
  const [conflict, setConflict] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [compositionEpoch, setCompositionEpoch] = useState(0);
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [batchUndo, setBatchUndo] = useState<{ path: string; changes: BatchChange[] } | null>(null);
  const liveProject = useRef(project);
  liveProject.current = project;
  const [searchSelection, setSearchSelection] = useState<ProjectMatch | null>(null);
  const historyBusyRef = useRef(false);
  const metadataQueue = useRef<Promise<unknown>>(Promise.resolve());
  const metadataBaselines = useRef(new Map<string, Pick<ManuscriptNode, "title" | "status" | "synopsis">>());
  const diskContents = useRef(new Map<string, string>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const editRevision = useRef(0);
  const [treeQuery, setTreeQuery] = useState("");
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TreeDropTarget | null>(null);
  const [dragGhost, setDragGhost] = useState<{
    x: number;
    y: number;
    title: string;
    kind: NodeKind;
  } | null>(null);
  const isComposing = useRef(false);
  const previousPanels = useRef({ navigator: true, inspector: true });
  const editorRef = useRef<EditorPort>(null);
  const sideEditorRef = useRef<EditorPort>(null);
  const closeCoordinator = useRef(new CloseSaveCoordinator());
  const nativeRecovery = useRef(new AsyncDraftMirror());
  const closeSaveRef = useRef<() => Promise<void>>(async () => {});
  const closeErrorRef = useRef<(reason: unknown) => void>(() => {});
  const pointerDragRef = useRef<PointerDragState | null>(null);
  const dropTargetRef = useRef<TreeDropTarget | null>(null);
  const platform = useMemo(() => detectPlatform(), []);
  const isMac = platform === "apple" && /Macintosh|Mac OS X/.test(navigator.userAgent);
  const locale = appPreferences.locale;
  const features = featureText[locale];
  const toolsText = writingToolsText[locale];
  const t = useCallback<Translate>((key, values) => translate(locale, key, values), [locale]);
  const dropT = imageDropText[locale];
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const selectedNode = useMemo(
    () => project?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [project, selectedNodeId],
  );
  const selectedScene = selectedNode?.kind === "scene" ? selectedNode : null;
  const activeReference = referenceTabs.find((tab) => tab.key === activeReferenceKey) ?? null;
  const activeTabKey = activeReferenceKey ?? (selectedNodeId ? `node:${selectedNodeId}` : null);
  const tabOrder = useMemo(() => [
    ...documentTabs.map((id) => `node:${id}`),
    ...mainReferenceKeys.filter((key) => referenceTabs.some((tab) => tab.key === key)),
  ], [documentTabs, mainReferenceKeys, referenceTabs]);
  const mainReferences = useMemo(() => mainReferenceKeys.flatMap((key) => referenceTabs.find((tab) => tab.key === key) ?? []), [mainReferenceKeys, referenceTabs]);
  const sideNodes = useMemo(() => sideTabs.flatMap((key) => project?.nodes.find((node) => `node:${node.id}` === key) ?? []), [sideTabs, project?.nodes]);
  const sideReferences = useMemo(() => referenceTabs.filter((tab) => sideTabs.includes(tab.key)), [referenceTabs, sideTabs]);
  const sideKeys = [...sideNodes.map((node) => `node:${node.id}`), ...sideReferences.map((tab) => tab.key)];
  const sideActive = sideActiveKey && sideKeys.includes(sideActiveKey) ? sideActiveKey : sideKeys.at(-1) ?? null;
  const sideActiveReference = sideReferences.find((tab) => tab.key === sideActive) ?? null;
  const sideActiveNode = sideNodes.find((node) => `node:${node.id}` === sideActive) ?? null;
  // side pane scene is editable even if main shows the same one
  const sideEditScene = sideActiveNode?.kind === "scene" ? sideActiveNode : null;
  const tabT = tabText[locale];
  const sceneNodes = useMemo(
    () => project?.nodes.filter((node) => node.kind === "scene") ?? [],
    [project],
  );
  const sceneNumber = selectedScene
    ? sceneNodes.findIndex((node) => node.id === selectedScene.id) + 1
    : 0;
  const metrics = useMemo(
    () => getTextMetrics(readableResourceText(selectedScene?.content ?? "")),
    [selectedScene?.content],
  );
  const flatTree = useMemo(
    () => flattenTree(project?.nodes ?? [], collapsedNodes, treeQuery),
    [project?.nodes, collapsedNodes, treeQuery],
  );
  const treeTabStopId = flatTree.some(({ node }) => node.id === selectedNodeId)
    ? selectedNodeId
    : flatTree[0]?.node.id ?? null;
  const siblings = useMemo(
    () => project?.nodes.filter((node) => node.parentId === selectedNode?.parentId) ?? [],
    [project?.nodes, selectedNode?.parentId],
  );
  const siblingIndex = selectedNode
    ? siblings.findIndex((node) => node.id === selectedNode.id)
    : -1;
  const previousSibling = siblingIndex > 0 ? siblings[siblingIndex - 1] : null;
  const canIndent = previousSibling?.kind === "group";
  const canOutdent = Boolean(selectedNode?.parentId);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale;
    root.dataset.platform = platform;
    root.dataset.theme = appPreferences.theme;
    root.dataset.motion = appPreferences.reduceMotion ? "reduce" : "system";
    root.dataset.transparency = appPreferences.reduceTransparency ? "reduce" : "system";
    root.dataset.contrast = appPreferences.increaseContrast ? "more" : "system";
    savePreferences(APP_PREFERENCES_KEY, appPreferences);
  }, [appPreferences, locale, platform]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--editor-width", `${writingPreferences.editorWidth}px`);
    savePreferences(WRITING_PREFERENCES_KEY, writingPreferences);
  }, [writingPreferences]);

  const acceptProject = useCallback((next: ProjectSnapshot, nativeDrafts: RecoveryDraftEntry[] = [], nativeRecoveryError = false, cards?: ResourceCard[]) => {
    const recovery = recoverProjectDrafts(next, diskContents.current, nativeDrafts);
    const { recovered, recoveryError } = recovery;
    next = recovery.project;
    const firstScene = next.nodes.find((node) => node.kind === "scene");
    const last = loadPreferences(storageKeys.lastProject, { path: "", nodeId: "" });
    const restored = last.path === next.projectPath ? next.nodes.find((node) => node.id === last.nodeId) : null;
    const session = readSession(next);
    if (session && cards) {
      session.references = session.references.flatMap((ref): ReferenceSession[] => {
        if (!ref.card) return [{ ...ref, title: tabText[loadPreferences(APP_PREFERENCES_KEY, defaultAppPreferences).locale].resources }];
        const card = cards.find(card => card.id === ref.card?.id && !card.deleted);
        return card ? [{ key: ref.key, title: card.name, card }] : [];
      });
      const valid = (key: string) => key.startsWith("node:") || session.references.some(ref => ref.key === key);
      session.main = session.main.filter(valid); session.side = session.side.filter(valid);
      if (session.active && !session.main.includes(session.active)) session.active = session.main.at(-1) ?? null;
      if (session.sideActive && !session.side.includes(session.sideActive)) session.sideActive = session.side.at(-1) ?? null;
    }
    closedTabs.current = [];
    setRecentDocuments(session?.recent ?? []);
    rememberProject({ path: next.projectPath, title: next.title });
    setProject(next);
    metadataBaselines.current = new Map(next.nodes.map((node) => [JSON.stringify([next.projectPath, node.id]), { title: node.title, status: node.status, synopsis: node.synopsis }]));
    setReferenceTabs(session?.references ?? []);
    setMainReferenceKeys(session?.main.filter(key => key.startsWith("reference:")) ?? []);
    setActiveReferenceKey(session?.active?.startsWith("reference:") ? session.active : null);
    setSideTabs(session?.side ?? []);
    setSideActiveKey(session?.sideActive ?? null);
    setSelectedImage(null);
    setPaletteMode(null);
    setBatchUndo(null);
    setDocumentTabs(session?.main.filter(key => key.startsWith("node:")).map(key => key.slice(5)) ?? []);
    savePreferences(storageKeys.lastProject, { path: next.projectPath });
    setCollapsedNodes(new Set(session?.collapsed ?? []));
    setTreeQuery("");
    setSelectedNodeId(session ? (session.active?.startsWith("node:") ? session.active.slice(5) : null) : restored?.id ?? firstScene?.id ?? next.nodes[0]?.id ?? null);
    if (session) { setLayout(session.layout); setShowNavigator(session.layout.navigator); setShowInspector(session.layout.inspector); }
    setSaveState(recovered ? "dirty" : "saved");
    setConflict(false);
    const activeLocale = loadPreferences(APP_PREFERENCES_KEY, defaultAppPreferences).locale;
    setError(recoveryError || nativeRecoveryError ? translate(activeLocale, "recoveryFailed") : recovered ? translate(activeLocale, "draftRecovered") : "");
    if (isCompactViewport()) {
      setShowNavigator(false);
      setShowInspector(false);
    }
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!project) return;
    saveSession(project.projectPath, {
      main: tabOrder, side: sideTabs, active: activeTabKey, sideActive: sideActiveKey,
      collapsed: [...collapsedNodes], recent: recentDocuments, references: referenceTabs,
      layout: { ...layout, navigator: focusMode ? previousPanels.current.navigator : showNavigator, inspector: focusMode ? previousPanels.current.inspector : showInspector },
    });
  }, [project?.projectPath, tabOrder, sideTabs, activeTabKey, sideActiveKey, collapsedNodes, recentDocuments, referenceTabs, layout, showNavigator, showInspector, focusMode]);

  useEffect(() => {
    if (selectedNodeId) setRecentDocuments(current => [selectedNodeId, ...current.filter(id => id !== selectedNodeId)].slice(0, 100));
  }, [selectedNodeId]);

  const acceptProjectWithRecovery = useCallback(async (next: ProjectSnapshot) => {
    const [drafts, resources] = await Promise.allSettled([listRecoveryDrafts(next.projectPath), listResourceCards(next.projectPath)]);
    acceptProject(next, drafts.status === "fulfilled" ? drafts.value : [], drafts.status === "rejected", resources.status === "fulfilled" ? resources.value : undefined);
  }, [acceptProject]);

  useEffect(() => {
    if (project && selectedNodeId) {
      savePreferences(storageKeys.lastProject, { path: project.projectPath, nodeId: selectedNodeId });
    }
  }, [project?.projectPath, selectedNodeId]);

  useEffect(() => {
    let cancelled = false;
    const last = loadPreferences(storageKeys.lastProject, { path: "" });
    async function restore() {
      try {
        const next = last.path ? await openProject(last.path)
          : await bootstrapProject(t("newManuscript"), t("firstGroup"), t("firstScene"));
        if (!cancelled) await acceptProjectWithRecovery(next);
      } catch (reason) { if (!cancelled) setError(localizedError(reason, locale)); }
    }
    void restore();
    return () => { cancelled = true; };
  }, [acceptProjectWithRecovery]); // once only, language change shouldn't reopen

  const persistSelected = useCallback(async () => {
    if (!project) return;
    // save side pane scene too if dirty
    const sideBase = sideEditScene ? diskContents.current.get(JSON.stringify([project.projectPath, sideEditScene.id])) : undefined;
    const sideChanged = sideEditScene && sideEditScene.id !== selectedScene?.id && sideBase !== undefined && sideBase !== sideEditScene.content;
    const scenes = [selectedScene, sideChanged ? sideEditScene : null].filter((scene): scene is ManuscriptNode => Boolean(scene));
    if (!scenes.length) return;
    const revision = editRevision.current;
    setSaveState("saving");
    const pending = saveQueue.current.catch(() => {}).then(async () => {
      for (const scene of scenes) {
        const key = JSON.stringify([project.projectPath, scene.id]);
        try {
          await saveScene(project.projectPath, scene.id, scene.content,
            diskContents.current.get(key) ?? scene.content);
        } catch (reason) {
          setSaveState("error");
          // conflict copy is main editor only
          if (String(reason).includes("SAVE_CONFLICT") && scene.id === selectedScene?.id) setConflict(true);
          throw reason;
        }
        diskContents.current.set(key, scene.content);
        try { clearSavedDraft(project.projectPath, scene.id, scene.content); }
        catch { setError(t("recoveryFailed")); }
        try {
          await nativeRecovery.current.then(key, () => clearRecoveryDraft(project.projectPath, scene.id, scene.content));
        } catch (reason) {
          setError(t("recoveryFailed"));
          throw reason;
        }
      }
    });
    saveQueue.current = pending;
    await pending;
    setSaveState(revision === editRevision.current ? "saved" : "dirty");
  }, [project?.projectPath, selectedScene, sideEditScene, t]);

  const persistForExport = async () => {
    if (!project) return;
    // metadata saves share the body queue, wait outside or it deadlocks
    await metadataQueue.current;
    const revision = editRevision.current;
    setSaveState("saving");
    const pending = saveQueue.current.catch(() => {}).then(async () => {
      await persistProjectScenes(project, diskContents.current, saveScene);
      for (const scene of project.nodes) {
        if (scene.kind !== "scene") continue;
        const key = JSON.stringify([project.projectPath, scene.id]);
        try {
          await nativeRecovery.current.then(key, () => clearRecoveryDraft(project.projectPath, scene.id, scene.content));
        } catch (reason) {
          throw new ProjectSceneSaveError(scene.title, reason, "recovery");
        }
      }
    });
    saveQueue.current = pending;
    try {
      await pending;
      setSaveState(revision === editRevision.current ? "saved" : "dirty");
    } catch (reason) {
      setSaveState("error");
      // error can be about another scene, don't offer conflict copy here
      throw reason;
    }
  };
  closeSaveRef.current = persistForExport;
  closeErrorRef.current = (reason) => {
    historyBusyRef.current = false;
    setHistoryBusy(false);
    setSaveState("error");
    setError(localizedError(reason, locale));
  };

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const appWindow = getCurrentWindow();
    void appWindow.onCloseRequested((event) => {
      event.preventDefault();
      historyBusyRef.current = true;
      setHistoryBusy(true);
      setSaveState("saving");
      void closeCoordinator.current.request(
        () => closeSaveRef.current(),
        () => appWindow.destroy(),
      ).catch((reason) => closeErrorRef.current(reason));
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    if ((!selectedScene && !sideEditScene) || saveState !== "dirty" || isComposing.current) return;
    const timer = window.setTimeout(() => {
      if (isComposing.current) return;
      void persistSelected().catch((reason) => {
        setSaveState("error");
        setError(localizedError(reason, locale));
      });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [locale, saveState, selectedScene, sideEditScene, persistSelected, compositionEpoch]);

  function openReference(card: ResourceCard | null = null, target?: PaneId) {
    if (!project) return;
    setSelectedImage(null);
    const key = card ? `reference:${card.id}` : "reference:library";
    const title = card?.name ?? tabText[locale].resources;
    setReferenceTabs((current) => current.some((tab) => tab.key === key)
      ? current.map((tab) => tab.key === key ? { key, title, card } : tab)
      : [...current, { key, title, card }]);
    // open on the side (single pane if narrow)
    const pane: PaneId = target ?? (sideTabs.includes(key) ? "side" : mainReferenceKeys.includes(key) || isCompactViewport() ? "main" : "side");
    if (pane === "side") {
      setSideTabs((current) => current.includes(key) ? current : [...current, key]);
      setSideActiveKey(key);
    } else {
      setMainReferenceKeys((current) => current.includes(key) ? current : [...current, key]);
      setActiveReferenceKey(key);
    }
    if (window.matchMedia("(max-width: 1050px)").matches) setShowInspector(false);
    if (isCompactViewport()) setShowNavigator(false);
    if (focusMode) toggleFocusMode();
  }

  function activateTab(key: string) {
    if (key.startsWith("node:")) {
      const node = project?.nodes.find((item) => item.id === key.slice(5));
      if (node) void selectNode(node);
      return;
    }
    if (mainReferenceKeys.includes(key)) setActiveReferenceKey(key);
  }

  function cycleTab(direction: 1 | -1) {
    if (!tabOrder.length) return;
    const current = Math.max(0, tabOrder.indexOf(activeTabKey ?? ""));
    activateTab(tabOrder[(current + direction + tabOrder.length) % tabOrder.length]);
  }

  function focusMainFallback(key: string) {
    if (activeTabKey !== key) return;
    const fallback = tabOrder.filter((item) => item !== key).at(-1) ?? null;
    if (!fallback) { setActiveReferenceKey(null); setSelectedNodeId(null); return; }
    if (fallback.startsWith("node:")) { setActiveReferenceKey(null); setSelectedNodeId(fallback.slice(5)); }
    else setActiveReferenceKey(fallback);
  }

  function removeFromMain(key: string) {
    if (key.startsWith("node:")) setDocumentTabs((current) => current.filter((id) => `node:${id}` !== key));
    else setMainReferenceKeys((current) => current.filter((item) => item !== key));
    focusMainFallback(key);
  }

  async function closeTab(key: string) {
    try { await persistSelected(); } catch (reason) { setError(localizedError(reason, locale)); return; }
    if (tabOrder.includes(key)) closedTabs.current.push({ key, pane: "main", index: key.startsWith("node:") ? documentTabs.indexOf(key.slice(5)) : mainReferenceKeys.indexOf(key), reference: referenceTabs.find(tab => tab.key === key) });
    removeFromMain(key);
  }

  async function reopenClosedTab() {
    try { await persistSelected(); } catch (reason) { setError(localizedError(reason, locale)); return; }
    let tab = closedTabs.current.pop();
    while (tab && tab.key.startsWith("node:") && !project?.nodes.some(node => `node:${node.id}` === tab!.key)) tab = closedTabs.current.pop();
    if (!tab) return;
    const restored = tab;
    if (restored.reference) setReferenceTabs(current => current.some(item => item.key === restored.key) ? current : [...current, restored.reference!]);
    if (restored.pane === "side") { setSideTabs(current => insertTab(current, restored.key, restored.index)); setSideActiveKey(restored.key); }
    else if (restored.key.startsWith("node:")) {
      setDocumentTabs(current => insertTab(current, restored.key.slice(5), restored.index));
      setActiveReferenceKey(null); setSelectedNodeId(restored.key.slice(5));
    } else { setMainReferenceKeys(current => insertTab(current, restored.key, restored.index)); setActiveReferenceKey(restored.key); }
  }

  // move=false keeps it in main too. last tab never gets moved out
  async function openToSide(key: string, move = false) {
    try { await persistSelected(); } catch (reason) { setError(localizedError(reason, locale)); return; }
    setSideTabs((current) => current.includes(key) ? current : [...current, key]);
    setSideActiveKey(key);
    if (move && tabOrder.length > 1) removeFromMain(key);
  }

  async function switchSideTab(key: string | null, then?: () => void) {
    try { await persistSelected(); } catch (reason) { setError(localizedError(reason, locale)); return; }
    if (key) {
      setSideActiveKey(key);
      if (key.startsWith("node:")) setRecentDocuments(current => [key.slice(5), ...current.filter(id => id !== key.slice(5))].slice(0, 100));
    }
    then?.();
  }

  function moveToMain(key: string, move = true) {
    if (move) setSideTabs((current) => current.filter((item) => item !== key));
    if (key.startsWith("node:")) {
      const node = project?.nodes.find((item) => `node:${item.id}` === key);
      if (node) void selectNode(node);
    } else {
      setMainReferenceKeys((current) => current.includes(key) ? current : [...current, key]);
      setActiveReferenceKey(key);
    }
  }

  function closeSideTab(key: string) {
    void switchSideTab(null, () => {
      if (sideTabs.includes(key)) closedTabs.current.push({ key, pane: "side", index: sideTabs.indexOf(key), reference: referenceTabs.find(tab => tab.key === key) });
      setSideTabs((current) => current.filter((item) => item !== key));
    });
  }

  // main empty -> side tabs move over
  useEffect(() => {
    if (!project || tabOrder.length || !sideKeys.length) return;
    const keys = sideKeys;
    const active = sideActive;
    setSideTabs([]);
    setDocumentTabs(keys.filter((key) => key.startsWith("node:")).map((key) => key.slice(5)));
    setMainReferenceKeys(keys.filter((key) => !key.startsWith("node:")));
    if (active?.startsWith("node:")) { setActiveReferenceKey(null); setSelectedNodeId(active.slice(5)); }
    else setActiveReferenceKey(active);
  }, [project, tabOrder.length, sideKeys.join("|"), sideActive]);

  // drop unused reference tabs
  useEffect(() => {
    setReferenceTabs((current) => {
      const next = current.filter((tab) => mainReferenceKeys.includes(tab.key) || sideTabs.includes(tab.key));
      return next.length === current.length ? current : next;
    });
  }, [mainReferenceKeys, sideTabs]);

  // drag moves, split button copies
  tabDropActions.current = { toSide: (key) => { void openToSide(key, true); }, toMain: (key) => moveToMain(key, true) };

  function beginTabDrag(key: string, title: string, from: PaneId, event: ReactPointerEvent<HTMLButtonElement>) {
    startTabDrag(key, title, from, event, setTabDrag, (target) => {
      if (target === "side" && from === "main") tabDropActions.current.toSide(key);
      if (target === "main" && from === "side") tabDropActions.current.toMain(key);
    });
  }

  async function insertImageEntries(entries: Array<{ alt: string; save: () => Promise<string> }>, start: number, end: number) {
    const editor = editorRef.current;
    const path = project?.projectPath;
    const sceneId = selectedScene?.id;
    if (!editor || !path || !sceneId || isComposing.current || !entries.length) return;
    const before = editor.value;
    try {
      const inserts: string[] = [];
      for (const entry of entries) inserts.push(`![${entry.alt.replace(/[\[\]\r\n]/g, " ")}](${await entry.save()})`);
      if (liveProject.current?.projectPath !== path || editorRef.current !== editor || editor.value !== before
        || liveProject.current?.nodes.find((node) => node.id === sceneId)?.content.replace(/\r\n?/g, "\n") !== before) throw new Error("IMAGE_DOCUMENT_CHANGED");
      const inserted = inserts.join("\n");
      updateContent(before.slice(0, start) + inserted + before.slice(end));
      if (selectedImage?.sceneId === sceneId && selectedImage.from === start && selectedImage.to === end) setSelectedImage(null);
      setAnnouncement(dropT.added.replace("{count}", String(entries.length)));
      requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(start + inserted.length, start + inserted.length); });
    } catch { setError(dropT.failed); }
  }

  async function insertImages(files: File[], start = editorRef.current?.selectionStart ?? 0, end = editorRef.current?.selectionEnd ?? start) {
    const path = project?.projectPath;
    if (!path) return;
    await insertImageEntries(files.map((file) => ({
      alt: file.name,
      save: async () => {
        if (!isSupportedImageFile(file) || file.size > 10 * 1024 * 1024) throw new Error("IMAGE_SIZE");
        return saveImage(path, Array.from(new Uint8Array(await file.arrayBuffer())));
      },
    })), start, end);
  }

  async function insertDroppedImages(paths: string[], start: number, end: number) {
    const projectPath = project?.projectPath;
    if (!projectPath) return;
    await insertImageEntries(paths.map((sourcePath) => ({
      alt: sourcePath.split(/[\\/]/).at(-1) ?? "image",
      save: () => importImage(projectPath, sourcePath),
    })), start, end);
  }

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "enter") {
        nativeDragHasImages.current = Boolean(selectedScene && !activeReferenceKey && supportedImagePaths(payload.paths).length);
        setNativeImageDrag(nativeDragHasImages.current);
        return;
      }
      if (payload.type === "over") return;
      setNativeImageDrag(false);
      if (payload.type === "leave") { nativeDragHasImages.current = false; return; }
      const paths = supportedImagePaths(payload.paths);
      nativeDragHasImages.current = false;
      if (payload.paths.length && !paths.length) { setError(dropT.unsupported); return; }
      const editor = editorRef.current;
      if (!editor || !selectedScene || activeReferenceKey || !paths.length) return;
      const host = document.querySelector<HTMLElement>(".editor-region:not([hidden]) .manuscript-editor");
      if (!host) return;
      const rect = host.getBoundingClientRect();
      const point = logicalDropPoint(payload.position, window.devicePixelRatio || 1, rect);
      if (!point) return;
      const at = editor.posAtCoords(point.x, point.y) ?? editor.selectionStart;
      void insertDroppedImages(paths, at, at);
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; }).catch(() => {});
    return () => { disposed = true; unlisten?.(); setNativeImageDrag(false); };
  }, [activeReferenceKey, dropT, project?.projectPath, selectedScene?.id]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (historyBusyRef.current) return;
      if (event.isComposing) return;
      const insideDialog = event.target instanceof Element && Boolean(event.target.closest('dialog, [role="dialog"]'));
      if (!insideDialog && matchesShortcut(event, shortcuts.commandPalette, isMac)) {
        event.preventDefault(); setPaletteMode("commands"); return;
      }
      if (!insideDialog && matchesShortcut(event, shortcuts.quickOpen, isMac)) {
        event.preventDefault(); setPaletteMode("files"); return;
      }
      if (insideDialog) return;
      if (matchesShortcut(event, shortcuts.reopenTab, isMac)) { event.preventDefault(); void reopenClosedTab(); return; }
      if (matchesShortcut(event, shortcuts.closeTab, isMac) && activeTabKey) { event.preventDefault(); void closeTab(activeTabKey); return; }
      if (matchesShortcut(event, shortcuts.nextTab, isMac)) { event.preventDefault(); cycleTab(1); return; }
      if (matchesShortcut(event, shortcuts.previousTab, isMac)) { event.preventDefault(); cycleTab(-1); return; }
      if (matchesShortcut(event, shortcuts.insertImage, isMac) && selectedScene && !activeReferenceKey) { event.preventDefault(); imageInputRef.current?.click(); return; }
      if (matchesShortcut(event, shortcuts.openResearch, isMac) && project) { event.preventDefault(); openReference(); return; }
      if (matchesShortcut(event, shortcuts.splitRight, isMac) && activeTabKey) { event.preventDefault(); void openToSide(activeTabKey); return; }
      if (matchesShortcut(event, shortcuts.toggleSidebar, isMac)) { event.preventDefault(); toggleNavigator(); return; }
      if ((isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.shiftKey && !event.altKey && /^[1-9]$/.test(event.key)) {
        const key = tabOrder[Number(event.key) - 1];
        if (key) { event.preventDefault(); activateTab(key); }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f" && project
        ) {
        event.preventDefault(); setProjectSearchOpen(true); return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f" && selectedScene
        ) {
        event.preventDefault(); setFindOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistSelected().catch((reason) => {
          setSaveState("error");
          setError(localizedError(reason, locale));
        });
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [activeReferenceKey, activeTabKey, focusMode, isMac, locale, persistSelected, project, selectedScene, showInspector, showNavigator, tabOrder, referenceTabs, sideTabs, mainReferenceKeys]);

  // Counting a long scene is expensive, so goal progress is recorded once typing pauses,
  // as one change from the first unrecorded text to the latest text per scene.
  const pendingGoalEdits = useRef(new Map<string, { path: string; before: string; after: string }>());
  const goalTimer = useRef<number | undefined>(undefined);
  const flushGoalRecords = useCallback(() => {
    window.clearTimeout(goalTimer.current);
    for (const { path, before, after } of pendingGoalEdits.current.values()) recordWriting(path, before, after);
    pendingGoalEdits.current.clear();
  }, []);
  function queueGoalRecord(path: string, sceneId: string, before: string, after: string) {
    const key = JSON.stringify([path, sceneId]);
    const pending = pendingGoalEdits.current.get(key);
    pendingGoalEdits.current.set(key, { path, before: pending?.before ?? before, after });
    window.clearTimeout(goalTimer.current);
    goalTimer.current = window.setTimeout(flushGoalRecords, 1500);
  }
  useEffect(() => {
    window.addEventListener("pagehide", flushGoalRecords);
    return () => { window.removeEventListener("pagehide", flushGoalRecords); flushGoalRecords(); };
  }, [flushGoalRecords]);

  function updateContent(content: string) {
    if (selectedScene) updateSceneContent(selectedScene.id, content);
  }

  // recovery draft first, then project state
  function updateSceneContent(sceneId: string, content: string) {
    const scene = project?.nodes.find((node) => node.id === sceneId && node.kind === "scene");
    if (!scene || !project) return;
    const key = JSON.stringify([project.projectPath, sceneId]);
    const base = diskContents.current.get(key) ?? scene.content;
    diskContents.current.set(key, base);
    try { writeDraft(project.projectPath, sceneId, { content, base }); }
    catch { setError(t("recoveryFailed")); }
    nativeRecovery.current.schedule(key, async () => {
      try { await writeRecoveryDraft(project.projectPath, sceneId, content, base); }
      catch (reason) { setError(t("recoveryFailed")); throw reason; }
    });
    queueGoalRecord(project.projectPath, sceneId, scene.content, content);
    editRevision.current += 1;
    setProject((current) => current ? {
      ...current,
      nodes: current.nodes.map((node) => node.id === sceneId ? { ...node, content } : node),
    } : current);
    setSaveState("dirty");
  }

  function handleImageSelect(image: { from: number; to: number; name: string; alt: string } | null) {
    if (!image || !selectedScene) { setSelectedImage(null); return; }
    setSelectedImage({ sceneId: selectedScene.id, ...image });
    setImageAltDraft(image.alt);
    if (focusMode) setFocusMode(false);
    setShowInspector(true);
    if (isCompactViewport()) setShowNavigator(false);
  }

  function commitImageAlt(value = imageAltDraft) {
    if (!selectedImage || !selectedScene || selectedImage.sceneId !== selectedScene.id) return;
    const result = updateImageAlt(selectedScene.content, selectedImage.from, selectedImage.to, value);
    if (!result) { setSelectedImage(null); return; }
    if (result.content === selectedScene.content) { setImageAltDraft(result.image.alt); return; }
    updateContent(result.content);
    const next = { sceneId: selectedScene.id, from: result.image.start, to: result.image.end, name: result.image.name, alt: result.image.alt };
    setSelectedImage(next);
    setImageAltDraft(result.image.alt);
    requestAnimationFrame(() => editorRef.current?.selectImage(next.from, next.to));
  }

  function removeSelectedImage() {
    if (!selectedImage || !selectedScene || selectedImage.sceneId !== selectedScene.id) return;
    const content = removeImage(selectedScene.content, selectedImage.from, selectedImage.to);
    if (content === null) { setSelectedImage(null); return; }
    const cursor = selectedImage.from;
    updateContent(content);
    setSelectedImage(null);
    requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(cursor, cursor); });
  }

  async function keepConflictCopy() {
    if (!project || !selectedScene || copyBusy) return;
    setCopyBusy(true);
    const revision = editRevision.current;
    try {
      const next = await preserveConflictCopy(project.projectPath, selectedScene.id, selectedScene.content, `${selectedScene.title} — ${t("historyCopy")}`);
      if (revision !== editRevision.current) { setError(t("saveConflict")); return; }
      clearSavedDraft(project.projectPath, selectedScene.id, selectedScene.content);
      const key = JSON.stringify([project.projectPath, selectedScene.id]);
      await nativeRecovery.current.then(key, () => clearRecoveryDraft(project.projectPath, selectedScene.id, selectedScene.content));
      acceptProject(next);
      setSelectedNodeId(next.nodes.at(-1)?.id ?? null);
    } catch (reason) { setError(localizedError(reason, locale)); }
    finally { setCopyBusy(false); }
  }

  function updateSelectedMetadata(changes: Partial<Pick<ManuscriptNode, "title" | "status" | "synopsis">>) {
    if (!selectedNode) return;
    setProject((current) => current ? {
      ...current,
      nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, ...changes } : node),
    } : current);
  }

  async function saveSelectedMetadata() {
    if (!project || !selectedNode || !selectedNode.title.trim()) return;
    const baselineKey = JSON.stringify([project.projectPath, selectedNode.id]);
    const pending = metadataQueue.current.catch(() => {}).then(async () => {
      const expected = metadataBaselines.current.get(baselineKey) ?? { title: selectedNode.title, status: selectedNode.status, synopsis: selectedNode.synopsis };
      await persistSelected();
      const next = await updateNode(
        project.projectPath,
        selectedNode.id,
        selectedNode.title,
        selectedNode.status,
        selectedNode.synopsis,
        expected,
      );
      const saved = next.nodes.find((node) => node.id === selectedNode.id);
      if (saved) metadataBaselines.current.set(baselineKey, { title: saved.title, status: saved.status, synopsis: saved.synopsis });
      return next;
    });
    metadataQueue.current = pending;
    try {
      const next = await pending;
      setProject((current) => current?.projectPath === next.projectPath ? { ...current, canUndo: next.canUndo, canRedo: next.canRedo } : current);
      setAnnouncement(t("metadataSaved"));
    } catch (reason) {
      setError(localizedError(reason, locale));
    }
  }

  async function openRecentProject(path: string) {
    await persistForExport();
    await acceptProjectWithRecovery(await openProject(path));
  }

  async function locateProject(oldPath?: string) {
    await persistForExport();
    const path = await chooseFolder(t("chooseStoryFolder"));
    if (!path) return false;
    const next = await openProject(path);
    if (oldPath) relocateSession(oldPath, next);
    await acceptProjectWithRecovery(next);
    return true;
  }

  async function handleEditHistory(redo: boolean) {
    if (!project || historyBusyRef.current) return;
    historyBusyRef.current = true;
    setHistoryBusy(true);
    try {
      await persistForExport();
      const next = await undoProjectEdit(project.projectPath, redo);
      acceptProject(next);
      setAnnouncement(t(redo ? "redoEdit" : "undoEdit"));
    } catch (reason) { setError(localizedError(reason, locale)); }
    finally { historyBusyRef.current = false; setHistoryBusy(false); }
  }

  async function performSceneOperation(operation: SceneOperation) {
    if (!project || historyBusyRef.current) throw new Error("BATCH_BUSY");
    historyBusyRef.current = true; setHistoryBusy(true);
    try {
      await persistForExport();
      const current = liveProject.current;
      if (!current || current.projectPath !== project.projectPath) throw new Error("SCENE_OPERATION_CONFLICT");
      const next = await applySceneOperation(current, operation);
      acceptProject(next);
      const added = next.nodes.find(node => !current.nodes.some(old => old.id === node.id));
      if (added) { setActiveReferenceKey(null); setSelectedNodeId(added.id); }
    } finally { historyBusyRef.current = false; setHistoryBusy(false); }
  }

  function acceptStructure(next: ProjectSnapshot) {
    // response has disk text, not what's in memory. only add new scenes
    for (const node of next.nodes) {
      const key = JSON.stringify([next.projectPath, node.id]);
      if (node.kind === "scene" && !diskContents.current.has(key)) diskContents.current.set(key, node.content);
      metadataBaselines.current.set(key, { title: node.title, status: node.status, synopsis: node.synopsis });
    }
    setProject((current) => current ? mergeProjectStructure(current, next) : current);
  }

  async function handleAdd(kind: NodeKind, explicitParentId?: string | null) {
    if (!project) return;
    try {
      await metadataQueue.current;
      await persistSelected();
      const parentId = explicitParentId !== undefined
        ? explicitParentId
        : selectedNode?.kind === "group"
          ? selectedNode.id
          : selectedNode?.parentId ?? null;
      const previousIds = new Set(project.nodes.map((node) => node.id));
      const title = kind === "group" ? t("defaultGroup") : t("defaultScene");
      const next = await addNode(project.projectPath, parentId, kind, title);
      const added = next.nodes.find((node) => !previousIds.has(node.id));
      acceptStructure(next);
      setSelectedNodeId(added?.id ?? null);
      if (parentId) {
        setCollapsedNodes((current) => {
          const nextCollapsed = new Set(current);
          nextCollapsed.delete(parentId);
          return nextCollapsed;
        });
      }
      setTreeQuery("");
      setAnnouncement(t("itemCreated", { title: added?.title ?? title }));
      if (added?.kind === "scene") requestAnimationFrame(() => editorRef.current?.focus());
    } catch (reason) {
      setError(localizedError(reason, locale));
    }
  }

  async function handleMove(direction: -1 | 1) {
    if (!project || !selectedNode) return;
    try {
      await metadataQueue.current;
      await persistSelected();
      acceptStructure(await moveNode(project.projectPath, selectedNode.id, direction));
      setAnnouncement(t("itemMoved", { title: selectedNode.title }));
    } catch (reason) {
      setError(localizedError(reason, locale));
    }
  }

  async function handleIndent() {
    if (!project || !selectedNode || !canIndent) return;
    try {
      await metadataQueue.current;
      await persistSelected();
      acceptStructure(await indentNode(project.projectPath, selectedNode.id));
      setAnnouncement(t("itemIndented", { title: selectedNode.title }));
    } catch (reason) {
      setError(localizedError(reason, locale));
    }
  }

  async function handleOutdent() {
    if (!project || !selectedNode || !canOutdent) return;
    try {
      await metadataQueue.current;
      await persistSelected();
      acceptStructure(await outdentNode(project.projectPath, selectedNode.id));
      setAnnouncement(t("itemOutdented", { title: selectedNode.title }));
    } catch (reason) {
      setError(localizedError(reason, locale));
    }
  }

  function wouldCreateCycle(nodeId: string, parentId: string | null) {
    if (!project) return true;
    let cursor = parentId;
    while (cursor) {
      if (cursor === nodeId) return true;
      cursor = project.nodes.find((node) => node.id === cursor)?.parentId ?? null;
    }
    return false;
  }

  function setActiveDropTarget(next: TreeDropTarget | null) {
    const current = dropTargetRef.current;
    if (current?.targetId === next?.targetId && current?.placement === next?.placement) return;
    dropTargetRef.current = next;
    setDropTarget(next);
  }

  function resolveDropTarget(clientX: number, clientY: number, nodeId: string) {
    if (!project) return null;
    const hit = document.elementFromPoint(clientX, clientY);
    const row = hit?.closest("[data-tree-drop-id]") as HTMLElement | null;
    if (row) {
      const targetId = row.dataset.treeDropId;
      const target = project.nodes.find((node) => node.id === targetId);
      if (!target || target.id === nodeId) return null;
      const rect = row.getBoundingClientRect();
      const verticalPosition = (clientY - rect.top) / Math.max(rect.height, 1);
      const placement: DropPlacement = target.kind === "group" && verticalPosition >= 0.28 && verticalPosition <= 0.72
        ? "inside"
        : verticalPosition < 0.5
          ? "before"
          : "after";
      const newParentId = placement === "inside" ? target.id : target.parentId;
      return wouldCreateCycle(nodeId, newParentId) ? null : { targetId: target.id, placement };
    }
    const rootDrop = hit?.closest("[data-tree-root-drop]");
    return rootDrop ? { targetId: null, placement: "root" as const } : null;
  }

  async function handleTreeDrop(nodeId: string, target: TreeDropTarget) {
    if (!project) return;
    const dragged = project.nodes.find((node) => node.id === nodeId);
    if (!dragged) return;

    let parentId: string | null = null;
    let beforeId: string | null = null;
    if (target.placement !== "root") {
      const targetNode = project.nodes.find((node) => node.id === target.targetId);
      if (!targetNode) return;
      if (target.placement === "inside") {
        if (targetNode.kind !== "group") return;
        parentId = targetNode.id;
      } else {
        parentId = targetNode.parentId;
        const siblings = project.nodes.filter(
          (node) => node.parentId === parentId && node.id !== nodeId,
        );
        const targetIndex = siblings.findIndex((node) => node.id === targetNode.id);
        if (targetIndex < 0) return;
        beforeId = target.placement === "before"
          ? targetNode.id
          : siblings[targetIndex + 1]?.id ?? null;
      }
    }
    if (wouldCreateCycle(nodeId, parentId)) return;

    try {
      await metadataQueue.current;
      await persistSelected();
      const next = await reparentNode(project.projectPath, nodeId, parentId, beforeId);
      acceptStructure(next);
      setSelectedNodeId(nodeId);
      if (parentId) {
        setCollapsedNodes((current) => {
          const nextCollapsed = new Set(current);
          nextCollapsed.delete(parentId);
          return nextCollapsed;
        });
      }
      setAnnouncement(t("itemDropped", { title: dragged.title }));
    } catch (reason) {
      setError(localizedError(reason, locale));
    }
  }

  function beginPointerDrag(event: React.PointerEvent<HTMLButtonElement>, node: ManuscriptNode) {
    if (event.button !== 0) return;
    pointerDragRef.current = {
      pointerId: event.pointerId,
      nodeId: node.id,
      title: node.title,
      kind: node.kind,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updatePointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (distance < 7) return;
      drag.active = true;
      setDraggingNodeId(drag.nodeId);
      setAnnouncement(t("dragHint"));
    }
    event.preventDefault();
    setDragGhost({
      x: event.clientX + 14,
      y: event.clientY + 14,
      title: drag.title,
      kind: drag.kind,
    });
    setActiveDropTarget(resolveDropTarget(event.clientX, event.clientY, drag.nodeId));
  }

  function finishPointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = drag.active
      ? resolveDropTarget(event.clientX, event.clientY, drag.nodeId)
      : null;
    if (drag.active) event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerDragRef.current = null;
    setDraggingNodeId(null);
    setDragGhost(null);
    setActiveDropTarget(null);
    if (drag.active && target) void handleTreeDrop(drag.nodeId, target);
  }

  function cancelPointerDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (pointerDragRef.current?.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    setDraggingNodeId(null);
    setDragGhost(null);
    setActiveDropTarget(null);
  }

  function toggleCollapsed(nodeId: string) {
    setCollapsedNodes((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  async function handleTreeKeyboard(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const action = treeKeyboardAction(flatTree.map(({ node, depth, hasChildren }) => ({
      id: node.id, parentId: node.parentId, kind: node.kind, depth, hasChildren,
    })), index, event.key, collapsedNodes);
    if (!action) return;
    event.preventDefault();
    if (action.type === "expand" || action.type === "collapse") {
      setCollapsedNodes((current) => {
        const next = new Set(current);
        if (action.type === "expand") next.delete(action.id);
        else next.add(action.id);
        return next;
      });
      return;
    }
    const target = project?.nodes.find((node) => node.id === action.id);
    if (!target) return;
    await selectNode(target, false);
    requestAnimationFrame(() => Array.from(document.querySelectorAll<HTMLElement>("[data-tree-item-id]"))
      .find((element) => element.dataset.treeItemId === action.id)?.focus());
  }

  async function selectNode(node: ManuscriptNode, focusEditor = true) {
    try { await persistSelected(); } catch (reason) { setError(localizedError(reason, locale)); return; }
    setActiveReferenceKey(null);
    setSelectedImage(null);
    // may already be selected -> effect won't fire, add the tab here
    setDocumentTabs((current) => current.includes(node.id) ? current : [...current, node.id]);
    setSelectedNodeId(node.id);
    if (focusEditor && isCompactViewport()) setShowNavigator(false);
    if (focusEditor && node.kind === "scene") requestAnimationFrame(() => editorRef.current?.focus());
  }

  async function runReplacement(changes: BatchChange[], undo = false) {
    if (!project || historyBusyRef.current) throw new Error("BATCH_BUSY");
    const path = project.projectPath;
    historyBusyRef.current = true; setHistoryBusy(true);
    try {
      validateBatchSnapshot(liveProject.current?.nodes ?? [], changes);
      await metadataQueue.current;
      // flush first so the preview matches what's on disk
      await persistForExport();
      if (liveProject.current?.projectPath !== path) throw new Error("SEARCH_STALE");
      validateBatchSnapshot(liveProject.current.nodes, changes);
      const pending = saveQueue.current.catch(() => {}).then(() => applyBatchEdit(path, changes));
      saveQueue.current = pending.then(() => {}, () => {});
      const result = await pending;
      const completed = new Set(result.completed);
      const applied = changes.filter((change) => completed.has(change.sceneId));
      if (applied.length) {
        editRevision.current++;
        for (const change of applied) {
          diskContents.current.set(JSON.stringify([path, change.sceneId]), change.after);
        }
        for (const change of applied) recordWriting(path, change.before, change.after);
        const bodies = new Map(applied.map((change) => [change.sceneId, change.after]));
        setProject((current) => current?.projectPath === path ? { ...current, nodes: current.nodes.map((node) => bodies.has(node.id) ? { ...node, content: bodies.get(node.id)! } : node) } : current);
        setBatchUndo((previous) => undo ? (previous && { ...previous, changes: previous.changes.filter((change) => !completed.has(change.sceneId)) }) : { path, changes: applied });
      }
      setSaveState(result.error ? "error" : "saved");
      return result;
    } finally { historyBusyRef.current = false; setHistoryBusy(false); }
  }

  async function undoReplacement() {
    if (!batchUndo || batchUndo.path !== project?.projectPath) throw new Error("SEARCH_STALE");
    return runReplacement(batchUndo.changes.map((change) => ({ sceneId: change.sceneId, before: change.after, after: change.before })), true);
  }

  async function navigateSearchResult(hit: ProjectMatch) {
    const path = project?.projectPath;
    await metadataQueue.current;
    await persistSelected();
    if (liveProject.current?.projectPath !== path || !liveProject.current?.nodes.some((node) => node.kind === "scene" && node.id === hit.sceneId && node.content === hit.source)) throw new Error("SEARCH_STALE");
    setSelectedNodeId(hit.sceneId);
    setActiveReferenceKey(null);
    setSearchSelection(hit);
    setFindOpen(false);
    if (isCompactViewport()) { setShowNavigator(false); setShowInspector(false); }
  }

  useEffect(() => {
    if (!searchSelection || selectedNodeId !== searchSelection.sceneId || projectSearchOpen) return;
    const frame = requestAnimationFrame(() => {
      const offsets = editorMatchOffsets(searchSelection);
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(offsets.start, offsets.end);
      setSearchSelection(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [searchSelection, selectedNodeId, projectSearchOpen]);

  function toggleFocusMode() {
    if (focusMode) {
      setShowNavigator(previousPanels.current.navigator);
      setShowInspector(previousPanels.current.inspector);
      setFocusMode(false);
      setAnnouncement(t("focusEnded"));
    } else {
      previousPanels.current = { navigator: showNavigator, inspector: showInspector };
      setShowNavigator(false);
      setShowInspector(false);
      setFocusMode(true);
      setActiveReferenceKey(null);
      setAnnouncement(t("focusStarted"));
      requestAnimationFrame(() => editorRef.current?.focus());
    }
  }

  function toggleNavigator() {
    if (focusMode) {
      setFocusMode(false);
      setShowNavigator(true);
      setAnnouncement(t("focusEndedSidebar"));
      return;
    }
    setShowNavigator((value) => !value);
    if (isCompactViewport()) setShowInspector(false);
  }

  function toggleInspector() {
    if (focusMode) {
      setFocusMode(false);
      setShowInspector(true);
      setAnnouncement(t("focusEndedInspector"));
      return;
    }
    setShowInspector((value) => !value);
    if (isCompactViewport()) setShowNavigator(false);
  }

  function updateWritingPreference<K extends keyof WritingPreferences>(key: K, value: WritingPreferences[K]) {
    setWritingPreferences((current) => ({ ...current, [key]: value }));
  }

  const saveLabel: Record<SaveState, string> = {
    idle: "",
    dirty: t("edited"),
    saving: t("saving"),
    saved: t("saved"),
    error: t("saveError"),
  };
  const commandText = ({
    ko: { image: "이미지 추가", research: "자료 열기", close: "현재 탭 닫기", next: "다음 탭", previous: "이전 탭", sidebar: "원고 목록 보기/숨기기", settings: "설정 열기" },
    en: { image: "Add image", research: "Open research", close: "Close current tab", next: "Next tab", previous: "Previous tab", sidebar: "Show or hide outline", settings: "Open settings" },
    es: { image: "Añadir imagen", research: "Abrir referencias", close: "Cerrar pestaña actual", next: "Pestaña siguiente", previous: "Pestaña anterior", sidebar: "Mostrar u ocultar índice", settings: "Abrir ajustes" },
    ja: { image: "画像を追加", research: "資料を開く", close: "現在のタブを閉じる", next: "次のタブ", previous: "前のタブ", sidebar: "原稿リストの表示を切り替え", settings: "設定を開く" },
    zh: { image: "添加图片", research: "打开资料", close: "关闭当前标签页", next: "下一个标签页", previous: "上一个标签页", sidebar: "显示或隐藏文稿列表", settings: "打开设置" },
  })[locale];
  const nextSibling = siblings[siblingIndex + 1];
  const nextMergeScene = nextSibling?.kind === "scene" ? nextSibling : null;
  const sceneCommands: PaletteItem[] = project ? [
    { id: "import-manuscript", title: toolsText.importManuscript, run: () => setSceneTool({ mode: "import", offset: 0 }) },
    ...(selectedScene && !activeReferenceKey ? [
      { id: "split-scene", title: toolsText.splitScene, run: () => setSceneTool({ mode: "split", offset: editorRef.current?.selectionStart ?? 0 }) },
      ...(nextMergeScene ? [{ id: "merge-scene", title: toolsText.mergeNext, run: () => setSceneTool({ mode: "merge", offset: 0 }) }] : []),
    ] : []),
    ...(selectedNode ? [{ id: "trash-node", title: toolsText.moveTrash, run: () => setSceneTool({ mode: "trash", offset: 0 }) }] : []),
    { id: "writing-goals", title: toolsText.goals, run: () => { setShowInspector(true); requestAnimationFrame(() => { const panel = document.querySelector<HTMLDetailsElement>(".writing-goals"); if (panel) { panel.open = true; panel.querySelector("input")?.focus(); } }); } },
    { id: "manuscript-trash", title: toolsText.manuscriptTrash, run: () => setSceneTool({ mode: "restore", offset: 0 }) },
  ] : [];
  const paletteItems: PaletteItem[] = paletteMode === "files"
    ? quickOpenDocuments(project?.nodes ?? [], recentDocuments).map(({ node, path }) => ({ id: node.id, title: node.title, detail: [path, node.synopsis].filter(Boolean).join(" · "), run: () => { void selectNode(node); } }))
    : [
      ...sceneCommands,
      { id: "recent-projects", title: features.recentProjects, run: () => setRecentProjectsOpen(true) },
      { id: "reopen-tab", title: features.reopenTab, shortcut: shortcutLabel(shortcuts.reopenTab, isMac), run: () => { void reopenClosedTab(); } },
      ...(selectedScene && !activeReferenceKey ? [{ id: "image", title: commandText.image, shortcut: shortcutLabel(shortcuts.insertImage, isMac), run: () => imageInputRef.current?.click() }] : []),
      { id: "research", title: commandText.research, shortcut: shortcutLabel(shortcuts.openResearch, isMac), run: () => openReference() },
      { id: "close", title: commandText.close, shortcut: shortcutLabel(shortcuts.closeTab, isMac), run: () => { void closeTab(activeTabKey ?? ""); } },
      { id: "next", title: commandText.next, shortcut: shortcutLabel(shortcuts.nextTab, isMac), run: () => cycleTab(1) },
      { id: "previous", title: commandText.previous, shortcut: shortcutLabel(shortcuts.previousTab, isMac), run: () => cycleTab(-1) },
      ...(activeTabKey ? [{ id: "split", title: tabT.openSide, shortcut: shortcutLabel(shortcuts.splitRight, isMac), run: () => { void openToSide(activeTabKey); } }] : []),
      { id: "sidebar", title: commandText.sidebar, shortcut: shortcutLabel(shortcuts.toggleSidebar, isMac), run: toggleNavigator },
      { id: "settings", title: commandText.settings, shortcut: isMac ? "⌘," : "Ctrl+,", run: () => setSettingsOpen(true) },
    ];
  const navigateFromReference = async (hit: ProjectMatch) => {
    if (historyBusyRef.current) throw new Error("BATCH_BUSY");
    historyBusyRef.current = true; setHistoryBusy(true);
    try { await navigateSearchResult(hit); }
    finally { historyBusyRef.current = false; setHistoryBusy(false); }
  };
  return (
    <div className={`app-shell ${focusMode ? "is-focused" : ""}`} style={{ "--navigator-width": `${layout.navigatorWidth}px`, "--inspector-width": `${layout.inspectorWidth}px` } as CSSProperties}>
      <a className="skip-link" href="#editor">{t("skipToEditor")}</a>
      <input ref={imageInputRef} className="hidden-file-input" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple tabIndex={-1} aria-hidden="true" onChange={(event) => {
        const files = Array.from(event.target.files ?? []); event.target.value = ""; void insertImages(files);
      }} />
      <Topbar t={t} locale={locale} isMac={isMac} busy={historyBusy} hasProject={Boolean(project)} title={project?.title ?? t("appName")}
        saveState={saveState} saveText={saveLabel[saveState]} canFind={Boolean(selectedScene)}
        state={{ navigator: showNavigator, inspector: showInspector, focus: focusMode, find: findOpen, research: Boolean(activeReferenceKey) || sideReferences.length > 0 }}
        actions={{
          newProject: () => { void persistSelected().then(() => setNewProjectOpen(true)).catch((reason) => setError(localizedError(reason, locale))); },
          toggleNavigator, openAnother: () => setRecentProjectsOpen(true), exportProject: () => setExportOpen(true),
          projectSearch: () => setProjectSearchOpen(true), research: () => openReference(), toggleFind: () => setFindOpen((open) => !open),
          toggleFocus: toggleFocusMode, toggleInspector, settings: () => setSettingsOpen(true),
        }} />

      <div inert={historyBusy} className={`workspace ${showNavigator ? "with-nav" : ""} ${showInspector ? "with-inspector" : ""}`}>
        {/* compact layout only */}
        {showNavigator && <div className="navigator-backdrop" aria-hidden="true" onClick={toggleNavigator} />}
        {showNavigator && (
          <ManuscriptNavigator t={t} locale={locale} width={layout.navigatorWidth}
            onResize={(navigatorWidth) => setLayout((current) => ({ ...current, navigatorWidth }))}
            query={treeQuery} onQueryChange={setTreeQuery} itemCount={project?.nodes.length ?? 0}
            history={{ canUndo: Boolean(project?.canUndo), canRedo: Boolean(project?.canRedo), busy: historyBusy, run: (redo) => void handleEditHistory(redo) }}
            tree={flatTree} selectedId={selectedNodeId} collapsedIds={collapsedNodes} tabStopId={treeTabStopId}
            draggingId={draggingNodeId} dropTarget={dropTarget} characterCount={nodeMetrics}
            drag={{ begin: beginPointerDrag, update: updatePointerDrag, finish: finishPointerDrag, cancel: cancelPointerDrag }}
            actions={{
              add: (kind) => void handleAdd(kind), select: (node) => void selectNode(node), toggleCollapsed,
              move: (direction) => void handleMove(direction), indent: () => void handleIndent(), outdent: () => void handleOutdent(),
              keyboard: (event, index) => void handleTreeKeyboard(event, index),
            }}
            tools={project ? { importManuscript: () => setSceneTool({ mode: "import", offset: 0 }), openTrash: () => setSceneTool({ mode: "restore", offset: 0 }), importLabel: toolsText.importManuscript, trashLabel: toolsText.manuscriptTrash } : undefined}
            moves={{ up: siblingIndex > 0, down: siblingIndex >= 0 && siblingIndex < siblings.length - 1, indent: canIndent, outdent: canOutdent }} />
        )}

        <div className="editor-workspace" data-editor-theme={writingPreferences.editorTheme} style={editorAppearanceStyle(writingPreferences)}>
        <div className={`pane-row ${sideKeys.length ? "is-split" : ""}`} style={{ "--side-width": `${layout.sideWidth}px` } as CSSProperties}>
        <section className="workspace-pane" data-pane-root="main">
        <DocumentTabs nodes={documentTabs.flatMap(id => project?.nodes.find(node => node.id === id) ?? [])}
          references={mainReferences} activeKey={activeTabKey} locale={locale}
          onSelectNode={node => void selectNode(node)} onSelectReference={setActiveReferenceKey} onClose={key => void closeTab(key)}
          onMove={(key) => void openToSide(key)} onDragStart={(key, title, event) => beginTabDrag(key, title, "main", event)} />
        <div className="editor-split" id="workspace-tab-content">
        <main role="tabpanel" hidden={Boolean(activeReference)} className={`editor-region ${findOpen && selectedScene ? "has-find" : ""} ${nativeImageDrag ? "is-file-dragging" : ""}`} aria-labelledby="item-title">
          {nativeImageDrag && <div className="image-drop-overlay" role="status"><strong>{dropT.prompt}</strong><span>{dropT.unsupported}</span></div>}
          {selectedScene ? (
            <>
              <header className="editor-heading">
                <p>{t("sceneNumber", { number: sceneNumber })}</p>
                <h1 id="item-title">{selectedScene.title}</h1>
                <span>{statusLabel(selectedScene.status, t)}</span>
              </header>
              {findOpen && <FindPanel key={`${project?.projectPath}:${selectedScene.id}`} content={selectedScene.content} locale={locale}
                onChange={updateContent} onClose={() => { setFindOpen(false); editorRef.current?.focus(); }}
                onSelect={(start, end) => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(start, end); }} />}
              <ManuscriptEditor key={`${project?.projectPath}:${selectedScene.id}`} projectPath={project?.projectPath ?? ""} sceneId={selectedScene.id} ref={editorRef}
                label={`${selectedScene.title} · ${t("scene")}`} content={selectedScene.content} preferences={writingPreferences}
                onChange={updateContent} onComposition={(active) => { isComposing.current = active; setCompositionEpoch((value) => value + 1); }}
                onImages={(files, from, to) => { void insertImages(files, from, to); }}
                onImageError={() => setError(dropT.unsupported)}
                onImageSelect={handleImageSelect}
                onKeyDown={(event) => {
                  if (isComposing.current || !event.altKey || !event.shiftKey) return;
                  if (event.key === "ArrowUp") { event.preventDefault(); void handleMove(-1); }
                  if (event.key === "ArrowDown") { event.preventDefault(); void handleMove(1); }
                }}
                placeholder={t("startScene")}
              />
              <footer className="editor-status" aria-label={t("currentSceneStats")}>
                {project && <ResourceLinks key={`${project.projectPath}:${selectedScene.id}`} projectPath={project.projectPath} content={selectedScene.content} editor={editorRef} locale={locale} onChange={updateContent} onOpen={openReference} />}
                <span>{t("charactersShort", { count: metrics.charactersWithSpaces.toLocaleString(locale) })}</span>
                <span>{t("wordsShort", { count: metrics.words.toLocaleString(locale) })}</span>
              </footer>
            </>
          ) : selectedNode?.kind === "group" ? (
            <GroupOverview key={`${project?.projectPath}:${selectedNode.id}`} nodes={project?.nodes ?? []} group={selectedNode} locale={locale}
              onSelect={(node) => void selectNode(node)} onAdd={() => void handleAdd("scene", selectedNode.id)} />
          ) : (
            <textarea id="editor" className="manuscript-editor" aria-label={t("manuscript")} placeholder={project || error ? t("selectScene") : t("preparing")} disabled />
          )}
        </main>
        {activeReference && project && <Suspense fallback={<div className="deferred-panel" role="status">{t("working")}</div>}><ReferencePanel key={`${project.projectPath}:${activeReference.key}`} project={project} locale={locale} card={activeReference.card}
          onOpenCard={(card) => openReference(card, "main")} onNavigate={navigateFromReference} /></Suspense>}
        </div>
        </section>
        {sideKeys.length > 0 && project && <section className="workspace-pane side-pane" data-pane-root="side" aria-label={tabT.sidePane}>
          <PanelResize side="left" value={layout.sideWidth} min={sideWidthRange.min} max={sideWidthRange.max} label={layoutText[locale].side} onChange={(sideWidth) => setLayout((current) => ({ ...current, sideWidth }))} />
          <DocumentTabs nodes={sideNodes} references={sideReferences} activeKey={sideActive} locale={locale} pane="side" panelId="side-tab-content"
            onSelectNode={(node) => void switchSideTab(`node:${node.id}`)} onSelectReference={(key) => void switchSideTab(key)} onClose={closeSideTab}
            onMove={(key) => moveToMain(key)} onDragStart={(key, title, event) => beginTabDrag(key, title, "side", event)} />
          <div className="side-content" id="side-tab-content">
            {sideActiveReference ? <Suspense fallback={<div className="deferred-panel" role="status">{t("working")}</div>}>
              <ReferencePanel key={`side:${project.projectPath}:${sideActiveReference.key}`} project={project} locale={locale} card={sideActiveReference.card}
                onOpenCard={(card) => openReference(card, "side")} onNavigate={navigateFromReference} /></Suspense>
            : sideActiveNode?.kind === "group" ? <GroupOverview key={`side:${sideActiveNode.id}`} nodes={project.nodes} group={sideActiveNode} locale={locale}
                onSelect={(node) => void selectNode(node)} onAdd={() => void handleAdd("scene", sideActiveNode.id)} />
            : sideEditScene ? <SideEditor key={`side:${project.projectPath}:${sideEditScene.id}`} scene={sideEditScene} projectPath={project.projectPath}
                number={sceneNodes.findIndex((node) => node.id === sideEditScene.id) + 1} locale={locale} t={t} preferences={writingPreferences}
                editorRef={sideEditorRef} onChange={(content) => updateSceneContent(sideEditScene.id, content)}
                onComposition={(active) => { isComposing.current = active; setCompositionEpoch((value) => value + 1); }}
                onImageRejected={setError} imageUnsupported={dropT.unsupported} imageMainOnly={tabT.sideImages} />
            : null}
          </div>
        </section>}
        </div>
        {tabDrag && <>
          {tabDrag.hint && <div className="pane-drop-hint" style={tabDrag.hint}><span>{tabDrag.target === "side" ? tabT.dropSide : tabT.dropMain}</span></div>}
          <div className="tab-drag-ghost" style={{ left: tabDrag.x + 14, top: tabDrag.y + 12 }}>{tabDrag.title}</div>
        </>}
        </div>

        {showInspector && (
          <InspectorPanel itemActions={[
              ...(selectedScene && !activeReferenceKey ? [{ id: "split", label: toolsText.splitScene, run: () => setSceneTool({ mode: "split", offset: editorRef.current?.selectionStart ?? 0 }) }] : []),
              ...(selectedScene && nextMergeScene ? [{ id: "merge", label: toolsText.mergeNext, run: () => setSceneTool({ mode: "merge", offset: 0 }) }] : []),
              ...(selectedNode ? [{ id: "trash", label: toolsText.moveTrash, run: () => setSceneTool({ mode: "trash", offset: 0 }) }] : []),
            ]} goalsSection={project && <WritingGoals key={project.projectPath} project={project} locale={locale} />} locale={locale} t={t} isMac={isMac} width={layout.inspectorWidth}
            onResize={(inspectorWidth) => setLayout((current) => ({ ...current, inspectorWidth }))}
            image={selectedImage && selectedScene && selectedImage.sceneId === selectedScene.id ? selectedImage : null}
            altDraft={imageAltDraft} onAltDraftChange={setImageAltDraft} onAltCommit={commitImageAlt}
            onReplaceImage={() => { if (!selectedImage) return; editorRef.current?.selectImage(selectedImage.from, selectedImage.to); imageInputRef.current?.click(); }}
            onRemoveImage={removeSelectedImage}
            selectedNode={selectedNode} selectedScene={selectedScene} position={{ index: siblingIndex, count: siblings.length }}
            onOpenHistory={() => setHistoryOpen(true)} onMetadataChange={updateSelectedMetadata} onMetadataCommit={() => void saveSelectedMetadata()}
            metrics={metrics} writing={writingPreferences} onWritingChange={updateWritingPreference} />
        )}
      </div>

      {sceneTool && project && <SceneToolsDialog mode={sceneTool.mode} project={project} selected={selectedNode} nextScene={nextMergeScene} offset={sceneTool.offset} locale={locale} onApply={performSceneOperation} onClose={() => setSceneTool(null)} />}
      {recentProjectsOpen && <RecentProjectsDialog locale={locale} onOpen={openRecentProject} onLocate={locateProject} onClose={() => setRecentProjectsOpen(false)} />}
      {newProjectOpen && <NewProjectDialog locale={locale} onClose={() => setNewProjectOpen(false)} onCreated={(next) => { acceptProject(next); setNewProjectOpen(false); }} />}
      {projectSearchOpen && project && <Suspense fallback={<div className="dialog-backdrop" role="status"><span>{t("working")}</span></div>}><ProjectSearchDialog project={project} locale={locale} onNavigate={navigateSearchResult} onApply={runReplacement} onUndo={undoReplacement} canUndo={batchUndo?.path === project.projectPath && !!batchUndo.changes.length} onRestore={async (journalId, sceneId) => {
        if (historyBusyRef.current) throw new Error("BATCH_BUSY");
        historyBusyRef.current = true; setHistoryBusy(true);
        try {
          await persistForExport();
          const original = project.nodes.find((node) => node.id === sceneId);
          if (!original) throw new Error("BATCH_SCENE_MISSING");
          const next = await restoreBatchCopy(project.projectPath, journalId, sceneId, `${original.title} — ${t("historyCopy")}`);
          acceptProject(next); setSelectedNodeId(next.nodes.at(-1)?.id ?? null);
        } finally { historyBusyRef.current = false; setHistoryBusy(false); }
      }} onClose={() => setProjectSearchOpen(false)} errorMessage={(reason) => localizedError(reason, locale)} /></Suspense>}
      {settingsOpen && <SettingsDialog preferences={appPreferences} setPreferences={setAppPreferences} onClose={closeSettings} t={t}
        editorSection={<EditorAppearanceSettings locale={locale} value={writingPreferences} onChange={setWritingPreferences} />}
        workspaceSection={<WorkspaceControls locale={locale} value={{ ...layout, navigator: showNavigator, inspector: showInspector }} onChange={(next) => { setLayout(next); setShowNavigator(next.navigator); setShowInspector(next.inspector); setFocusMode(false); }} />} />}
      {exportOpen && project && <ExportDialog project={project} selectedId={selectedNodeId} persist={persistForExport} locale={locale} onClose={() => setExportOpen(false)} />}
      {historyOpen && project && selectedScene && <Suspense fallback={<div className="dialog-backdrop" role="status"><span>{t("working")}</span></div>}><HistoryDialog projectPath={project.projectPath} scene={selectedScene} locale={locale} persist={persistSelected} onRestored={(next) => { acceptProject(next); setSelectedNodeId(next.nodes.at(-1)?.id ?? null); }} onClose={() => setHistoryOpen(false)} /></Suspense>}
      {paletteMode && <CommandPalette mode={paletteMode} locale={locale} items={paletteItems} onClose={() => setPaletteMode(null)} />}
      {dragGhost && (
        <div className="tree-drag-ghost" style={{ left: dragGhost.x, top: dragGhost.y }} aria-hidden="true">
          <Icon name={dragGhost.kind === "group" ? "folder" : "document"} />
          <span>{dragGhost.title}</span>
        </div>
      )}
      {error && <div className="error-banner" role="alert"><span>{error}</span>{conflict && <button type="button" disabled={copyBusy} onClick={() => void keepConflictCopy()}>{t("keepConflictCopy")}</button>}<button type="button" onClick={() => setError("")}>{t("close")}</button></div>}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
    </div>
  );
}

export default App;
