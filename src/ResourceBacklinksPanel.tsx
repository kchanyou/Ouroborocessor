import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "./i18n";
import type { ManuscriptNode, ResourceCard } from "./types";
import type { ProjectMatch } from "./projectSearch";
import { listResourceCards } from "./tauriApi";
import { resourceBacklinks } from "./resourceBacklinks";

export const backlinkText = {
  ko: { title: "연결된 원고", empty: "이 자료를 연결한 원고가 없어요.", loading: "연결 확인 중…", refresh: "연결 새로고침", error: "연결을 확인하지 못했어요. 다시 불러오세요.", navigation: "이동하지 못했어요. 원고 저장 상태를 확인한 뒤 다시 시도하세요.", stale: "원고가 바뀌었어요. 새 목록에서 다시 선택하세요.", count: "{scenes}개 원고 · {count}개 연결", limit: "처음 {limit}개 연결만 표시해요." },
  en: { title: "Linked documents", empty: "No documents link to this research.", loading: "Checking links…", refresh: "Refresh links", error: "Could not check links. Please reload.", navigation: "Could not open the document. Check that it is saved, then try again.", stale: "The document changed. Select it again from the updated list.", count: "{scenes} documents · {count} links", limit: "Showing the first {limit} links." },
  es: { title: "Documentos vinculados", empty: "Ningún documento enlaza esta referencia.", loading: "Comprobando enlaces…", refresh: "Actualizar enlaces", error: "No se pudieron comprobar los enlaces. Vuelve a cargarlos.", navigation: "No se pudo abrir el documento. Comprueba que esté guardado e inténtalo de nuevo.", stale: "El documento cambió. Vuelve a seleccionarlo en la lista actualizada.", count: "{scenes} documentos · {count} enlaces", limit: "Se muestran los primeros {limit} enlaces." },
  ja: { title: "リンク元の原稿", empty: "この資料にリンクする原稿はありません。", loading: "リンクを確認中…", refresh: "リンクを再読み込み", error: "リンクを確認できませんでした。再読み込みしてください。", navigation: "移動できませんでした。原稿の保存状態を確認して再試行してください。", stale: "原稿が変更されました。更新された一覧から再選択してください。", count: "{scenes}件の原稿 · {count}件のリンク", limit: "最初の{limit}件を表示しています。" },
  zh: { title: "关联的文稿", empty: "没有文稿链接到此资料。", loading: "正在检查链接…", refresh: "刷新链接", error: "无法检查链接，请重新加载。", navigation: "无法跳转。请检查文稿保存状态后重试。", stale: "文稿已更改，请从更新后的列表重新选择。", count: "{scenes}个文稿 · {count}个链接", limit: "仅显示前{limit}个链接。" },
};

export function ResourceBacklinksPanel({ projectPath, nodes, resourceId, locale, onNavigate }: {
  projectPath: string; nodes: ManuscriptNode[]; resourceId: string; locale: Locale;
  onNavigate: (hit: ProjectMatch) => Promise<void>;
}) {
  const t = backlinkText[locale];
  const [cards, setCards] = useState<ResourceCard[] | null>(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState<"load" | "stale" | "navigation" | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    setCards(null); setError(null);
    listResourceCards(projectPath).then((value) => { if (active) setCards(value); })
      .catch(() => { if (active) setError("load"); });
    return () => { active = false; };
  }, [projectPath, resourceId, revision]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("resources-changed", refresh); window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("resources-changed", refresh); window.removeEventListener("focus", refresh); };
  }, []);
  const result = useMemo(() => cards ? resourceBacklinks(nodes, cards, resourceId) : null, [nodes, cards, resourceId]);
  async function navigate(hit: ProjectMatch) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await onNavigate(hit); }
    catch (reason) { setError(String(reason).includes("SEARCH_STALE") ? "stale" : "navigation"); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="resource-backlinks" aria-label={t.title}>
    <h4>{t.title}</h4>
    <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>{t.refresh}</button>
    {error && <p role="alert">{error === "load" ? t.error : error === "stale" ? t.stale : t.navigation}</p>}
    {!result && !error && <p role="status">{t.loading}</p>}
    {result && <>
      <p role="status">{result.count ? t.count.replace("{scenes}", String(result.scenes)).replace("{count}", String(result.count)) : t.empty}</p>
      {result.count > result.hits.length && <p>{t.limit.replace("{limit}", String(result.hits.length))}</p>}
      <ol>{result.hits.map((hit) => <li key={`${hit.sceneId}:${hit.start}`}>
        <button type="button" disabled={busy} onClick={() => void navigate(hit)}>
          <strong>{hit.title}</strong><span>{hit.source.slice(Math.max(0, hit.start - 30), hit.start)}<mark>{hit.source.slice(hit.start, hit.end)}</mark>{hit.source.slice(hit.end, hit.end + 30)}</span>
        </button>
      </li>)}</ol>
    </>}
  </section>;
}
