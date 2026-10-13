import { useEffect, useMemo, useRef, useState } from "react";
import { findText, replaceCurrentMatch, replaceMatches } from "./findReplace";
import { editorMatchOffsets } from "./projectSearch";
import { translate, type Locale } from "./i18n";

export function FindPanel({ content, locale, onChange, onSelect, onClose }: {
  content: string; locale: Locale; onChange: (text: string) => void;
  onSelect: (start: number, end: number) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(true);
  const [index, setIndex] = useState(0);
  const [undo, setUndo] = useState<{ before: string; after: string; index: number } | null>(null);
  const composing = useRef(false);
  const queryInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const matches = useMemo(() => findText(content, query, matchCase), [content, query, matchCase]);
  const active = matches.length ? index % matches.length : 0;
  const select = useRef(onSelect);
  select.current = onSelect;
  useEffect(() => {
    // Do not move the writing cursor when the manuscript changes outside this panel.
    if (!matches[active] || !panel.current?.contains(document.activeElement)) return;
    const { start, end } = editorMatchOffsets({ source: content, ...matches[active] });
    select.current(start, end);
  }, [content, matches, active]);
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  function navigate(direction: number) {
    if (!matches.length) return;
    const next = (active + direction + matches.length) % matches.length;
    setIndex(next);
    const { start, end } = editorMatchOffsets({ source: content, ...matches[next] });
    onSelect(start, end);
  }
  function replace(all: boolean) {
    if (!matches.length || composing.current) return;
    // WebKit mouse clicks need not focus buttons. Keep selection effects and
    // subsequent keyboard navigation anchored in the search panel on every platform.
    queryInput.current?.focus();
    const result = all ? { content: replaceMatches(content, matches, replacement), index: 0 }
      : replaceCurrentMatch(content, query, replacement, matchCase, active);
    if (result.content !== content) {
      setUndo({ before: content, after: result.content, index: active });
      onChange(result.content);
    }
    setIndex(result.index);
  }
  return <section ref={panel} className="find-panel" aria-label={t("findReplace")}
    onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={(e) => {
    if (e.nativeEvent.isComposing || composing.current) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }}>
    <p>{t("findScope")}</p>
    <div className="find-fields">
      <label>{t("findText")}<input ref={queryInput} autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && !composing.current) { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); } }} /></label>
      <label>{t("replaceWith")}<input value={replacement} onChange={(e) => setReplacement(e.target.value)} /></label>
    </div>
    <label className="find-case"><input type="checkbox" checked={matchCase} onChange={(e) => { setMatchCase(e.target.checked); setIndex(0); }} />{t("matchCase")}</label>
    <p role="status">{t("matchCount", { current: matches.length ? active + 1 : 0, count: matches.length })}</p>
    {matches[active] && <p className="match-preview">
      {content.slice(Math.max(0, matches[active].start - 30), matches[active].start)}<mark>{content.slice(matches[active].start, matches[active].end)}</mark>{content.slice(matches[active].end, matches[active].end + 30)}
    </p>}
    <div className="find-actions">
      <button type="button" disabled={!matches.length} onClick={() => navigate(-1)}>{t("previousMatch")}</button>
      <button type="button" disabled={!matches.length} onClick={() => navigate(1)}>{t("nextMatch")}</button>
      <button type="button" disabled={!matches.length} onClick={() => replace(false)}>{t("replaceOne")}</button>
      <button type="button" disabled={!matches.length} onClick={() => replace(true)}>{t("replaceAllCount", { count: matches.length })}</button>
      <button type="button" disabled={!undo || undo.after !== content} onClick={() => { if (undo && undo.after === content) { queryInput.current?.focus(); onChange(undo.before); setIndex(undo.index); setUndo(null); } }}>{t("undoReplace")}</button>
      <button type="button" onClick={onClose}>{t("close")}</button>
    </div>
  </section>;
}
