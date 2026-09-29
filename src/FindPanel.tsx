import { useMemo, useRef, useState } from "react";
import { findText, replaceMatches } from "./findReplace";
import { translate, type Locale } from "./i18n";

export function FindPanel({ content, locale, onChange, onSelect, onClose }: {
  content: string; locale: Locale; onChange: (text: string) => void;
  onSelect: (start: number, end: number) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(true);
  const [index, setIndex] = useState(0);
  const [undo, setUndo] = useState<{ before: string; after: string } | null>(null);
  const composing = useRef(false);
  const matches = useMemo(() => findText(content, query, matchCase), [content, query, matchCase]);
  const active = matches.length ? index % matches.length : 0;
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(locale, key, values);
  function navigate(direction: number) {
    if (!matches.length) return;
    const next = (active + direction + matches.length) % matches.length;
    setIndex(next); onSelect(matches[next].start, matches[next].end);
  }
  function replace(all: boolean) {
    if (!matches.length || composing.current) return;
    const after = replaceMatches(content, all ? matches : [matches[active]], replacement);
    if (after === content) return;
    setUndo({ before: content, after }); onChange(after); setIndex(0);
  }
  return <section className="find-panel" aria-label={t("findReplace")} onKeyDown={(e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  }}>
    <p>{t("findScope")}</p>
    <div className="find-fields">
      <label>{t("findText")}<input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); navigate(e.shiftKey ? -1 : 1); } }} /></label>
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
      <button type="button" disabled={!undo || undo.after !== content} onClick={() => { if (undo && undo.after === content) { onChange(undo.before); setUndo(null); } }}>{t("undoReplace")}</button>
      <button type="button" onClick={onClose}>{t("close")}</button>
    </div>
  </section>;
}
