import { exportScope } from "./exportScope";
import type { ManuscriptNode } from "./types";

export type ProjectMatch = { sceneId: string; title: string; start: number; end: number; source: string };
export function editorMatchOffsets(hit: ProjectMatch) {
  // textarea turns CRLF into LF, offsets are UTF-16
  return { start: hit.source.slice(0, hit.start).replace(/\r\n/g, "\n").length,
    end: hit.source.slice(0, hit.end).replace(/\r\n/g, "\n").length };
}
export function searchProject(nodes: ManuscriptNode[], query: string, matchCase: boolean, limit = 200) {
  const hits: ProjectMatch[] = [];
  let count = 0;
  let scenes = 0;
  if (!query) return { hits, count, scenes };
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const expression = new RegExp(escaped, matchCase ? "gu" : "giu");
  for (const { node } of exportScope(nodes, null)) {
    if (node.kind !== "scene") continue;
    let found = false;
    for (const match of node.content.matchAll(expression)) {
      found = true; count++;
      if (hits.length < limit) hits.push({ sceneId: node.id, title: node.title, start: match.index, end: match.index + match[0].length, source: node.content });
    }
    if (found) scenes++;
  }
  return { hits, count, scenes };
}
