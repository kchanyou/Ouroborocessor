import { useRef } from "react";
import type { Locale } from "./i18n";
import { defaultLayout, layoutText, type WorkspaceLayout } from "./workspaceLayout";

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
