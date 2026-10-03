import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { insertTab, normalizeSession, readPosition, readSession, recentProjects, relocateSession, rememberProject, savePosition, saveSession } from "./workspaceSession";
import { defaultLayout } from "./workspaceLayout";
import type { ProjectSnapshot } from "./types";

const project: ProjectSnapshot = { projectPath: "/one.story", title: "One", canUndo: false, canRedo: false, nodes: [
  { id: "g", kind: "group", parentId: null, title: "Group", content: "", synopsis: "", status: "" },
  { id: "s", kind: "scene", parentId: "g", title: "Scene", content: "abcdef", synopsis: "", status: "draft" },
] };
const session = { main: ["node:g", "node:s"], side: ["node:s"], active: "node:s", sideActive: "node:s", collapsed: ["g"], recent: ["s"], references: [], layout: defaultLayout };
beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

it("restores two panes independently and isolates project sessions", () => {
  saveSession(project.projectPath, session);
  savePosition(project.projectPath, "s", "main", { anchor: 2, head: 4, top: 120, left: 0 });
  savePosition(project.projectPath, "s", "side", { anchor: 5, head: 5, top: 400, left: 0 });
  expect(readSession(project)).toEqual(session);
  expect(readSession({ ...project, projectPath: "/another.story" })).toBeNull();
  expect(readPosition(project.projectPath, "s", "main", 6)?.top).toBe(120);
  expect(readPosition(project.projectPath, "s", "side", 6)?.top).toBe(400);
  expect(readPosition(project.projectPath, "s", "main", 3)?.head).toBe(3);
});

it("drops removed nodes and malformed persisted values without losing valid tabs", () => {
  expect(normalizeSession({ ...session, main: ["node:s", "node:gone", "node:s", 4], active: "node:gone", collapsed: ["g", "s"], layout: { sideWidth: 99999 }, references: [null] }, project)).toMatchObject({ main: ["node:s"], active: "node:s", collapsed: ["g"], references: [], layout: { sideWidth: 760 } });
  expect(normalizeSession({ main: null }, project)).toBeNull();
  expect(normalizeSession(null, project)).toBeNull();
});

it("retains reference tabs and rejects corrupted reference payloads", () => {
  const reference = { key: "reference:library", title: "Research", card: null };
  const restored = normalizeSession({ ...session, main: [reference.key], active: reference.key, references: [reference, { key: "reference:bad", title: "Bad", card: {} }] }, project);
  expect(restored?.references).toEqual([reference]);
  expect(restored?.active).toBe(reference.key);
});

it("keeps recent projects unique, bounded and relocates matching editor state", () => {
  for (let i = 0; i < 20; i++) rememberProject({ path: `/project${i}`, title: `${i}` });
  rememberProject({ path: project.projectPath, title: project.title });
  rememberProject({ path: project.projectPath, title: "Renamed" });
  expect(recentProjects()).toHaveLength(15);
  expect(recentProjects().filter(item => item.path === project.projectPath)).toHaveLength(1);
  saveSession(project.projectPath, session);
  savePosition(project.projectPath, "s", "main", { anchor: 3, head: 4, top: 40, left: 0 });
  const moved = { ...project, projectPath: "/moved.story" };
  relocateSession(project.projectPath, moved);
  expect(readSession(moved)).toEqual(session);
  expect(readPosition(moved.projectPath, "s", "main", 6)?.anchor).toBe(3);
  expect(recentProjects()[0].path).toBe(moved.projectPath);
  expect(recentProjects().some(item => item.path === project.projectPath)).toBe(false);
});

it("reopens at the original index without duplicating an already open tab", () => {
  expect(insertTab(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
  expect(insertTab(["a", "b"], "b", 0)).toEqual(["a", "b"]);
  expect(insertTab([], "b", 8)).toEqual(["b"]);
});

it("tolerates blocked optional storage", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } });
  expect(() => saveSession(project.projectPath, session)).not.toThrow();
  expect(readSession(project)).toBeNull();
  expect(recentProjects()).toEqual([]);
});
