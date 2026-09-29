import type { ResourceCard } from "./types";
export type ResourceLink = { start: number; end: number; label: string; id: string | null };
export function parseResourceLinks(text: string): ResourceLink[] {
  const links: ResourceLink[] = [];
  for (const match of text.matchAll(/\[\[([^\[\]\r\n]+)\]\]/g)) {
    const value = match[1];
    if (value.startsWith("resource:")) {
      const separator = value.indexOf("|");
      if (separator < 10) continue;
      try { links.push({ start: match.index!, end: match.index! + match[0].length, id: decodeURIComponent(value.slice(9, separator)), label: decodeURIComponent(value.slice(separator + 1)) }); } catch { /* Leave malformed source untouched. */ }
    } else links.push({ start: match.index!, end: match.index! + match[0].length, id: null, label: value });
  }
  return links;
}
export function resourceLinkText(card: ResourceCard): string {
  const label = card.name.replace(/[%|\[\]\r\n]/g, (char) => encodeURIComponent(char));
  return `[[resource:${encodeURIComponent(card.id)}|${label}]]`;
}

export function readableResourceText(content: string): string {
  let cursor = 0;
  let output = "";
  for (const link of parseResourceLinks(content)) {
    output += content.slice(cursor, link.start) + link.label;
    cursor = link.end;
  }
  return (output + content.slice(cursor)).replace(/!\[[^\]\n]*\]\(images\/image-[a-zA-Z0-9-]+\.(?:png|jpg|gif|webp)\)/g, "");
}
export function resolveResourceLink(link: ResourceLink, cards: ResourceCard[]): ResourceCard[] {
  return cards.filter((card) => !card.deleted && (link.id !== null ? card.id === link.id : [card.name, ...card.aliases].some((name) => name.normalize("NFC") === link.label.normalize("NFC"))));
}
export function resourceQuery(text: string, start: number, end: number) {
  if (start !== end || start < 0 || start > text.length) return null;
  const prefix = text.slice(0, start);
  const match = /\[\[([^\[\]\r\n|]*)$/.exec(prefix);
  if (!match || match[1].startsWith("resource:")) return null;
  return { start: start - match[0].length, end: start + (text.slice(start, start + 2) === "]]" ? 2 : 0), query: match[1] };
}
export function suggestResources(cards: ResourceCard[], query: string) {
  const needle = query.normalize("NFC").toLocaleLowerCase();
  return cards.filter((card) => !card.deleted && [card.name, ...card.aliases].some((name) => name.normalize("NFC").toLocaleLowerCase().includes(needle))).slice(0, 8);
}
