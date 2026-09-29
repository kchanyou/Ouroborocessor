import { exportScope } from "./exportScope";
import { parseResourceLinks, resolveResourceLink } from "./resourceLinks";
import type { ManuscriptNode, ResourceCard } from "./types";
import type { ProjectMatch } from "./projectSearch";

export function resourceBacklinks(nodes: ManuscriptNode[], cards: ResourceCard[], resourceId: string, limit = 200) {
  const hits: ProjectMatch[] = [];
  let count = 0;
  let scenes = 0;
  for (const { node } of exportScope(nodes, null)) {
    if (node.kind !== "scene") continue;
    let found = false;
    for (const link of parseResourceLinks(node.content)) {
      const matches = link.id === null ? resolveResourceLink(link, cards) : [];
      if (link.id !== resourceId && !(link.id === null && matches.length === 1 && matches[0].id === resourceId)) continue;
      found = true; count++;
      if (hits.length < limit) hits.push({ sceneId: node.id, title: node.title, start: link.start, end: link.end, source: node.content });
    }
    if (found) scenes++;
  }
  return { hits, count, scenes };
}
