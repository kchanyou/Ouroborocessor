import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { AppIcon } from "./AppIcon";
import type { Locale } from "./i18n";
import type { ResourceCard } from "./types";
import { resourceText } from "./resourceI18n";
import { listResourceCards } from "./tauriApi";
import type { EditorPort } from "./ManuscriptEditor";
import { parseResourceLinks, resolveResourceLink, type ResourceLink, resourceLinkText, resourceQuery, suggestResources } from "./resourceLinks";

export const linkText = {
  ko: { title: "레퍼런스", help: "본문에 [[와 이름을 입력하면 레퍼런스를 넣을 수 있어요. ↑↓로 고르고 Enter를 누르세요.", none: "이 원고에 넣은 레퍼런스가 없어요.", missing: "레퍼런스가 없거나 이름이 겹쳐요.", error: "레퍼런스를 불러오지 못했어요.", refresh: "레퍼런스 새로고침", bind: "ID 연결", bindHint: "이름이 바뀌어도 연결이 끊기지 않게 레퍼런스 ID를 함께 저장해요.", empty: "일치하는 레퍼런스가 없어요.", count: "{count}곳" },
  en: { title: "Linked research", help: "Type [[ and a name in the text to add a link. Choose with ↑↓, then press Enter.", none: "No research is linked in this document.", missing: "Research not found, or the name matches more than one.", error: "Could not load research.", refresh: "Refresh research", bind: "Bind ID", bindHint: "Saves the research ID in the text so the link survives a rename.", empty: "No matching research.", count: "{count} places" },
  es: { title: "Referencias vinculadas", help: "Escribe [[ y un nombre en el texto para añadir una referencia. Elige con ↑↓ y pulsa Enter.", none: "Este documento no tiene referencias.", missing: "No se encontró la referencia o el nombre está repetido.", error: "No se pudieron cargar las referencias.", refresh: "Actualizar referencias", bind: "Vincular ID", bindHint: "Guarda el ID de la referencia en el texto para que el vínculo siga funcionando si cambia el nombre.", empty: "No hay coincidencias.", count: "{count} lugares" },
  ja: { title: "リンク資料", help: "本文に [[ と名前を入力するとリンクできます。↑↓で選んでEnterを押してください。", none: "この原稿にリンクした資料はありません。", missing: "資料が見つからないか、名前が重複しています。", error: "資料を読み込めませんでした。", refresh: "資料を再読み込み", bind: "IDで接続", bindHint: "資料IDを本文に保存し、名前を変えてもリンクが切れないようにします。", empty: "一致する資料はありません。", count: "{count}か所" },
  zh: { title: "关联资料", help: "在正文中输入 [[ 和名称即可关联。用 ↑↓ 选择后按 Enter。", none: "此文稿没有关联资料。", missing: "资料不存在，或名称重复。", error: "无法加载资料。", refresh: "刷新资料", bind: "绑定 ID", bindHint: "在正文中保存资料 ID，改名后关联也不会失效。", empty: "没有匹配的资料。", count: "{count}处" },
};

