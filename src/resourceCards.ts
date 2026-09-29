import type { ResourceCard } from "./types";
export type ResourceDraft = { card: ResourceCard; expected: ResourceCard | null; aliasesText: string; tagsText: string };
export const resourceDraftKey = (path: string) => `ouroborocessor.resource-draft.v1:${path}`;
export function isResourceCard(value: unknown): value is ResourceCard {
  if (!value || typeof value !== "object") return false;
  const c = value as ResourceCard;
  return typeof c.id === "string" && !!c.id && ["character", "place", "setting"].includes(c.kind)
    && typeof c.name === "string" && typeof c.description === "string" && typeof c.deleted === "boolean"
    && Array.isArray(c.aliases) && c.aliases.every((s) => typeof s === "string")
    && Array.isArray(c.tags) && c.tags.every((s) => typeof s === "string");
}
export function parseResourceDraft(raw: string | null): ResourceDraft | null {
  if (raw === null) return null;
  const draft = JSON.parse(raw) as ResourceDraft;
  if (!draft || !isResourceCard(draft.card) || !(draft.expected === null || isResourceCard(draft.expected))
    || (draft.expected && draft.expected.id !== draft.card.id) || typeof draft.aliasesText !== "string" || typeof draft.tagsText !== "string") throw new Error("RESOURCE_DRAFT_INVALID");
  return draft;
}
export function draftCard(card: ResourceCard, expected: ResourceCard | null): ResourceDraft {
  return { card, expected, aliasesText: card.aliases.join("\n"), tagsText: card.tags.join("\n") };
}
export function materializeCard(draft: ResourceDraft): ResourceCard {
  const lines = (text: string) => [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  return { ...draft.card, name: draft.card.name.trim(), aliases: lines(draft.aliasesText), tags: lines(draft.tagsText) };
}
export function filterResourceCards(cards: ResourceCard[], query: string, trash: boolean): ResourceCard[] {
  const needle = query.trim().toLocaleLowerCase();
  return cards.filter((card) => card.deleted === trash && [card.name, card.description, ...card.aliases, ...card.tags].some((text) => text.toLocaleLowerCase().includes(needle)));
}
