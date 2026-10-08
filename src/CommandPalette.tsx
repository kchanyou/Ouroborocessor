import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "./i18n";
import { searchText } from "./quickOpen";
import { useModalDialog } from "./useModalDialog";

export type PaletteItem = { id: string; title: string; detail?: string; shortcut?: string; run: () => void };

const text = {
  ko: { commands: "명령 실행", files: "문서 열기", commandPlaceholder: "명령 검색", filePlaceholder: "문서 이름 검색", empty: "일치하는 항목이 없어요." },
  en: { commands: "Run command", files: "Open document", commandPlaceholder: "Search commands", filePlaceholder: "Search documents", empty: "No matching items." },
  es: { commands: "Ejecutar comando", files: "Abrir documento", commandPlaceholder: "Buscar comandos", filePlaceholder: "Buscar documentos", empty: "No hay resultados." },
  ja: { commands: "コマンドを実行", files: "原稿を開く", commandPlaceholder: "コマンドを検索", filePlaceholder: "原稿名を検索", empty: "一致する項目はありません。" },
  zh: { commands: "运行命令", files: "打开文稿", commandPlaceholder: "搜索命令", filePlaceholder: "搜索文稿", empty: "没有匹配项。" },
};

export function CommandPalette({ mode, locale, items, onClose }: { mode: "commands" | "files"; locale: Locale; items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const dialog = useModalDialog();
  const t = text[locale];
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    return needle ? items.filter(item => searchText(`${item.title} ${item.detail ?? ""}`, needle)) : items;
  }, [items, locale, query]);
  useEffect(() => { setActive(0); }, [query]);
  const activeIndex = Math.max(0, Math.min(active, filtered.length - 1));
  useEffect(() => { document.getElementById(`palette-item-${activeIndex}`)?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);
  const close = () => { dialog.current?.close(); onClose(); };
  const run = (item: PaletteItem | undefined) => { if (!item) return; close(); item.run(); };
  return <dialog ref={dialog} className="command-palette" aria-label={mode === "commands" ? t.commands : t.files}
    onCancel={event => { event.preventDefault(); close(); }}
    onMouseDown={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    }} onKeyDown={event => {
      // Results use aria-activedescendant; the combobox is the only tab stop.
      if (event.key === "Tab") { event.preventDefault(); input.current?.focus(); }
    }}>
      <input ref={input} autoFocus value={query} role="combobox" aria-label={mode === "commands" ? t.commandPlaceholder : t.filePlaceholder} aria-expanded="true" aria-controls="palette-results" aria-activedescendant={filtered.length ? `palette-item-${activeIndex}` : undefined} placeholder={mode === "commands" ? t.commandPlaceholder : t.filePlaceholder}
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key === "ArrowDown") { event.preventDefault(); setActive(Math.max(0, Math.min(filtered.length - 1, activeIndex + 1))); }
          if (event.key === "ArrowUp") { event.preventDefault(); setActive(Math.max(0, activeIndex - 1)); }
          if (event.key === "Enter") { event.preventDefault(); run(filtered[activeIndex]); }
        }} />
      <div className="command-list" role="listbox" id="palette-results">
        {filtered.map((item, index) => <button type="button" role="option" tabIndex={-1} id={`palette-item-${index}`} aria-selected={index === activeIndex} key={item.id}
          onMouseEnter={() => setActive(index)} onClick={() => run(item)}>
          <span><strong>{item.title}</strong>{item.detail && <small>{item.detail}</small>}</span>
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>)}
        {!filtered.length && <p className="command-empty">{t.empty}</p>}
      </div>
  </dialog>;
}
