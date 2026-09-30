import { expect, it } from "vitest";
import { overviewItems } from "./GroupOverview";
import { searchProject } from "./projectSearch";
import { getCharacterCount } from "./textMetrics";
import type { ManuscriptNode } from "./types";

const group: ManuscriptNode = { id: "root", parentId: null, kind: "group", title: "장편", content: "", synopsis: "", status: "" };
const body = "한국어 English español 日本語 中文 장면의 문장과 검색 기준어. ".repeat(6);
const nodes: ManuscriptNode[] = [group, ...Array.from({ length: 500 }, (_, index) => ({
  id: `scene-${index}`,
  parentId: "root",
  kind: "scene" as const,
  title: `장면 ${index}`,
  content: body,
  synopsis: index % 20 === 0 ? "전환점" : "",
  status: "draft",
}))];

function median(run: () => void) {
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

it("keeps 500-scene search and overview preparation within the desktop CPU budget", () => {
  let matches = 0;
  let characters = 0;
  const searchMedianMs = median(() => { matches = searchProject(nodes, "검색 기준어", true).count; });
  const overviewMedianMs = median(() => { expect(overviewItems(nodes, "root", "전환점", true)).toHaveLength(25); });
  const countMedianMs = median(() => { characters = nodes.reduce((sum, node) => sum + getCharacterCount(node.content), 0); });
  expect(matches).toBe(3_000);
  expect(characters).toBeGreaterThan(100_000);
  // loose on purpose for CI runners
  expect(searchMedianMs).toBeLessThan(500);
  expect(overviewMedianMs).toBeLessThan(500);
  expect(countMedianMs).toBeLessThan(500);
  console.info("Long project benchmark (Node, 500 scenes)", { characters, searchMedianMs, overviewMedianMs, countMedianMs });
}, 15_000);
