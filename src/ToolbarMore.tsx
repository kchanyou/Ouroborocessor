import { useEffect, useRef, type ReactNode } from "react";
import type { Locale } from "./i18n";

const labels = { ko: "더 보기", en: "More", es: "Más", ja: "その他", zh: "更多" };

export function ToolbarMore({ locale, children }: { locale: Locale; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) {
        ref.current.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <details ref={ref} className="toolbar-more" onKeyDown={(event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (ref.current) ref.current.open = false;
      ref.current?.querySelector("summary")?.focus();
    }
  }}>
    <summary aria-label={labels[locale]} title={labels[locale]}>•••</summary>
    <div className="toolbar-more-content" onClick={(event) => {
      if (event.target instanceof Element && event.target.closest("button")) {
        if (ref.current) ref.current.open = false;
        if (ref.current?.contains(document.activeElement)) ref.current.querySelector("summary")?.focus();
      }
    }}>{children}</div>
  </details>;
}
