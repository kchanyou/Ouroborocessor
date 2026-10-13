import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Locale } from "./i18n";
import { defaultLayout, layoutText, splitText, splitRatioAt, type SplitDirection, type WorkspaceLayout } from "./workspaceLayout";

export function WorkspaceControls({ locale, value, onChange }: {
  locale: Locale; value: WorkspaceLayout; onChange: (value: WorkspaceLayout) => void;
}) {
  const t = layoutText[locale];
  return <section className="settings-section workspace-settings" aria-labelledby="workspace-settings">
    <h3 id="workspace-settings">{t.title}</h3>
    {([ ["navigatorWidth", "navigator", 190, 360], ["inspectorWidth", "inspector", 240, 380] ] as const).map(([key, label, min, max]) => <label key={key} className="range-row">
      <span>{t[label]} <output>{value[key]}px</output></span>
      <input type="range" min={min} max={max} value={value[key]} onChange={(event) => onChange({ ...value, [key]: Number(event.target.value) })} />
    </label>)}
    <label className="setting-row"><span>{splitText[locale].title}</span><select value={value.splitDirection} onChange={event => onChange({ ...value, splitDirection: event.target.value as SplitDirection })}>
      {(["right", "left", "down", "up"] as const).map(direction => <option key={direction} value={direction}>{splitText[locale][direction]}</option>)}
    </select></label>
    <p>{splitText[locale].hint}</p>
    <p>{t.hint}</p>
    <button type="button" className="secondary-setting-button" onClick={() => onChange({ ...defaultLayout })}>{t.reset}</button>
  </section>;
}

export function PanelResize({ value, min, max, side, label, onChange }: {
  value: number; min: number; max: number; side: "left" | "right"; label: string; onChange: (value: number) => void;
}) {
  const start = useRef<{ x: number; value: number } | null>(null);
  const change = (next: number) => onChange(Math.max(min, Math.min(max, Math.round(next))));
  return <div className={`panel-resize resize-${side}`} role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} tabIndex={0}
    onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); start.current = { x: event.clientX, value }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => { if (start.current) change(start.current.value + (event.clientX - start.current.x) * (side === "right" ? 1 : -1)); }}
    onPointerUp={(event) => { start.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { start.current = null; }} onLostPointerCapture={() => { start.current = null; }}
    onKeyDown={(event) => { if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return; event.preventDefault(); change(event.key === "Home" ? min : event.key === "End" ? max : value + (event.key === "ArrowRight" ? 10 : -10) * (side === "right" ? 1 : -1)); }} />;
}

export function SplitResize({ direction, value, label, onChange }: {
  direction: SplitDirection; value: number; label: string; onChange: (value: number) => void;
}) {
  const dragging = useRef(false);
  const horizontal = direction === "right" || direction === "left";
  const change = (value: number) => onChange(Math.max(0.15, Math.min(0.85, value)));
  return <div className={`split-resize split-resize-${direction}`} role="separator" aria-label={label}
    aria-orientation={horizontal ? "vertical" : "horizontal"} aria-valuemin={15} aria-valuemax={85} aria-valuenow={Math.round(value * 100)} tabIndex={0}
    onDoubleClick={() => onChange(0.5)}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => {
      if (!dragging.current) return;
      const rect = event.currentTarget.closest(".pane-row")?.getBoundingClientRect();
      if (rect) change(splitRatioAt(direction, event.clientX, event.clientY, rect));
    }}
    onPointerUp={event => { dragging.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
    onPointerCancel={() => { dragging.current = false; }} onLostPointerCapture={() => { dragging.current = false; }}
    onKeyDown={event => {
      const negative = horizontal ? "ArrowLeft" : "ArrowUp", positive = horizontal ? "ArrowRight" : "ArrowDown";
      if (![negative, positive, "Home", "End", "Enter"].includes(event.key)) return;
      event.preventDefault();
      const sign = direction === "right" || direction === "down" ? -1 : 1;
      change(event.key === "Home" ? 0.15 : event.key === "End" ? 0.85 : event.key === "Enter" ? 0.5 : value + (event.key === positive ? 0.02 : -0.02) * sign);
    }} />;
}

export function PaneLayoutMenu({ locale, direction, disabled, split, onChoose, onEqualize }: {
  locale: Locale; direction: SplitDirection; disabled: boolean; split: boolean;
  onChoose: (direction: SplitDirection) => void; onEqualize: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const t = splitText[locale];
  const close = () => { if (ref.current) ref.current.open = false; setOpen(false); };
  const finish = () => { close(); ref.current?.querySelector("summary")?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = ref.current?.getBoundingClientRect(), menu = menuRef.current;
      if (!anchor || !menu) return;
      const width = menu.offsetWidth, height = menu.offsetHeight;
      menu.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(anchor.bottom, window.innerHeight - height - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    if (ref.current?.parentElement) observer.observe(ref.current.parentElement);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, direction, locale]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !menuRef.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return <details ref={ref} className="pane-layout-menu" onToggle={event => setOpen(event.currentTarget.open)} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(); }
    if (event.key === "Tab" && !event.shiftKey && event.target === ref.current?.querySelector("summary") && open) {
      const first = menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      if (first) { event.preventDefault(); first.focus(); }
    }
  }}>
    <summary aria-label={t.title} title={t.title} aria-expanded={open}>◫</summary>
    {open && createPortal(<div ref={menuRef} className="pane-layout-options" onKeyDown={event => {
      if (event.key === "Tab" && event.shiftKey && event.target === menuRef.current?.querySelector("button:not(:disabled)")) {
        event.preventDefault(); ref.current?.querySelector("summary")?.focus();
      }
    }} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget) && !ref.current?.contains(event.relatedTarget)) close();
    }}>
      {(["right", "left", "down", "up"] as const).map(item => <button key={item} type="button" disabled={disabled} aria-pressed={direction === item}
        onClick={() => { onChoose(item); finish(); }}>{t[item]}</button>)}
      <button type="button" disabled={!split} onClick={() => { onEqualize(); finish(); }}>{t.equal}</button>
    </div>, document.body)}
  </details>;
}