export function ResourceLinks({ projectPath, content, editor, locale, onChange, onOpen }: {
  projectPath: string; content: string; editor: RefObject<EditorPort | null>; locale: Locale;
  onChange: (text: string) => void; onOpen: (card: ResourceCard) => void;
}) {
  const t = linkText[locale];
  const [cards, setCards] = useState<ResourceCard[]>([]);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState<ReturnType<typeof resourceQuery>>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const composing = useRef(false);
  const root = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => (root.current?.querySelector<HTMLElement>(".reference-list button") ?? root.current?.querySelector<HTMLElement>(".reference-popover button"))?.focus());
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    let live = true;
    setCards([]); setError(false);
    listResourceCards(projectPath).then((value) => { if (live) setCards(value); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [projectPath, refresh]);
  useEffect(() => {
    const reload = () => setRefresh((value) => value + 1);
    window.addEventListener("resources-changed", reload);
    window.addEventListener("focus", reload);
    return () => { window.removeEventListener("resources-changed", reload); window.removeEventListener("focus", reload); };
  }, []);
  const suggestions = query ? suggestResources(cards, query.query) : [];
  function insert(card: ResourceCard, range = query) {
    const element = editor.current;
    const normalized = content.replace(/\r\n?/g, "\n");
    if (!element || !range || element.value !== normalized || composing.current) return;
    const text = resourceLinkText(card);
    onChange(normalized.slice(0, range.start) + text + normalized.slice(range.end));
    setQuery(null);
    requestAnimationFrame(() => { element.focus(); element.setSelectionRange(range.start + text.length, range.start + text.length); });
  }
  useEffect(() => {
    const element = editor.current;
    if (!element) return;
    const update = () => { if (!composing.current) { setQuery(resourceQuery(element.value, element.selectionStart, element.selectionEnd)); setActive(0); } };
    const start = () => { composing.current = true; setQuery(null); };
    const end = () => { composing.current = false; update(); };
    const move = (raw: Event) => { const event = raw as KeyboardEvent; if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) update(); };
    element.addEventListener("input", update); element.addEventListener("click", update); element.addEventListener("select", update);
    element.addEventListener("keyup", move);
    element.addEventListener("compositionstart", start); element.addEventListener("compositionend", end);
    return () => {
      element.removeEventListener("input", update); element.removeEventListener("click", update); element.removeEventListener("select", update);
      element.removeEventListener("keyup", move);
      element.removeEventListener("compositionstart", start); element.removeEventListener("compositionend", end);
    };
  }, [editor]);
  useEffect(() => {
    const element = editor.current;
    const key = (raw: Event) => {
      const event = raw as KeyboardEvent;
      if (!query || composing.current || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") { event.preventDefault(); setQuery(null); }
      if (!suggestions.length) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((value) => (value + (event.key === "ArrowDown" ? 1 : suggestions.length - 1)) % suggestions.length); }
      if (event.key === "Enter") { event.preventDefault(); insert(suggestions[active % suggestions.length]); }
    };
    element?.addEventListener("keydown", key);
    return () => element?.removeEventListener("keydown", key);
  });
  const normalizedContent = content.replace(/\r\n?/g, "\n");
  const entries = referenceEntries(parseResourceLinks(normalizedContent), cards);
  const kinds = resourceText[locale];
  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  }
  return <section className="resource-links" ref={root}>
    <button type="button" ref={trigger} className="reference-trigger" aria-expanded={open} aria-controls={popoverId}
      onClick={() => setOpen((value) => !value)}>
      <AppIcon name="link" /><span>{t.title}</span><span className="reference-count">{entries.length}</span>
    </button>
    <div id={popoverId} className="reference-popover" role="dialog" aria-label={t.title} hidden={!open}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <header>
        <strong>{t.title}</strong>
        <button type="button" className="reference-icon-button" aria-label={t.refresh} title={t.refresh} onClick={() => setRefresh((v) => v + 1)}><AppIcon name="refresh" /></button>
      </header>
      {error && <p className="reference-note" role="alert">{t.error}</p>}
      {entries.length ? <ul className="reference-list">
        {entries.map((entry) => <li key={entry.key}>
          {entry.card ? <>
            <button type="button" className="reference-item" onClick={() => { onOpen(entry.card!); close(false); }}>
              <span>{entry.card.name}</span>
              <small>{kinds[entry.card.kind]}{entry.count > 1 && ` · ${t.count.replace("{count}", String(entry.count))}`}</small>
            </button>
            {entry.unbound && <button type="button" className="reference-bind" title={t.bindHint}
              onClick={() => insert(entry.card!, { ...entry.unbound!, query: "" })}>{t.bind}</button>}
          </> : <span className="reference-item is-missing"><span>{entry.label}</span><small>{t.missing}</small></span>}
        </li>)}
      </ul> : <p className="reference-note">{t.none}</p>}
      <p className="reference-help">{t.help}</p>
    </div>
    {error && !open && <p className="reference-error" role="alert">{t.error}</p>}
    {query && <div className="resource-suggestions" role="group" aria-label={t.title}>
      <span className="sr-only" role="status">{suggestions[active % Math.max(1, suggestions.length)]?.name ?? t.empty}</span>
      {!suggestions.length && <span>{t.empty}</span>}
      {suggestions.map((card, i) => <button type="button" key={card.id} aria-pressed={active % suggestions.length === i} onClick={() => insert(card)}>{card.name}</button>)}
    </div>}
  </section>;
}

type ReferenceEntry = { key: string; label: string; count: number; card?: ResourceCard; unbound?: ResourceLink };

/** One row per card however often it is linked; unresolved links stay separate so each can be fixed. */
function referenceEntries(links: ResourceLink[], cards: ResourceCard[]) {
  const entries: ReferenceEntry[] = [];
  for (const link of links) {
    const matches = resolveResourceLink(link, cards);
    if (matches.length !== 1) { entries.push({ key: `missing:${link.start}`, label: link.label, count: 1 }); continue; }
    const card = matches[0];
    const entry = entries.find((item) => item.card?.id === card.id);
    if (entry) { entry.count += 1; entry.unbound ??= link.id ? undefined : link; }
    else entries.push({ key: card.id, label: card.name, count: 1, card, unbound: link.id ? undefined : link });
  }
  return entries;
}
