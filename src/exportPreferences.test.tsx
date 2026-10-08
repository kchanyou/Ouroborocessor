import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExportDialog } from "./AppDialogs";
import { readExportFormat, rememberExportFormat } from "./exportPreferences";
import { uxText } from "./uxText";
import type { ProjectSnapshot } from "./types";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

it("remembers manuscript formats and rejects invalid or backup preferences", () => {
  expect(readExportFormat()).toBe("docx");
  rememberExportFormat("hwpx");
  expect(readExportFormat()).toBe("hwpx");
  localStorage.setItem("ouroborocessor.export-format.v1", '"backup"');
  expect(readExportFormat()).toBe("docx");
  localStorage.setItem("ouroborocessor.export-format.v1", "broken");
  expect(readExportFormat()).toBe("docx");
});

it("opens manuscript export and full-project backup with distinct controls", () => {
  const project: ProjectSnapshot = { projectPath: "/book.story", title: "Book", nodes: [], canUndo: false, canRedo: false };
  const render = (purpose: "document" | "backup") => renderToStaticMarkup(<ExportDialog project={project} selectedId={null} persist={async () => {}} locale="en" purpose={purpose} onClose={() => {}} />);
  rememberExportFormat("odt");
  expect(render("document")).toContain('value="odt" selected=""');
  expect(render("document")).toContain('id="export-scope"');
  expect(render("backup")).not.toContain('id="export-format"');
  expect(render("backup")).not.toContain('id="export-scope"');
  expect(readExportFormat()).toBe("odt");
});

it("keeps named actions and writing hints available in every supported language", () => {
  for (const dictionary of Object.values(uxText)) {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(uxText.en).sort());
    expect(Object.values(dictionary).every(value => value.trim())).toBe(true);
  }
});
