import { getCharacterCount } from "./textMetrics";
import { readableResourceText } from "./resourceLinks";
import { readStored, writeStored } from "./workspaceSession";
export type Counts = { spaces: number; compact: number };
export type WritingGoals = { enabled: boolean; includeSpaces: boolean; daily: number; project: number; days: Record<string, Counts> };
const key = (path: string) => `ouroborocessor.goals.v1:${path}`;
export function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
export function goalCounts(content: string): Counts {
  const text = readableResourceText(content);
  return { spaces: getCharacterCount(text), compact: getCharacterCount(text.replace(/\s/gu, "")) };
}
export function readGoals(path: string): WritingGoals {
  const value = readStored(key(path));
  const v = value && typeof value === "object" ? value as Partial<WritingGoals> : {};
  const target = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(1, Math.min(100_000_000, Math.round(value))) : fallback;
  const days: Record<string, Counts> = {};
  if (v.days && typeof v.days === "object") for (const [date, counts] of Object.entries(v.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && counts && Number.isFinite(counts.spaces) && Number.isFinite(counts.compact)) days[date] = counts;
  }
  return { enabled: v.enabled === true, includeSpaces: v.includeSpaces !== false, daily: target(v.daily, 1000), project: target(v.project, 100000), days };
}
export function saveGoals(path: string, goals: WritingGoals) { writeStored(key(path), goals); }
export function recordWriting(path: string, before: string, after: string, date = new Date()) {
  if (before === after) return;
  const goals = readGoals(path), day = localDay(date), old = goalCounts(before), next = goalCounts(after);
  const counts = goals.days[day] ?? { spaces: 0, compact: 0 };
  goals.days[day] = { spaces: counts.spaces + next.spaces - old.spaces, compact: counts.compact + next.compact - old.compact };
  const dates = Object.keys(goals.days).sort();
  for (const expired of dates.slice(0, Math.max(0, dates.length - 366))) delete goals.days[expired];
  saveGoals(path, goals);
}
