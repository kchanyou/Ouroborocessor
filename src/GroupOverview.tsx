import { useMemo, useState } from "react";
import { exportScope } from "./exportScope";
import { getCharacterCount } from "./textMetrics";
import { translate, type Locale } from "./i18n";
import type { ManuscriptNode } from "./types";

export function overviewItems(nodes: ManuscriptNode[], groupId: string, query: string, descendants: boolean) {
  const needle = query.trim().toLocaleLowerCase();
  return exportScope(nodes, groupId).slice(1).filter(({ node, depth }) =>
    (descendants || depth === 1) && (!needle || `${node.title}\n${node.synopsis}`.toLocaleLowerCase().includes(needle)));
}

export function GroupOverview({ nodes, group, locale, onSelect, onAdd }: {
  nodes: ManuscriptNode[]; group: ManuscriptNode; locale: Locale;
  onSelect: (node: ManuscriptNode) => void; onAdd: () => void;
}) {
  const [query, setQuery] = useState("");
  const [descendants, setDescendants] = useState(true);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const items = useMemo(() => overviewItems(nodes, group.id, query, descendants), [nodes, group.id, query, descendants]);
  const counts = useMemo(() => new Map(items.filter(({ node }) => node.kind === "scene").map(({ node }) => [node.id, getCharacterCount(node.content)])), [items]);
  const label = (node: ManuscriptNode) => node.kind === "group" ? t("group")
    : node.status === "draft" || node.status === "초안" ? t("draft")
    : node.status === "revised" ? t("revised") : node.status === "complete" ? t("complete") : node.status || t("draft");
  return <section className="group-overview" aria-labelledby="item-title">
    <header><p>{t("group")}</p><h1 id="item-title">{group.title}</h1>
      {group.synopsis && <p className="overview-group-notes">{group.synopsis}</p>}
    </header>
    <div className="overview-controls">
      <button type="button" className="primary" onClick={onAdd}>{t("addSceneToGroup")}</button>
      <label className="overview-search">{t("overviewSearch")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="overview-descendants"><input type="checkbox" checked={descendants} onChange={(event) => setDescendants(event.target.checked)} />{t("includeDescendants")}</label>
    </div>
    <p role="status">{t("folderCount", { count: items.length - counts.size })} · {t("exportSceneCount", { count: counts.size })}</p>
    <p className="overview-hint">{t("overviewHint")}</p>
    {!items.length ? <p>{query.trim() ? t("noSearchResults") : t("emptyGroup")}</p> :
      <div className="scene-outline-scroll" tabIndex={0} role="region" aria-label={t("sceneOutline")}>
        <table className="scene-outline"><caption className="sr-only">{group.title} · {t("sceneOutline")}</caption>
          <thead><tr><th scope="col">{t("title")}</th><th scope="col">{t("status")}</th><th scope="col">{t("notes")}</th></tr></thead>
          <tbody>{items.map(({ node, depth }) => <tr key={node.id}>
            <th scope="row"><button type="button" style={{ paddingInlineStart: `${Math.min(depth - 1, 6) * 12}px` }} onClick={() => onSelect(node)}>{node.title}</button>
              {node.kind === "scene" && <small>{t("charactersShort", { count: counts.get(node.id)?.toLocaleString(locale) ?? 0 })}</small>}</th>
            <td>{label(node)}</td><td className="outline-notes">{node.synopsis || t("noSynopsis")}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
