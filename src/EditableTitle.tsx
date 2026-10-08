import { useRef, type KeyboardEvent, type Ref } from "react";

export type TitleCommit = "save" | "revert" | "none";

/** Blank titles fall back to the title the field had when editing started. */
export function titleCommitAction(original: string, value: string): TitleCommit {
  if (!value.trim()) return "revert";
  return value === original ? "none" : "save";
}

// parent updates the node on every keystroke (like the inspector) and persists on commit
export function EditableTitle({ id, value, label, inputRef, onChange, onCommit, onDone }: {
  id: string; value: string; label: string; inputRef?: Ref<HTMLInputElement>;
  onChange: (title: string) => void; onCommit: () => void; onDone: () => void;
}) {
  const original = useRef(value);
  const cancelled = useRef(false);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") { event.preventDefault(); onDone(); }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      onChange(original.current);
      onDone();
    }
  }

  function handleBlur() {
    const action = cancelled.current ? "none" : titleCommitAction(original.current, value);
    cancelled.current = false;
    if (action === "revert") onChange(original.current);
    if (action === "save") onCommit();
  }

  return <h1 id={id} className="editable-title">
    <input ref={inputRef} value={value} aria-label={label} title={label} spellCheck={false}
      onFocus={() => { original.current = value; cancelled.current = false; }}
      onChange={event => onChange(event.target.value)} onKeyDown={handleKeyDown} onBlur={handleBlur} />
  </h1>;
}
