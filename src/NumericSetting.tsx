import { useEffect, useState } from "react";
import { normalizeNumber } from "./findReplace";

export function NumericSetting({ value, label, min, max, step, onChange }: {
  value: number; label: string; min: number; max: number; step: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    const next = normalizeNumber(draft, value, min, max, step);
    setDraft(String(next)); onChange(next);
  }
  return <input className="numeric-setting" type="number" inputMode="decimal" aria-label={label} min={min} max={max} step={step}
    value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
      if (e.key === "Escape" && draft !== String(value)) { e.preventDefault(); e.stopPropagation(); setDraft(String(value)); }
    }} />;
}
