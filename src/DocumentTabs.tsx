import type { PointerEvent as ReactPointerEvent } from "react";
import type { Locale } from "./i18n";
import { AppIcon } from "./AppIcon";
import type { ManuscriptNode } from "./types";

export type ReferenceTab = { key: string; title: string };
export type PaneId = "main" | "side";

export const tabText = {
  ko: { title: "열린 탭", close: "탭 닫기", resources: "자료", imageError: "이미지를 추가하지 못했어요. PNG·JPEG·GIF·WebP, 최대 10MB까지 가능해요.", openSide: "옆에 열기", moveMain: "주 창으로 옮기기", sidePane: "옆 창", dropSide: "옆에 열기", dropMain: "주 창으로 옮기기", sideImages: "이미지는 주 창에서 추가할 수 있어요." },
  en: { title: "Open tabs", close: "Close tab", resources: "Research", imageError: "Could not add the image. Use PNG, JPEG, GIF, or WebP up to 10 MB.", openSide: "Open to the side", moveMain: "Move to main pane", sidePane: "Side pane", dropSide: "Open to the side", dropMain: "Move to main pane", sideImages: "Add images from the main pane." },
  es: { title: "Pestañas abiertas", close: "Cerrar pestaña", resources: "Referencias", imageError: "No se pudo añadir la imagen. Usa PNG, JPEG, GIF o WebP de hasta 10 MB.", openSide: "Abrir al lado", moveMain: "Mover al panel principal", sidePane: "Panel lateral", dropSide: "Abrir al lado", dropMain: "Mover al panel principal", sideImages: "Añade imágenes desde el panel principal." },
  ja: { title: "開いているタブ", close: "タブを閉じる", resources: "資料", imageError: "画像を追加できませんでした。PNG・JPEG・GIF・WebP（最大10 MB）に対応しています。", openSide: "横に開く", moveMain: "メインに移動", sidePane: "サイドペイン", dropSide: "横に開く", dropMain: "メインに移動", sideImages: "画像はメインペインで追加できます。" },
  zh: { title: "打开的标签页", close: "关闭标签页", resources: "资料", imageError: "无法添加图片。支持 PNG、JPEG、GIF、WebP，最大 10 MB。", openSide: "在侧边打开", moveMain: "移到主窗格", sidePane: "侧边窗格", dropSide: "在侧边打开", dropMain: "移到主窗格", sideImages: "请在主窗格中添加图片。" },
};

export function nextTabIndex(length: number, current: number, key: string) {
  if (length < 1 || current < 0 || current >= length) return null;
  if (key === "ArrowRight") return (current + 1) % length;
  if (key === "ArrowLeft") return (current - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

export function DocumentTabs({ nodes, references, activeKey, locale, onSelectNode, onSelectReference, onClose, pane = "main", panelId = "workspace-tab-content", onMove, onDragStart }: {
  nodes: ManuscriptNode[]; references: ReferenceTab[]; activeKey: string | null; locale: Locale;
  onSelectNode: (node: ManuscriptNode) => void; onSelectReference: (key: string) => void; onClose: (key: string) => void;
  pane?: PaneId; panelId?: string;
  onMove?: (key: string) => void;
  onDragStart?: (key: string, title: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const t = tabText[locale];
  const entries = [
    ...nodes.map((node) => ({ key: `node:${node.id}`, title: node.title, kind: "document" as const, select: () => onSelectNode(node) })),
    ...references.map((reference) => ({ key: reference.key, title: reference.title, kind: "reference" as const, select: () => onSelectReference(reference.key) })),
  ];
  const fallbackKey = activeKey && entries.some((entry) => entry.key === activeKey) ? activeKey : entries[0]?.key;
  const tab = ({ key, title, kind, select }: typeof entries[number], index: number) => {
    const active = activeKey === key;
    return <div className="document-tab" role="presentation" key={key} data-active={active} data-kind={kind}>
      <button type="button" role="tab" title={title} aria-selected={active} aria-controls={panelId} tabIndex={fallbackKey === key ? 0 : -1} onClick={select}
        onPointerDown={onDragStart ? (event) => onDragStart(key, title, event) : undefined}
        onKeyDown={(event) => {
          const target = nextTabIndex(entries.length, index, event.key);
          if (target === null) return;
          event.preventDefault();
          const tabs = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          tabs?.[target]?.focus();
          tabs?.[target]?.click();
        }}>
        <span className="tab-kind" aria-hidden="true"><AppIcon name={kind === "reference" ? "book" : nodes.find(node => `node:${node.id}` === key)?.kind === "group" ? "folder" : "document"} /></span>
        <span className="tab-title">{title}</span>
      </button>
      {onMove && <button type="button" className="tab-move" aria-label={`${title} · ${pane === "main" ? t.openSide : t.moveMain}`} title={pane === "main" ? t.openSide : t.moveMain} onClick={() => onMove(key)}>
        <AppIcon name={pane === "main" ? "splitRight" : "chevronLeft"} />
      </button>}
      <button type="button" className="tab-close" aria-label={`${title} · ${t.close}`} onClick={() => onClose(key)}>×</button>
    </div>;
  };
  return <nav className="document-tabs" role="tablist" aria-label={pane === "side" ? t.sidePane : t.title} data-pane={pane}>
    {entries.map(tab)}
  </nav>;
}
