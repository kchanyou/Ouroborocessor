import { expect, it } from "vitest";
import { getCharacterCount, getTextMetrics } from "./textMetrics";

// Uncached sidebar initialization; not a WebView input-latency measurement.
const scenes = Array.from({ length: 100 }, (_, index) =>
  `${index}: 한국어 English español 日本語 中文 👨‍👩‍👧‍👦\n`.repeat(100));
it("measures uncached counts for 100 multilingual scenes without a timing gate", () => {
  getTextMetrics(scenes[0]); getCharacterCount(scenes[0]);
  const measure = (count: (text: string) => number) => {
    const times: number[] = [];
    let total = 0;
    for (let run = 0; run < 3; run++) {
      const start = performance.now();
      total = scenes.reduce((sum, content) => sum + count(content), 0);
      times.push(performance.now() - start);
    }
    return { total, medianMs: times.sort((a, b) => a - b)[1] };
  };
  const previous = measure((text) => getTextMetrics(text).charactersWithSpaces);
  const current = measure(getCharacterCount);
  expect(current.total).toBe(previous.total);
  console.info("Sidebar count benchmark (Node, 100 scenes, median of 3)", { previous, current });
}, 15_000);
