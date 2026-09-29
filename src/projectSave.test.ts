import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSavedDraft, readDraft, recoverProjectDrafts, writeDraft } from "./draftRecovery";
import { mergeProjectStructure, persistProjectScenes, ProjectSceneSaveError } from "./projectSave";
import { storageKeys } from "./storageKeys";
import type { ProjectSnapshot } from "./types";

const path = "/test/story";
const key = (id: string) => JSON.stringify([path, id]);
const project: ProjectSnapshot = {
  projectPath: path, title: "Test", canUndo: false, canRedo: false,
  nodes: ["group", "one", "two", "three"].map((id) => ({
    id, title: `Scene ${id}`, kind: id === "group" ? "group" : "scene",
    parentId: id === "group" ? null : "group", content: `한국어 English español 日本語 中文 ${id}`,
    status: "draft", synopsis: "private",
  })),
};

describe("export preparation saves all scene drafts", () => {
  let disk: Map<string, string>;
  let baselines: Map<string, string>;
  beforeEach(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    disk = new Map(); baselines = new Map();
    for (const node of project.nodes.filter((node) => node.kind === "scene")) {
      disk.set(node.id, `old ${node.id}`);
      baselines.set(key(node.id), `old ${node.id}`);
      writeDraft(path, node.id, { content: node.content, base: `old ${node.id}` });
    }
  });
  afterEach(() => vi.unstubAllGlobals());
  const guardedSave = async (_path: string, id: string, content: string, expected: string) => {
    if (disk.get(id) !== content && disk.get(id) !== expected) throw new Error("SAVE_CONFLICT");
    disk.set(id, content);
  };

  it("saves all scenes, skips folders, and exports only after successful persistence", async () => {
    const save = vi.fn(guardedSave);
    const output = vi.fn(() => [...disk.values()]);
    await persistProjectScenes(project, baselines, save).then(output);
    expect(save.mock.calls.map((call) => call[1])).toEqual(["one", "two", "three"]);
    expect(output.mock.results[0].value).toEqual(project.nodes.slice(1).map((node) => node.content));
    for (const node of project.nodes.slice(1)) {
      expect(readDraft(path, node.id)).toBeNull();
      expect(baselines.get(key(node.id))).toBe(node.content);
    }
  });

  it("recovers multiple drafts after memory reset and saves them before output", async () => {
    const reopened = { ...project, nodes: project.nodes.map((node) => ({ ...node, content: disk.get(node.id) ?? "" })) };
    const freshBaselines = new Map<string, string>();
    const recovery = recoverProjectDrafts(reopened, freshBaselines);
    expect(recovery.recovered).toBe(true);
    expect(recovery.recoveryError).toBe(false);
    await persistProjectScenes(recovery.project, freshBaselines, guardedSave);
    for (const node of project.nodes.slice(1)) expect(disk.get(node.id)).toBe(node.content);
  });

  it("retains the original baseline after reopening an externally changed scene", async () => {
    disk.set("two", "external edit during shutdown");
    const reopened = { ...project, nodes: project.nodes.map((node) => ({ ...node, content: disk.get(node.id) ?? "" })) };
    const freshBaselines = new Map<string, string>();
    const recovery = recoverProjectDrafts(reopened, freshBaselines);
    expect(recovery.project.nodes[2].content).toBe(project.nodes[2].content);
    expect(freshBaselines.get(key("two"))).toBe("old two");
    await expect(persistProjectScenes(recovery.project, freshBaselines, guardedSave)).rejects.toMatchObject({ sceneTitle: "Scene two" });
    expect(disk.get("two")).toBe("external edit during shutdown");
    expect(readDraft(path, "two")).not.toBeNull();
  });

  it("isolates a corrupt recovery record without discarding other drafts", () => {
    localStorage.setItem(storageKeys.recoveryDraft(path, "one"), "invalid JSON");
    const reopened = { ...project, nodes: project.nodes.map((node) => ({ ...node, content: disk.get(node.id) ?? "" })) };
    const recovery = recoverProjectDrafts(reopened, new Map());
    expect(recovery.recoveryError).toBe(true);
    expect(recovery.recovered).toBe(true);
    expect(recovery.project.nodes[1].content).toBe("old one");
    expect(recovery.project.nodes[2].content).toBe(project.nodes[2].content);
  });

  it("uses the project-local mirror when browser recovery is corrupt", () => {
    localStorage.setItem(storageKeys.recoveryDraft(path, "one"), "invalid JSON");
    const reopened = { ...project, nodes: project.nodes.map((node) => ({ ...node, content: disk.get(node.id) ?? "" })) };
    const recovery = recoverProjectDrafts(reopened, new Map(), [{ sceneId: "one", content: "native recovery", base: "old one" }]);
    expect(recovery.recoveryError).toBe(true);
    expect(recovery.recovered).toBe(true);
    expect(recovery.project.nodes[1].content).toBe("native recovery");
  });

  it("stops output at an external conflict and preserves failed and unvisited drafts", async () => {
    disk.set("two", "external edit");
    const output = vi.fn();
    const failure = await persistProjectScenes(project, baselines, guardedSave).then(output).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ProjectSceneSaveError);
    expect(failure).toMatchObject({ sceneTitle: "Scene two", stage: "save" });
    expect(output).not.toHaveBeenCalled();
    expect(disk.get("one")).toBe(project.nodes[1].content);
    expect(disk.get("two")).toBe("external edit");
    expect(disk.get("three")).toBe("old three");
    expect(readDraft(path, "one")).toBeNull();
    expect(readDraft(path, "two")?.content).toBe(project.nodes[2].content);
    expect(readDraft(path, "three")?.content).toBe(project.nodes[3].content);
  });

  it("uses baselines updated by preceding queued saves", async () => {
    const previousSave = Promise.resolve().then(async () => {
      await guardedSave(path, "one", "earlier edit", "old one");
      baselines.set(key("one"), "earlier edit");
      clearSavedDraft(path, "one", "earlier edit");
    });
    await previousSave.then(() => persistProjectScenes(project, baselines, guardedSave));
    expect(disk.get("one")).toBe(project.nodes[1].content);
    expect(readDraft(path, "one")).toBeNull();
  });

  it("keeps a newer recovery draft when an older save completes", async () => {
    const save = async (...args: Parameters<typeof guardedSave>) => {
      await guardedSave(...args);
      if (args[1] === "one") writeDraft(path, "one", { content: "newer input", base: "old one" });
    };
    await persistProjectScenes(project, baselines, save);
    expect(readDraft(path, "one")).toEqual({ content: "newer input", base: project.nodes[1].content });
  });

  it("reports recovery cleanup failure and can retry without a false disk conflict", async () => {
    const remove = vi.spyOn(localStorage, "removeItem").mockImplementationOnce(() => { throw new Error("storage unavailable"); });
    await expect(persistProjectScenes(project, baselines, guardedSave)).rejects.toMatchObject({ sceneTitle: "Scene one", stage: "recovery" });
    expect(baselines.get(key("one"))).toBe(project.nodes[1].content);
    expect(readDraft(path, "one")).not.toBeNull();
    expect(disk.get("two")).toBe("old two");
    remove.mockRestore();
    await persistProjectScenes(project, baselines, guardedSave);
    expect(readDraft(path, "one")).toBeNull();
  });

  it("fails closed if a scene has no known disk baseline", async () => {
    baselines.delete(key("one"));
    const save = vi.fn(guardedSave);
    await expect(persistProjectScenes(project, baselines, save)).rejects.toMatchObject({ sceneTitle: "Scene one", stage: "save" });
    expect(save).not.toHaveBeenCalled();
    expect(readDraft(path, "one")).not.toBeNull();
  });

  it("retains recovered bodies through tree changes before export", async () => {
    const response = { ...project, nodes: [...project.nodes].reverse().map((node) => ({ ...node, title: `Moved ${node.id}`, content: disk.get(node.id) ?? "" })) };
    const merged = mergeProjectStructure(project, response);
    expect(merged.nodes.map((node) => node.id)).toEqual(["three", "two", "one", "group"]);
    expect(merged.nodes[0].title).toBe("Moved three");
    await persistProjectScenes(merged, baselines, guardedSave);
    expect(disk.get("two")).toBe(project.nodes[2].content);
    expect(mergeProjectStructure(project, { ...response, projectPath: "/another" })).toBe(project);
  });

  it("keeps newly added scene bodies while preserving empty existing drafts", () => {
    const current = { ...project, nodes: project.nodes.map((node) => ({ ...node, content: "" })) };
    const added = { ...project.nodes[1], id: "new", content: "new scene" };
    const merged = mergeProjectStructure(current, { ...project, nodes: [...project.nodes, added] });
    expect(merged.nodes[1].content).toBe("");
    expect(merged.nodes.at(-1)?.content).toBe("new scene");
  });
});
