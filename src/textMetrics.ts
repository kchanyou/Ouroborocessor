export type TextMetrics = {
  charactersWithSpaces: number;
  charactersWithoutSpaces: number;
  words: number;
  paragraphs: number;
  manuscriptPages: number;
};

const segmenters = new Map<string, Intl.Segmenter>();

function segments(text: string, granularity: "grapheme" | "word") {
  if ("Segmenter" in Intl) {
    let segmenter = segmenters.get(granularity);
    if (!segmenter) {
      segmenter = new Intl.Segmenter("ko", { granularity });
      segmenters.set(granularity, segmenter);
    }
    return segmenter.segment(text);
  }

  if (granularity === "word") {
    return text
      .trim()
      .split(/\s+/u)
      .filter(Boolean)
      .map((segment) => ({ segment, isWordLike: true }));
  }
  return Array.from(text).map((segment) => ({ segment, isWordLike: undefined }));
}

export function getCharacterCount(text: string): number {
  let count = 0;
  for (const { segment } of segments(text, "grapheme")) {
    if (!/^[\r\n]+$/u.test(segment)) count += 1;
  }
  return count;
}

export function getTextMetrics(text: string): TextMetrics {
  let charactersWithSpaces = 0;
  let charactersWithoutSpaces = 0;
  let words = 0;
  for (const { segment } of segments(text, "grapheme")) {
    if (!/^[\r\n]+$/u.test(segment)) charactersWithSpaces += 1;
    if (!/\s/u.test(segment)) charactersWithoutSpaces += 1;
  }
  for (const part of segments(text, "word")) {
    if (part.isWordLike) words += 1;
  }
  const paragraphs = text.trim()
    ? text
        .split(/\n+/u)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean).length
    : 0;

  return {
    charactersWithSpaces,
    charactersWithoutSpaces,
    words,
    paragraphs,
    manuscriptPages: charactersWithSpaces / 200,
  };
}
