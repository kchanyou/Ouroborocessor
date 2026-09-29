import { useEffect, useRef, useState, type RefObject } from "react";
import type { Locale } from "./i18n";
import type { ResourceCard } from "./types";
import { listResourceCards } from "./tauriApi";
import type { EditorPort } from "./ManuscriptEditor";
import { parseResourceLinks, resolveResourceLink, resourceLinkText, resourceQuery, suggestResources } from "./resourceLinks";

export const linkText = {
  ko: { title: "연결 자료", help: "[[ 뒤에 이름을 입력하고 ↑↓로 고른 뒤 Enter로 연결해요. Esc로 닫아요. 원문에는 자료 ID가 함께 저장돼요.", missing: "자료가 없거나 이름이 겹쳐요.", error: "자료를 불러오지 못했어요.", refresh: "자료 새로고침", bind: "ID 연결", empty: "일치하는 자료가 없어요." },
  en: { title: "Linked research", help: "Type [[ and a name, choose with ↑↓, then press Enter to link. Esc closes the list. The research ID is saved in the text.", missing: "Research not found, or the name matches more than one.", error: "Could not load research.", refresh: "Refresh research", bind: "Bind ID", empty: "No matching research." },
  es: { title: "Referencias vinculadas", help: "Escribe [[ y un nombre, elige con ↑↓ y pulsa Enter para vincular. Esc cierra la lista. El texto guarda el ID de la referencia.", missing: "No se encontró la referencia o el nombre está repetido.", error: "No se pudieron cargar las referencias.", refresh: "Actualizar referencias", bind: "Vincular ID", empty: "No hay coincidencias." },
  ja: { title: "リンク資料", help: "[[ に続けて名前を入力し、↑↓で選んでEnterでリンクします。Escで閉じます。本文には資料IDも保存されます。", missing: "資料が見つからないか、名前が重複しています。", error: "資料を読み込めませんでした。", refresh: "資料を再読み込み", bind: "IDで接続", empty: "一致する資料はありません。" },
  zh: { title: "关联资料", help: "输入 [[ 和名称，用 ↑↓ 选择后按 Enter 关联。按 Esc 关闭。正文中会同时保存资料 ID。", missing: "资料不存在，或名称重复。", error: "无法加载资料。", refresh: "刷新资料", bind: "绑定 ID", empty: "没有匹配的资料。" },
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
  const composing = useRef(false);
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
  const links = parseResourceLinks(normalizedContent);
  return <section className="resource-links" aria-label={t.title}>
    <details><summary>{t.title} ({links.length})</summary><p>{t.help}</p>
      <button type="button" onClick={() => setRefresh((v) => v + 1)}>{t.refresh}</button>
      {links.map((link) => {
        const matches = resolveResourceLink(link, cards);
        return <div key={link.start}>{matches.length === 1 ? <>
          <button type="button" onClick={() => onOpen(matches[0])}>{matches[0].name}</button>
          {!link.id && <button type="button" onClick={() => insert(matches[0], { ...link, query: "" })}>{t.bind}</button>}
        </> : <span>{link.label} — {t.missing}</span>}</div>;
      })}
    </details>
    {error && <p role="alert">{t.error}</p>}
    {query && <div className="resource-suggestions" role="group" aria-label={t.title}>
      <span className="sr-only" role="status">{suggestions[active % Math.max(1, suggestions.length)]?.name ?? t.empty}</span>
      {!suggestions.length && <span>{t.empty}</span>}
      {suggestions.map((card, i) => <button type="button" key={card.id} aria-pressed={active % suggestions.length === i} onClick={() => insert(card)}>{card.name}</button>)}
    </div>}
  </section>;
}
