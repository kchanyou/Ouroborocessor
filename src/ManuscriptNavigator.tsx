import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { AppIcon as Icon } from "./AppIcon";
import type { Locale } from "./i18n";
import type { Translate } from "./appText";
import type { ManuscriptNode, NodeKind } from "./types";
import type { FlatTreeItem, TreeDropTarget } from "./projectTree";
import { PanelResize } from "./WorkspaceControls";
import { layoutText } from "./workspaceLayout";

type TreeButtonEvent = PointerEvent<HTMLButtonElement>;

export function ManuscriptNavigator({ t, locale, width, onResize, query, onQueryChange, itemCount, history, tree, selectedId, collapsedIds, tabStopId,
  draggingId, dropTarget, characterCount, drag, actions, moves }: {
  t: Translate; locale: Locale; width: number; onResize: (width: number) => void;
  query: string; onQueryChange: (query: string) => void; itemCount: number;
  history: { canUndo: boolean; canRedo: boolean; busy: boolean; run: (redo: boolean) => void };
  tree: FlatTreeItem[]; selectedId: string | null; collapsedIds: Set<string>; tabStopId: string | null | undefined;
  draggingId: string | null; dropTarget: TreeDropTarget | null; characterCount: (node: ManuscriptNode) => number;
  drag: { begin: (event: TreeButtonEvent, node: ManuscriptNode) => void; update: (event: TreeButtonEvent) => void; finish: (event: TreeButtonEvent) => void; cancel: (event: TreeButtonEvent) => void };
  actions: {
    add: (kind: NodeKind) => void; select: (node: ManuscriptNode) => void; toggleCollapsed: (id: string) => void;
    move: (direction: -1 | 1) => void; indent: () => void; outdent: () => void;
    keyboard: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  };
  moves: { up: boolean; down: boolean; indent: boolean; outdent: boolean };
}) {
  return (
    <aside className="navigator" aria-labelledby="navigator-title">
      <PanelResize side="right" value={width} min={190} max={360} label={layoutText[locale].navigator} onChange={onResize} />
      <div className="panel-heading">
        <h2 id="navigator-title">{t("manuscript")}</h2>
        <div className="panel-actions">
          <button type="button" className="panel-action" onClick={() => actions.add("group")} aria-label={t("newGroup")} title={t("newGroup")}><Icon name="folder" /><span className="add-badge" aria-hidden="true">+</span></button>
          <button type="button" className="panel-action" onClick={() => actions.add("scene")} aria-label={t("newScene")} title={t("newScene")}><Icon name="document" /><span className="add-badge" aria-hidden="true">+</span></button>
        </div>
      </div>
      <label className="search-field">
        <span className="sr-only">{t("searchTree")}</span>
        <Icon name="search" />
        <input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t("searchTree")} />
      </label>
      <p className="section-label">{t("itemCount", { count: itemCount })}</p>
      <div className="tree-drag-hint" id="tree-drag-instructions">
        <p className="sr-only">{t("dragHint")}</p>
        <div className="edit-history-tools" aria-label={t("editHistory")}>
          <button type="button" disabled={!history.canUndo || history.busy} onClick={() => history.run(false)} title={t("editHistoryHint")}>{t("undoEdit")}</button>
          <button type="button" disabled={!history.canRedo || history.busy} onClick={() => history.run(true)} title={t("editHistoryHint")}>{t("redoEdit")}</button>
        </div>
      </div>
      <div className="manuscript-tree" role="tree" aria-label={t("manuscript")}>
        {tree.map(({ node, depth, hasChildren }, index) => {
          const selected = node.id === selectedId;
          const collapsed = collapsedIds.has(node.id);
          const rowMetrics = node.kind === "scene" ? characterCount(node) : null;
          const activePlacement = dropTarget?.targetId === node.id ? dropTarget.placement : null;
          return (
            <div
              className={`tree-row ${draggingId === node.id ? "is-dragging" : ""} ${activePlacement ? `is-drop-${activePlacement}` : ""}`}
              data-tree-drop-id={node.id}
              role="none"
              key={node.id}
              style={{ "--tree-depth": depth } as CSSProperties}
            >
              <button
                type="button"
                className="tree-drag-handle"
                tabIndex={-1}
                aria-label={t("dragItem", { title: node.title })}
                aria-describedby="tree-drag-instructions"
                onPointerDown={(event) => drag.begin(event, node)}
                onPointerMove={drag.update}
                onPointerUp={drag.finish}
                onPointerCancel={drag.cancel}
              >
                <Icon name="drag" />
              </button>
              {node.kind === "group" ? (
                <button type="button" className="tree-disclosure" tabIndex={-1} onClick={() => actions.toggleCollapsed(node.id)} aria-label={node.title} aria-expanded={!collapsed} disabled={!hasChildren}>
                  <Icon name={collapsed ? "chevronRight" : "chevronDown"} />
                </button>
              ) : <span className="tree-disclosure-spacer" aria-hidden="true" />}
              <button
                type="button"
                role="treeitem"
                data-tree-item-id={node.id}
                aria-level={depth + 1}
                aria-selected={selected}
                aria-expanded={node.kind === "group" && hasChildren ? !collapsed : undefined}
                tabIndex={node.id === tabStopId ? 0 : -1}
                className="tree-item"
                onClick={() => actions.select(node)}
                onKeyDown={(event) => {
                  if (event.altKey && event.shiftKey) {
                    if (event.key === "ArrowUp") { event.preventDefault(); actions.move(-1); }
                    if (event.key === "ArrowDown") { event.preventDefault(); actions.move(1); }
                    if (event.key === "ArrowRight") { event.preventDefault(); actions.indent(); }
                    if (event.key === "ArrowLeft") { event.preventDefault(); actions.outdent(); }
                    return;
                  }
                  actions.keyboard(event, index);
                }}
              >
                <span className="tree-item-icon" aria-hidden="true"><Icon name={node.kind === "group" ? "folder" : "document"} /></span>
                <span className="tree-item-copy">
                  <strong>{node.title}</strong>
                  <small>{node.kind === "group" ? t("group") : t("charactersShort", { count: rowMetrics ?? 0 })}</small>
                </span>
              </button>
              {activePlacement && (
                <span className="drop-placement-label" aria-hidden="true">
                  {activePlacement === "inside" ? t("dropInside") : activePlacement === "before" ? t("dropBefore") : t("dropAfter")}
                </span>
              )}
            </div>
          );
        })}
        {draggingId && (
          <div
            className={`tree-root-drop ${dropTarget?.placement === "root" ? "is-active" : ""}`}
            data-tree-root-drop
          >
            {t("dropAtTopLevel")}
          </div>
        )}
        {tree.length === 0 && <p className="empty-search">{t("noSearchResults")}</p>}
      </div>
      <div className="move-controls" aria-label={t("moveItem")}>
        <button type="button" onClick={() => actions.move(-1)} disabled={!moves.up} title={t("moveUp")}><Icon name="chevronUp" /><span>{t("moveUp")}</span></button>
        <button type="button" onClick={() => actions.move(1)} disabled={!moves.down} title={t("moveDown")}><Icon name="chevronDown" /><span>{t("moveDown")}</span></button>
        <button type="button" onClick={actions.indent} disabled={!moves.indent} title={t("indent")}><Icon name="indent" /><span>{t("indent")}</span></button>
        <button type="button" onClick={actions.outdent} disabled={!moves.outdent} title={t("outdent")}><Icon name="outdent" /><span>{t("outdent")}</span></button>
      </div>
    </aside>
  );
}
