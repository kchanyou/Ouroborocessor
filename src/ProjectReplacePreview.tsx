import { useMemo, useRef, useState } from "react";
import { translate, type Locale } from "./i18n";
import { previewProjectReplacement, replacementSelectionSummary } from "./projectReplace";
import type { ManuscriptNode } from "./types";
import type { BatchChange } from "./projectReplace";
import { HelpDetails } from "./HelpDetails";

export function ProjectReplacePreview({ nodes, locale, busy = false, onApply, onUndo, canUndo = false }: {
  nodes: ManuscriptNode[]; locale: Locale; busy?: boolean;
  onApply?: (changes: BatchChange[]) => Promise<void>; onUndo?: () => Promise<void>; canUndo?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof previewProjectReplacement> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const composing = useRef(false);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  const summary = useMemo(() => replacementSelectionSummary(preview ?? [], selected), [preview, selected]);
  const invalidate = () => { setPreview(null); setSelected(new Set()); };
  return <section aria-label={t("projectReplacePreview")}>
    <p role="note">{t(onApply ? "batchHelp" : "replacePreviewOnly")}</p>
    {onApply && <HelpDetails locale={locale}>{t("batchHelpDetails")}</HelpDetails>}
    <fieldset disabled={busy} className="batch-controls">
    {onUndo && <button type="button" disabled={!canUndo} onClick={async () => { await onUndo(); invalidate(); }}>{t("batchUndo")}</button>}
    <form onSubmit={(event) => {
      event.preventDefault(); if (composing.current) return;
      const next = previewProjectReplacement(nodes, query, replacement, matchCase);
      setPreview(next); setSelected(new Set(next.map((item) => item.sceneId)));
    }}>
      <div className="find-fields">
        <label>{t("findText")}<input value={query} onChange={(event) => { setQuery(event.target.value); invalidate(); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} /></label>
        <label>{t("replaceWith")}<input value={replacement} onChange={(event) => { setReplacement(event.target.value); invalidate(); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} /></label>
      </div>
      <label className="overview-descendants"><input type="checkbox" checked={matchCase} onChange={(event) => { setMatchCase(event.target.checked); invalidate(); }} />{t("matchCase")}</label>
      <p className="overview-hint">{t("replaceEmptyHint")}</p>
      <button type="submit" className="primary" disabled={!query}>{t("projectReplacePreview")}</button>
    </form>
    {preview && <>
      <p role="status">{t("replaceSelectedCount", { scenes: summary.scenes, count: summary.matches })}</p>
      {!preview.length ? <p>{t("replaceNoChanges")}</p> : <>
        <div className="find-actions">
          <button type="button" onClick={() => setSelected(new Set(preview.map((item) => item.sceneId)))}>{t("selectAllScenes")}</button>
          <button type="button" onClick={() => setSelected(new Set())}>{t("clearSceneSelection")}</button>
          {onApply && <button type="button" className="primary" disabled={!summary.scenes} onClick={async () => {
            const changes = preview.filter((item) => selected.has(item.sceneId)).map(({ sceneId, before, after }) => ({ sceneId, before, after }));
            await onApply(changes); invalidate();
          }}>{t("batchApply", { count: summary.scenes })}</button>}
        </div>
        <ol className="replacement-previews">{preview.map((item) => <li key={item.sceneId}>
          <label className="overview-descendants"><input type="checkbox" checked={selected.has(item.sceneId)} onChange={(event) => {
            const next = new Set(selected); if (event.target.checked) next.add(item.sceneId); else next.delete(item.sceneId); setSelected(next);
          }} /><strong>{item.title}</strong><span>{t("replaceChangeCount", { count: item.count })}</span></label>
          <p className="overview-hint">{t("replaceSampleHint", { count: item.examples.length })}</p>
          {item.examples.map((example, index) => <div className="replacement-example" key={index}>
            <div><strong>{t("replaceBefore")}</strong><pre>{example.before}</pre></div>
            <div><strong>{t("replaceAfter")}</strong><pre>{example.after}</pre></div>
          </div>)}
          <details><summary>{t("replaceFullPreview")}</summary><div className="replacement-example">
            <div><strong>{t("replaceBefore")}</strong><pre>{item.before}</pre></div>
            <div><strong>{t("replaceAfter")}</strong><pre>{item.after}</pre></div>
          </div></details>
        </li>)}</ol>
      </>}
    </>}
    </fieldset>
  </section>;
}
