import type { ProjectSnapshot } from "./types";
import { storageKeys } from "./storageKeys";

export type RecoveryDraft = { content: string; base: string };
export type RecoveryDraftEntry = RecoveryDraft & { sceneId: string };
const keyFor = storageKeys.recoveryDraft;

export function readDraft(project: string, scene: string): RecoveryDraft | null {
  const raw = localStorage.getItem(keyFor(project, scene));
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("content" in value) || !("base" in value)
    || typeof value.content !== "string" || typeof value.base !== "string") {
    throw new Error("RECOVERY_INVALID");
  }
  return { content: value.content, base: value.base };
}

export function writeDraft(project: string, scene: string, draft: RecoveryDraft) {
  localStorage.setItem(keyFor(project, scene), JSON.stringify(draft));
}

export function clearSavedDraft(project: string, scene: string, saved: string) {
  // An older save must never remove a more recent edit's recovery copy.
  const draft = readDraft(project, scene);
  if (draft?.content === saved) localStorage.removeItem(keyFor(project, scene));
  else if (draft) writeDraft(project, scene, { ...draft, base: saved });
}

export function recoverProjectDrafts(project: ProjectSnapshot, baselines: Map<string, string>, nativeDrafts: RecoveryDraftEntry[] = []) {
  let recovered = false;
  let recoveryError = false;
  const native = new Map(nativeDrafts.map((draft) => [draft.sceneId, draft]));
  const nodes = project.nodes.map((node) => {
    if (node.kind !== "scene") return node;
    const key = JSON.stringify([project.projectPath, node.id]);
    baselines.set(key, node.content);
    let draft: RecoveryDraft | null = native.get(node.id) ?? null;
    try {
      draft = readDraft(project.projectPath, node.id) ?? draft;
    } catch { recoveryError = true; }
    if (draft && draft.content !== node.content) {
      recovered = true;
      baselines.set(key, draft.base);
      return { ...node, content: draft.content };
    }
    return node;
  });
  return { project: { ...project, nodes }, recovered, recoveryError };
}
