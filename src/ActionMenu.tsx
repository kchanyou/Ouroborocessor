import { useEffect, useRef, type ReactNode } from "react";

export function ActionMenu({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) ref.current.open = false;
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  return <details ref={ref} className={`action-menu ${className}`} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
  }} onKeyDown={event => {
    if (event.key === "Escape" && ref.current?.open) {
      event.preventDefault(); event.stopPropagation(); ref.current.open = false;
      ref.current.querySelector("summary")?.focus();
    }
  }}>
    <summary>{label}<span aria-hidden="true">▾</span></summary>
    <div className="action-menu-content" onClick={event => {
      if (event.target instanceof Element && event.target.closest("button:not(:disabled)") && ref.current) {
        ref.current.open = false;
        if (ref.current.contains(document.activeElement)) ref.current.querySelector("summary")?.focus();
      }
    }}>{children}</div>
  </details>;
}
