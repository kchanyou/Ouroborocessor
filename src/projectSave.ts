import { clearSavedDraft } from "./draftRecovery";
import type { ProjectSnapshot } from "./types";

export class ProjectSceneSaveError extends Error {
  constructor(
    public readonly sceneTitle: string,
    public readonly reason: unknown,
    public readonly stage: "save" | "recovery",
  ) {
    super(`Could not prepare scene ${sceneTitle}: ${String(reason)}`);
    this.name = "ProjectSceneSaveError";
  }
}

type SaveScene = (path: string, id: string, content: string, expected: string) => Promise<void>;

export function mergeProjectStructure(current: ProjectSnapshot, next: ProjectSnapshot): ProjectSnapshot {
  if (current.projectPath !== next.projectPath) return current;
  const bodies = new Map(current.nodes.map((node) => [node.id, node.content]));
  return { ...next, nodes: next.nodes.map((node) => ({ ...node, content: bodies.get(node.id) ?? node.content })) };
}

// call inside the save queue (baselines after earlier saves)
// not a transaction: on failure earlier saves stay, recovery drafts of the rest are kept
export async function persistProjectScenes(
  project: ProjectSnapshot,
  baselines: Map<string, string>,
  save: SaveScene,
) {
  for (const scene of project.nodes) {
    if (scene.kind !== "scene") continue;
    const key = JSON.stringify([project.projectPath, scene.id]);
    try {
      const expected = baselines.get(key);
      if (expected === undefined) throw new Error("SAVE_BASELINE_MISSING");
      await save(project.projectPath, scene.id, scene.content, expected);
    } catch (reason) {
      throw new ProjectSceneSaveError(scene.title, reason, "save");
    }
    baselines.set(key, scene.content);
    try {
      clearSavedDraft(project.projectPath, scene.id, scene.content);
    } catch (reason) {
      throw new ProjectSceneSaveError(scene.title, reason, "recovery");
    }
  }
}
