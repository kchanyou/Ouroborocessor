import { exportScope } from "./exportScope";
import { findText, replaceMatches } from "./findReplace";
import type { ManuscriptNode } from "./types";

export type ReplacementPreview = {
  sceneId: string; title: string; before: string; after: string; count: number;
  examples: { before: string; after: string }[];
};
export type BatchChange = { sceneId: string; before: string; after: string };
export type BatchResult = { completed: string[]; failedScene: string | null; error: string | null; journalPath: string };

export function validateBatchSnapshot(nodes: ManuscriptNode[], changes: BatchChange[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const ids = new Set<string>();
  if (!changes.length) throw new Error("BATCH_EMPTY");
  for (const change of changes) {
    const node = byId.get(change.sceneId);
    if (ids.has(change.sceneId) || node?.kind !== "scene" || node.content !== change.before) throw new Error("SEARCH_STALE");
    ids.add(change.sceneId);
  }
}

// no file or recovery writes here
export function previewProjectReplacement(nodes: ManuscriptNode[], query: string, replacement: string, matchCase: boolean): ReplacementPreview[] {
  if (!query) return [];
  return exportScope(nodes, null).flatMap(({ node }) => {
    if (node.kind !== "scene") return [];
    const matches = findText(node.content, query, matchCase);
    if (!matches.length) return [];
    const after = replaceMatches(node.content, matches, replacement);
    if (after === node.content) return [];
    return [{ sceneId: node.id, title: node.title, before: node.content, after, count: matches.length,
      examples: matches.slice(0, 5).map((match) => {
        const prefix = node.content.slice(Math.max(0, match.start - 30), match.start);
        const suffix = node.content.slice(match.end, match.end + 30);
        return { before: prefix + node.content.slice(match.start, match.end) + suffix, after: prefix + replacement + suffix };
      }) }];
  });
}

export function replacementSelectionSummary(preview: ReplacementPreview[], selected: ReadonlySet<string>) {
  const scenes = preview.filter((item) => selected.has(item.sceneId));
  return { scenes: scenes.length, matches: scenes.reduce((sum, item) => sum + item.count, 0) };
}
