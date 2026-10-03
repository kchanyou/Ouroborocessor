import type { ProjectSnapshot, ResourceCard } from "./types";
import { normalizeLayout, type WorkspaceLayout } from "./workspaceLayout";

export type ReferenceSession = { key: string; title: string; card: ResourceCard | null };
export type ClosedTab = { key: string; pane: "main" | "side"; index: number; reference?: ReferenceSession };
export type WorkspaceSession = {
  main: string[]; side: string[]; active: string | null; sideActive: string | null;
  collapsed: string[]; recent: string[]; references: ReferenceSession[];
  layout: WorkspaceLayout;
};
export type EditorPosition = { anchor: number; head: number; top: number; left: number };
export type RecentProject = { path: string; title: string };
const prefix = "ouroborocessor.session.v1:";
const recentKey = "ouroborocessor.recent-projects.v1";
const positionKey = (project: string, scene: string, pane: string) => `${prefix}position:${JSON.stringify([project, scene, pane])}`;
export function readStored(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); } catch { return null; }
}
export function writeStored(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* optional workspace state */ }
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string"))] : [];
}
export function normalizeSession(value: unknown, project: ProjectSnapshot): WorkspaceSession | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<WorkspaceSession>;
  if (!Array.isArray(v.main) || !Array.isArray(v.side)) return null;
  const ids = new Set(project.nodes.map(node => node.id));
  const references: ReferenceSession[] = Array.isArray(v.references) ? v.references.filter(ref => {
    if (!ref || typeof ref.key !== "string" || typeof ref.title !== "string") return false;
    if (ref.key === "reference:library") return ref.card === null;
    const c = ref.card;
    return c && typeof c.id === "string" && ref.key === `reference:${c.id}` && !c.deleted
      && ["character", "place", "setting"].includes(c.kind) && typeof c.name === "string"
      && typeof c.description === "string" && Array.isArray(c.aliases) && c.aliases.every(x => typeof x === "string")
      && Array.isArray(c.tags) && c.tags.every(x => typeof x === "string");
  }) : [];
  const valid = (key: string) => key.startsWith("node:") ? ids.has(key.slice(5)) : references.some(ref => ref.key === key);
  const main = strings(v.main).filter(valid), side = strings(v.side).filter(valid);
  return {
    main, side, active: typeof v.active === "string" && main.includes(v.active) ? v.active : main.at(-1) ?? null,
    sideActive: typeof v.sideActive === "string" && side.includes(v.sideActive) ? v.sideActive : side.at(-1) ?? null,
    references: references.filter(ref => main.includes(ref.key) || side.includes(ref.key)),
    collapsed: strings(v.collapsed).filter(id => project.nodes.some(node => node.id === id && node.kind === "group")),
    recent: strings(v.recent).filter(id => ids.has(id)).slice(0, 100), layout: normalizeLayout(v.layout),
  };
}
export function readSession(project: ProjectSnapshot) { return normalizeSession(readStored(prefix + project.projectPath), project); }
export function saveSession(project: string, session: WorkspaceSession) { writeStored(prefix + project, session); }
export function readPosition(project: string, scene: string, pane: string, length: number): EditorPosition | null {
  const v = readStored(positionKey(project, scene, pane)) as Partial<EditorPosition> | null;
  if (!v || typeof v !== "object") return null;
  const safe = (value: unknown, max = Number.MAX_SAFE_INTEGER) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : 0;
  return { anchor: Math.floor(safe(v.anchor, length)), head: Math.floor(safe(v.head, length)), top: safe(v.top), left: safe(v.left) };
}
export function savePosition(project: string, scene: string, pane: string, position: EditorPosition) {
  writeStored(positionKey(project, scene, pane), position);
}
export function recentProjects(): RecentProject[] {
  const value = readStored(recentKey);
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is RecentProject => {
    if (!item || typeof item.path !== "string" || !item.path || typeof item.title !== "string" || seen.has(item.path)) return false;
    seen.add(item.path); return true;
  }).slice(0, 15);
}
export function rememberProject(project: RecentProject, replacedPath?: string) {
  writeStored(recentKey, [project, ...recentProjects().filter(item => item.path !== project.path && item.path !== replacedPath)].slice(0, 15));
}
export function relocateSession(oldPath: string, next: ProjectSnapshot) {
  const session = normalizeSession(readStored(prefix + oldPath), next);
  if (session) saveSession(next.projectPath, session);
  for (const node of next.nodes) for (const pane of ["main", "side"]) {
    const position = readPosition(oldPath, node.id, pane, node.content.length);
    if (position) savePosition(next.projectPath, node.id, pane, position);
  }
  rememberProject({ path: next.projectPath, title: next.title }, oldPath);
}
export function insertTab(keys: string[], key: string, index: number) {
  if (keys.includes(key)) return keys;
  const next = [...keys]; next.splice(Math.max(0, Math.min(next.length, index)), 0, key); return next;
}
