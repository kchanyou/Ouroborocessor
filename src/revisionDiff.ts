export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

// Preserve exact source text. Bound memory for book-length replacements.
export function revisionDiff(before: string, after: string): DiffPart[] {
  if (before === after) return [{ kind: "same", text: before }];
  const tokens = (text: string) => text.match(/\s+|[^\s]+/gu) ?? [];
  const a = tokens(before), b = tokens(after);
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const x = a.slice(prefix, a.length - suffix), y = b.slice(prefix, b.length - suffix);
  const parts: DiffPart[] = [];
  const add = (kind: DiffPart["kind"], text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text; else parts.push({ kind, text });
  };
  add("same", a.slice(0, prefix).join(""));
  if (x.length * y.length > 1_000_000) {
    add("removed", x.join("")); add("added", y.join(""));
  } else {
    const width = y.length + 1;
    const table = new Uint32Array((x.length + 1) * width);
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--)
      table[i * width + j] = x[i] === y[j] ? 1 + table[(i + 1) * width + j + 1] : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    let i = 0, j = 0;
    while (i < x.length || j < y.length) {
      if (i < x.length && j < y.length && x[i] === y[j]) { add("same", x[i++]); j++; }
      else if (i < x.length && (j === y.length || table[(i + 1) * width + j] >= table[i * width + j + 1])) add("removed", x[i++]);
      else add("added", y[j++]);
    }
  }
  add("same", suffix ? a.slice(-suffix).join("") : "");
  return parts;
}
