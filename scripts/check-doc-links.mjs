import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function markdownFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const next = join(path, entry.name);
    if (entry.isDirectory()) return entry.name === "docs" ? markdownFiles(next) : [];
    return entry.name.endsWith(".md") ? [next] : [];
  });
}

const files = [
  ...readdirSync(root)
    .filter((name) => name.endsWith(".md"))
    .map((name) => join(root, name)),
  ...markdownFiles(join(root, "docs")),
];
const failures = [];

for (const file of files) {
  let inFence = false;
  for (const [index, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].trim().replace(/^<|>$/g, "");
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = decodeURIComponent(target.split("#", 1)[0]);
      const absolute = resolve(dirname(file), path);
      if (!existsSync(absolute) || (!statSync(absolute).isFile() && !statSync(absolute).isDirectory())) {
        failures.push(`${file.slice(root.length + 1)}:${index + 1} -> ${target}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`깨진 문서 링크 ${failures.length}개\n${failures.join("\n")}`);
  process.exit(1);
}

console.log(`문서 링크 확인 완료 · Markdown ${files.length}개`);
