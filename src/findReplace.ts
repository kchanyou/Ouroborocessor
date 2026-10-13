export type TextMatch = { start: number; end: number };

export function findText(text: string, query: string, matchCase = true): TextMatch[] {
  if (!query) return [];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(escaped, matchCase ? "gu" : "giu");
  return Array.from(text.matchAll(expression), (match) => ({ start: match.index, end: match.index + match[0].length }));
}

export function replaceMatches(text: string, matches: TextMatch[], replacement: string): string {
  let cursor = 0;
  const parts: string[] = [];
  for (const match of matches) {
    parts.push(text.slice(cursor, match.start), replacement);
    cursor = match.end;
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

export function replaceCurrentMatch(text: string, query: string, replacement: string, matchCase: boolean, index: number) {
  const matches = findText(text, query, matchCase);
  const match = matches[index];
  if (!match) return { content: text, index: 0 };
  const content = replaceMatches(text, [match], replacement);
  // Continue after the inserted text, even when it contains the search term.
  const next = findText(content, query, matchCase).findIndex(item => item.start >= match.start + replacement.length);
  return { content, index: Math.max(0, next) };
}

export function normalizeNumber(raw: string, current: number, min: number, max: number, step: number): number {
  if (!raw.trim()) return current;
  const value = Number(raw);
  if (!Number.isFinite(value)) return current;
  const bounded = Math.min(max, Math.max(min, value));
  return Number((min + Math.round((bounded - min) / step) * step).toFixed(4));
}
