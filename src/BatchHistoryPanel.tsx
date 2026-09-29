import { useEffect, useState } from "react";
import type { Locale } from "./i18n";
import type { ProjectSnapshot } from "./types";
import type { BatchChange } from "./projectReplace";
import { listBatchJournals, readBatchJournal } from "./tauriApi";

export const historyText = {
  ko: ["일괄 변경 기록", "변경 전후 계획을 기록해요. 적용 완료를 보장하지는 않으며, 되돌리기 기록도 포함돼요. 원본은 덮어쓰지 않아요.", "변경 전", "변경 후 (계획)", "변경 전 본문을 새 원고로 복원", "기록이 없어요.", "기록을 불러오지 못했어요.", "불러오는 중…", "원본 원고가 삭제되어 사본으로 복원할 수 없어요."],
  en: ["Batch history", "Planned before/after records, not proof of completion. Includes undo records. Originals are never overwritten.", "Before", "After (planned)", "Restore before text as a new document", "No records yet.", "Could not load records.", "Loading…", "The original document was deleted; a restored copy cannot be created."],
  es: ["Historial por lotes", "Cambios previstos, no una confirmación de finalización. Incluye registros de deshacer. No se sobrescriben los originales.", "Antes", "Después (previsto)", "Restaurar el texto anterior como un documento nuevo", "No hay registros.", "No se pudieron cargar los registros.", "Cargando…", "El documento original fue eliminado; no se puede crear una copia."],
  ja: ["一括変更の記録", "変更前後の予定の記録であり、適用完了を示すものではありません。取り消しの記録も含まれます。原本は上書きされません。", "変更前", "変更後（予定）", "変更前の本文を新しい原稿として復元", "記録はありません。", "記録を読み込めませんでした。", "読み込み中…", "元の原稿が削除されているため、コピーを作成できません。"],
  zh: ["批量更改记录", "这是计划的更改前后记录，不代表更改已完成，也包含撤销记录。不会覆盖原文件。", "更改前", "更改后（计划）", "将更改前的正文恢复为新文稿", "暂无记录。", "无法加载记录。", "正在加载…", "原文稿已删除，无法创建恢复副本。"],
} satisfies Record<Locale, string[]>;

export function journalLabel(id: string, locale: Locale): string {
  const nanos = /^batch-(\d+)\.json$/.exec(id)?.[1];
  if (!nanos) return id;
  const date = new Date(Number(BigInt(nanos) / 1_000_000n));
  return Number.isNaN(date.getTime()) ? id : `${date.toLocaleString(locale)} · ${id}`;
}

export function BatchHistoryPanel({ project, locale, busy, onRestore }: {
  project: ProjectSnapshot; locale: Locale; busy: boolean;
  onRestore: (journalId: string, sceneId: string) => Promise<void>;
}) {
  const t = historyText[locale];
  const [ids, setIds] = useState<string[]>([]);
  const [id, setId] = useState("");
  const [changes, setChanges] = useState<BatchChange[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    listBatchJournals(project.projectPath).then((records) => { if (active) { setIds(records); setId(records[0] ?? ""); setLoading(false); } })
      .catch(() => { if (active) { setError(true); setLoading(false); } });
    return () => { active = false; };
  }, [project.projectPath]);
  useEffect(() => {
    let active = true;
    setChanges([]); setIndex(0);
    if (!id) return;
    setLoading(true); setError(false);
    readBatchJournal(project.projectPath, id).then((entries) => { if (active) setChanges(entries); })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [project.projectPath, id]);
  const entry = changes[index];
  const original = project.nodes.find((node) => node.kind === "scene" && node.id === entry?.sceneId);
  return <section className="batch-history">
    <p>{t[1]}</p>
    {loading && <p role="status">{t[7]}</p>}
    {error && <p role="alert">{t[6]}</p>}
    {!loading && !error && !ids.length && <p>{t[5]}</p>}
    {!!ids.length && <label>{t[0]}<select value={id} disabled={busy} onChange={(event) => { setChanges([]); setId(event.target.value); }}>
      {ids.map((record) => <option key={record} value={record}>{journalLabel(record, locale)}</option>)}
    </select></label>}
    {entry && <>
      <select aria-label={t[4]} value={index} disabled={busy} onChange={(event) => setIndex(Number(event.target.value))}>
        {changes.map((change, i) => <option key={`${change.sceneId}:${i}`} value={i}>{project.nodes.find((node) => node.id === change.sceneId)?.title ?? change.sceneId}</option>)}
      </select>
      <label>{t[2]}<textarea readOnly value={entry.before} /></label>
      <label>{t[3]}<textarea readOnly value={entry.after} /></label>
      {!original && <p>{t[8]}</p>}
      <button type="button" disabled={busy || loading || !original} onClick={() => void onRestore(id, entry.sceneId)}>{t[4]}</button>
    </>}
  </section>;
}
