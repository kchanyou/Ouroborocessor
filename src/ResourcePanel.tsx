import { useEffect, useRef, useState } from "react";
import type { Locale } from "./i18n";
import type { ResourceCard } from "./types";
import { listResourceCards, saveResourceCard } from "./tauriApi";
import { draftCard, filterResourceCards, materializeCard, parseResourceDraft, resourceDraftKey, type ResourceDraft } from "./resourceCards";
import { resourceText } from "./resourceI18n";
import { ResourceBacklinksPanel } from "./ResourceBacklinksPanel";
import type { ManuscriptNode } from "./types";
import type { ProjectMatch } from "./projectSearch";

export function ResourcePanel({ projectPath, locale, nodes, onNavigate, onOpenCard }: { projectPath: string; locale: Locale; nodes?: ManuscriptNode[]; onNavigate?: (hit: ProjectMatch) => Promise<void>; onOpenCard?: (card: ResourceCard) => void }) {
  const t = resourceText[locale];
  const [cards, setCards] = useState<ResourceCard[]>([]);
  const [draft, setDraft] = useState<ResourceDraft | null>(null);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [trash, setTrash] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const key = resourceDraftKey(projectPath);
  useEffect(() => {
    let active = true;
    listResourceCards(projectPath).then((loaded) => {
      if (!active) return;
      const recovered = parseResourceDraft(localStorage.getItem(key));
      setCards(loaded); setDraft(recovered); setSelected(recovered?.card.id ?? ""); setReady(true);
    }).catch(() => { if (active) setError("load"); });
    return () => { active = false; generation.current++; };
  }, [projectPath, key]);
  function keep(next: ResourceDraft) {
    try { localStorage.setItem(key, JSON.stringify(next)); setDraft(next); setStatus(false); setError(""); }
    catch { setError("storage"); }
  }
  function discard() {
    try { localStorage.removeItem(key); setDraft(null); setError(""); setStatus(false); }
    catch { setError("storage"); }
  }
  async function reload() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const token = generation.current;
    try {
      const loaded = await listResourceCards(projectPath);
      const recovered = parseResourceDraft(localStorage.getItem(key));
      if (token === generation.current) { setCards(loaded); setDraft(recovered); setReady(true); }
    } catch { if (token === generation.current) setError("load"); }
    finally { lock.current = false; if (token === generation.current) setBusy(false); }
  }
  async function save(card: ResourceCard, expected: ResourceCard | null, clearDraft: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setStatus(false);
    const token = generation.current;
    try {
      const loaded = await saveResourceCard(projectPath, card, expected);
      window.dispatchEvent(new Event("resources-changed"));
      // don't wipe a newer draft (panel reopened)
      if (clearDraft && localStorage.getItem(key) === JSON.stringify(draft)) localStorage.removeItem(key);
      if (token === generation.current) { setCards(loaded); if (clearDraft) setDraft(null); setSelected(card.id); setStatus(true); }
    } catch (reason) { if (token === generation.current) setError(String(reason).includes("RESOURCE_CONFLICT") ? "conflict" : "save"); }
    finally { lock.current = false; if (token === generation.current) setBusy(false); }
  }
  const card = cards.find((item) => item.id === selected && item.deleted === trash);
  const visible = filterResourceCards(cards, query, trash);
  return <section className="resource-panel" aria-label={t.title} onKeyDown={(event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault(); event.stopPropagation();
      if (!event.nativeEvent.isComposing && draft && ready && draft.card.name.trim()) void save(materializeCard(draft), draft.expected, true);
    }
  }}>
    <p>{t.help}</p>
    {!ready && !error && <p role="status">{t.loading}</p>}
    {error && <p role="alert">{error === "conflict" ? t.conflict : t.error}</p>}
    {!ready && error && <button type="button" disabled={busy} onClick={() => { discard(); void reload(); }}>{t.discard}</button>}
    {status && <p role="status">{t.saved}</p>}
    <button type="button" disabled={busy} onClick={() => void reload()}>{t.retry}</button>
    <fieldset disabled={busy || !ready}>
      <div className="resource-actions">
        <button type="button" disabled={!!draft} onClick={() => {
          keep(draftCard({ id: crypto.randomUUID(), kind: "character", name: "", description: "", aliases: [], tags: [], deleted: false }, null));
        }}>{t.create}</button>
        <button type="button" disabled={!!draft} aria-pressed={trash} onClick={() => { setTrash(!trash); setSelected(""); }}>{t.trash}</button>
      </div>
      {draft ? <form onSubmit={(event) => { event.preventDefault(); void save(materializeCard(draft), draft.expected, true); }}>
        <p role="status">{t.draft}</p>
        <label>{t.kind}<select value={draft.card.kind} onChange={(e) => keep({ ...draft, card: { ...draft.card, kind: e.target.value as ResourceCard["kind"] } })}>
          {(["character", "place", "setting"] as const).map((kind) => <option key={kind} value={kind}>{t[kind]}</option>)}
        </select></label>
        <label>{t.name}<input autoFocus required value={draft.card.name} onChange={(e) => keep({ ...draft, card: { ...draft.card, name: e.target.value } })} /></label>
        <label>{t.description}<textarea value={draft.card.description} onChange={(e) => keep({ ...draft, card: { ...draft.card, description: e.target.value } })} /></label>
        <label>{t.aliases}<textarea rows={2} value={draft.aliasesText} onChange={(e) => keep({ ...draft, aliasesText: e.target.value })} /></label>
        <label>{t.tags}<textarea rows={2} value={draft.tagsText} onChange={(e) => keep({ ...draft, tagsText: e.target.value })} /></label>
        <div className="resource-actions"><button type="submit" disabled={!draft.card.name.trim()}>{t.save}</button><button type="button" onClick={discard}>{t.discard}</button></div>
      </form> : <>
        <label>{t.search}<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {!visible.length && <p>{t.empty}</p>}
        <ul className="resource-list">{visible.map((item) => <li key={item.id}><button type="button" aria-pressed={!onOpenCard && selected === item.id} onClick={() => { setStatus(false); if (onOpenCard) onOpenCard(item); else setSelected(item.id); }}>{item.name} · {t[item.kind]}</button></li>)}</ul>
        {card && <article>
          <h3>{card.name}</h3><p>{t[card.kind]}</p>
          <p className="resource-description">{card.description}</p>
          <dl><dt>{t.aliases}</dt><dd>{card.aliases.join(" · ")}</dd><dt>{t.tags}</dt><dd>{card.tags.join(" · ")}</dd></dl>
          <div className="resource-actions">
            {!trash && <button type="button" onClick={() => keep(draftCard(card, card))}>{t.edit}</button>}
            <button type="button" onClick={() => void save({ ...card, deleted: !card.deleted }, card, false)}>{trash ? t.restore : t.remove}</button>
          </div>
          {nodes && onNavigate && <ResourceBacklinksPanel key={card.id} projectPath={projectPath} nodes={nodes} resourceId={card.id} locale={locale} onNavigate={onNavigate} />}
        </article>}
      </>}
    </fieldset>
  </section>;
}
