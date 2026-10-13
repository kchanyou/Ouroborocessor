// The editor collapses CRLF to LF, while stored manuscripts retain their source text.
// Both offsets count UTF-16 code units, including surrogate pairs.
export function sourceOffsetForEditor(source: string, offset: number): number {
  let position = 0;
  for (let editor = 0; position < source.length && editor < offset; editor++) {
    position += source[position] === "\r" && source[position + 1] === "\n" ? 2 : 1;
  }
  return position;
}
