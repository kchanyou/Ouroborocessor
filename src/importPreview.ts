const pageSize = 4000;

// Adjust shared page boundaries so a UTF-16 surrogate pair stays together.
export function importPreviewPage(content: string, page: number) {
  const pages = Math.max(1, Math.ceil(content.length / pageSize));
  const index = Number.isFinite(page) ? Math.max(0, Math.min(pages - 1, Math.floor(page))) : 0;
  const boundary = (offset: number) => {
    const at = Math.min(content.length, offset);
    const before = content.charCodeAt(at - 1), after = content.charCodeAt(at);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? at - 1 : at;
  };
  return { index, pages, text: content.slice(boundary(index * pageSize), boundary((index + 1) * pageSize)) };
}
