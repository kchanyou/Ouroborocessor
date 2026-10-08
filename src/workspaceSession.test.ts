import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { forgetProject, insertTab, normalizeSession, readPosition, readSession, recentProjects, relocateSession, rememberProject, restoreRecentProject, savePosition, saveSession } from "./workspaceSession";
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

it("keeps the newer session and positions when reconnecting an already opened destination", () => {
  const moved = { ...project, projectPath: "/moved.story" };
  const latest = { ...session, main: ["node:g"], active: "node:g", collapsed: [], recent: ["g", "s"] };
  const oldPosition = { anchor: 3, head: 4, top: 40, left: 0 };
  const latestPosition = { anchor: 1, head: 2, top: 200, left: 10 };
  saveSession(project.projectPath, session);
  savePosition(project.projectPath, "s", "main", oldPosition);
  savePosition(project.projectPath, "s", "side", oldPosition);
  saveSession(moved.projectPath, latest);
  savePosition(moved.projectPath, "s", "main", latestPosition);
  relocateSession(project.projectPath, moved);
  expect(readSession(moved)).toEqual(latest);
  expect(readPosition(moved.projectPath, "s", "main", 6)).toEqual(latestPosition);
  expect(readPosition(moved.projectPath, "s", "side", 6)).toEqual(oldPosition);
  expect(recentProjects()[0].path).toBe(moved.projectPath);
});

it("recovers a corrupt destination session and clamps positions to shortened content", () => {
  const moved = { ...project, projectPath: "/moved.story", nodes: project.nodes.map(node => ({ ...node, content: "ab" })) };
  saveSession(project.projectPath, session);
  savePosition(project.projectPath, "s", "main", { anchor: 4, head: 6, top: 40, left: 0 });
  localStorage.setItem("ouroborocessor.session.v1:/moved.story", "invalid JSON");
  relocateSession(project.projectPath, moved);
  expect(readSession(moved)).toEqual(session);
  expect(readPosition(moved.projectPath, "s", "main", 2)).toEqual({ anchor: 2, head: 2, top: 40, left: 0 });
});

it("tolerates blocked optional storage", () => {
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } });
  expect(() => saveSession(project.projectPath, session)).not.toThrow();
  expect(readSession(project)).toBeNull();
  expect(recentProjects()).toEqual([]);
});

it("removes only a recent entry and restores its original position without touching saved work", () => {
  rememberProject({ path: "/other.story", title: "Other" });
  rememberProject({ path: project.projectPath, title: project.title });
  saveSession(project.projectPath, session);
  savePosition(project.projectPath, "s", "main", { anchor: 2, head: 4, top: 120, left: 0 });
  localStorage.setItem("recovery-draft", "unsaved work");
  const previous = recentProjects();
  expect(forgetProject(project.projectPath)).toEqual([previous[1]]);
  expect(readSession(project)).toEqual(session);
  expect(readPosition(project.projectPath, "s", "main", 6)?.top).toBe(120);
  expect(localStorage.getItem("recovery-draft")).toBe("unsaved work");
  expect(restoreRecentProject(previous[0], 0)).toEqual(previous);
});

it("undoing history removal preserves newly opened projects and does not duplicate newer entries", () => {
  const removed = { path: "/old.story", title: "Old title" };
  rememberProject(removed);
  forgetProject(removed.path);
  rememberProject({ path: "/new.story", title: "New" });
  expect(restoreRecentProject(removed, 1).map(item => item.path)).toEqual(["/new.story", removed.path]);
  rememberProject({ ...removed, title: "Updated title" });
  expect(restoreRecentProject(removed, 0).filter(item => item.path === removed.path)).toEqual([{ ...removed, title: "Updated title" }]);
});

it("keeps the recent history limit when undoing removal after additional projects were opened", () => {
  for (let i = 0; i < 15; i++) rememberProject({ path: `/project${i}`, title: `${i}` });
  const restored = restoreRecentProject({ path: "/removed.story", title: "Removed" }, 5);
  expect(restored).toHaveLength(15);
  expect(restored[5].path).toBe("/removed.story");
});
