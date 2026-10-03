export type ImportSource = { name: string; content: string };
export type ImportedScene = { title: string; content: string };
export function importScenes(sources: ImportSource[], split: boolean): ImportedScene[] {
  const scenes: ImportedScene[] = [];
  for (const source of sources) {
    const title = source.name.replace(/\.(?:txt|md|markdown)$/i, "").trim() || source.name;
    const text = source.content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (text.includes("\0")) throw new Error("IMPORT_INVALID");
    if (!split) { scenes.push({ title, content: text }); continue; }
    const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    let fence: string | null = null, offset = 0;
    const starts: { at: number; title: string }[] = [];
    for (const line of lines) {
      const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (delimiter) {
        if (!fence) fence = delimiter;
        else if (delimiter[0] === fence[0] && delimiter.length >= fence.length && new RegExp(`^ {0,3}${delimiter}\\s*$`).test(line)) fence = null;
      } else if (!fence) {
        const heading = /^ {0,3}#{1,6}[\t ]+(.+?)(?:[\t ]+#+)?[\t ]*\n?$/.exec(line);
        if (heading) starts.push({ at: offset, title: heading[1].trim() });
      }
      offset += line.length;
    }
    if (!starts.length) { scenes.push({ title, content: text }); continue; }
    if (starts[0].at > 0) scenes.push({ title, content: text.slice(0, starts[0].at) });
    for (let i = 0; i < starts.length; i++) scenes.push({ title: starts[i].title, content: text.slice(starts[i].at, starts[i + 1]?.at ?? text.length) });
  }
  if (scenes.length > 500) throw new Error("IMPORT_INVALID");
  return scenes;
}
export async function readImportFiles(files: File[]): Promise<ImportSource[]> {
  if (!files.length || files.length > 500 || files.some(file => !/\.(txt|md|markdown)$/i.test(file.name)) || files.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) throw new Error("IMPORT_INVALID");
  return Promise.all(files.map(async file => {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    if (content.includes("\0")) throw new Error("IMPORT_INVALID");
    return { name: file.name, content };
  }));
}
