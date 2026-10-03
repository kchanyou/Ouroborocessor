import type { ManuscriptNode } from "./types";

const initials = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function normalize(value: string) { return value.normalize("NFC").toLocaleLowerCase(); }
export function searchText(text: string, query: string) {
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/).every(word => {
    if (haystack.includes(word)) return true;
    // Initials can be mixed with syllables (e.g. "ㅈ1장").
    const tokens = Array.from(word);
    if (!tokens.some(char => initials.includes(char))) return false;
    const chars = Array.from(haystack);
    return chars.some((_, at) => tokens.every((char, offset) => {
      const target = chars[at + offset];
      if (!target) return false;
      if (char === target) return true;
      const code = target.charCodeAt(0) - 0xac00;
      return initials.includes(char) && code >= 0 && code < 11172 && initials[Math.floor(code / 588)] === char;
    }));
  });
}
export function quickOpenDocuments(nodes: ManuscriptNode[], recent: string[]) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const ranks = new Map(recent.map((id, index) => [id, index]));
  return nodes.map(node => {
    const ancestors: string[] = [], seen = new Set([node.id]);
    let parent = node.parentId;
    while (parent && !seen.has(parent)) {
      seen.add(parent); const item = byId.get(parent); if (!item) break;
      ancestors.unshift(item.title); parent = item.parentId;
    }
    return { node, path: ancestors.join(" / ") };
  }).sort((a, b) => (ranks.get(a.node.id) ?? Infinity) - (ranks.get(b.node.id) ?? Infinity));
}
