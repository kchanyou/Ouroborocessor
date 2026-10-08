import { readStored, writeStored } from "./workspaceSession";

export const manuscriptFormats = ["docx", "hwpx", "odt", "pdf", "html", "txt"] as const;
export type ManuscriptFormat = typeof manuscriptFormats[number];
const key = "ouroborocessor.export-format.v1";
export function readExportFormat(): ManuscriptFormat {
  const value = readStored(key);
  return manuscriptFormats.includes(value as ManuscriptFormat) ? value as ManuscriptFormat : "docx";
}
export function rememberExportFormat(format: ManuscriptFormat) { writeStored(key, format); }
