import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { ManuscriptNode, NodeKind, ProjectSnapshot, ResourceCard } from "./types";
import type { BatchChange, BatchResult } from "./projectReplace";
import type { RecoveryDraftEntry } from "./draftRecovery";

export function applyBatchEdit(projectPath: string, changes: BatchChange[]) {
  return invoke<BatchResult>("apply_batch_edit", { projectPath, changes });
}

export const listResourceCards = (projectPath: string) => invoke<ResourceCard[]>("list_resource_cards", { projectPath });
export const saveResourceCard = (projectPath: string, card: ResourceCard, expected: ResourceCard | null) =>
  invoke<ResourceCard[]>("save_resource_card", { projectPath, card, expected });

export const listBatchJournals = (projectPath: string) => invoke<string[]>("list_batch_journals", { projectPath });
export const readBatchJournal = (projectPath: string, journalId: string) => invoke<BatchChange[]>("read_batch_journal", { projectPath, journalId });
export const restoreBatchCopy = (projectPath: string, journalId: string, sceneId: string, title: string) =>
  invoke<ProjectSnapshot>("restore_batch_copy", { projectPath, journalId, sceneId, title });
export const listRecoveryDrafts = (projectPath: string) => invoke<RecoveryDraftEntry[]>("list_recovery_drafts", { projectPath });
export const writeRecoveryDraft = (projectPath: string, sceneId: string, content: string, base: string) => invoke<void>("write_recovery_draft", { projectPath, sceneId, content, base });
export const clearRecoveryDraft = (projectPath: string, sceneId: string, saved: string) => invoke<void>("clear_recovery_draft", { projectPath, sceneId, saved });
export const saveImage = (projectPath: string, bytes: number[]) =>
  invoke<string>("save_image", { projectPath, bytes });
export const importImage = (projectPath: string, sourcePath: string) =>
  invoke<string>("import_image", { projectPath, sourcePath });

export async function chooseFolder(title: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  return typeof selected === "string" ? selected : null;
}

export function createProject(
  parentPath: string,
  title: string,
  firstGroupTitle: string,
  firstSceneTitle: string,
) {
  return invoke<ProjectSnapshot>("create_project", {
    parentPath,
    title,
    firstGroupTitle,
    firstSceneTitle,
  });
}

export function openProject(projectPath: string) {
  return invoke<ProjectSnapshot>("open_project", { projectPath });
}

export function undoProjectEdit(projectPath: string, redo = false) {
  return invoke<ProjectSnapshot>("undo_project_edit", { projectPath, redo });
}

export function exportProject(projectPath: string, destination: string) {
  return invoke<string>("export_project", { projectPath, destination });
}

export function exportDocx(
  projectPath: string,
  destination: string,
  rootId: string | null,
  paperSize: "a4" | "letter",
  marginPreset: "narrow" | "normal" | "wide",
) {
  return invoke<string>("export_docx", { projectPath, destination, rootId, paperSize, marginPreset });
}

let initialProject: Promise<ProjectSnapshot> | undefined;
export type SceneVersion = { id: string; sceneId: string; createdAt: number; content: string };
export type SceneVersionReport = { versions: SceneVersion[]; corruptCount: number };
export function listSceneVersions(projectPath: string, sceneId: string) {
  return invoke<SceneVersionReport>("list_scene_versions", { projectPath, sceneId });
}
export function restoreSceneVersion(projectPath: string, sceneId: string, versionId: string, title: string) {
  return invoke<ProjectSnapshot>("restore_scene_version", { projectPath, sceneId, versionId, title });
}
export function bootstrapProject(title: string, groupTitle: string, sceneTitle: string) {
  return initialProject ??= invoke<ProjectSnapshot>("bootstrap_project", { title, groupTitle, sceneTitle });
}

export function addNode(
  projectPath: string,
  parentId: string | null,
  kind: NodeKind,
  title: string,
) {
  return invoke<ProjectSnapshot>("add_node", { projectPath, parentId, kind, title });
}

export function saveScene(projectPath: string, sceneId: string, content: string, expectedContent: string) {
  return invoke<void>("save_scene_checked", { projectPath, sceneId, content, expectedContent });
}

export function preserveConflictCopy(projectPath: string, sceneId: string, content: string, title: string) {
  return invoke<ProjectSnapshot>("preserve_conflict_copy", { projectPath, sceneId, content, title });
}

export function updateNode(
  projectPath: string,
  nodeId: string,
  title: string,
  status: string,
  synopsis: string,
  expected: Pick<ManuscriptNode, "title" | "status" | "synopsis">,
) {
  return invoke<ProjectSnapshot>("update_node", {
    projectPath,
    nodeId,
    title,
    status,
    synopsis,
    expectedTitle: expected.title,
    expectedStatus: expected.status,
    expectedSynopsis: expected.synopsis,
  });
}

export function moveNode(projectPath: string, nodeId: string, direction: -1 | 1) {
  return invoke<ProjectSnapshot>("move_node", { projectPath, nodeId, direction });
}

export function indentNode(projectPath: string, nodeId: string) {
  return invoke<ProjectSnapshot>("indent_node", { projectPath, nodeId });
}

export function outdentNode(projectPath: string, nodeId: string) {
  return invoke<ProjectSnapshot>("outdent_node", { projectPath, nodeId });
}

export function reparentNode(
  projectPath: string,
  nodeId: string,
  parentId: string | null,
  beforeId: string | null,
) {
  return invoke<ProjectSnapshot>("reparent_node", {
    projectPath,
    nodeId,
    parentId,
    beforeId,
  });
}
