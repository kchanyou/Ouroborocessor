import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { localDay, readGoals, recordWriting, subscribeGoals, updateGoalSettings, WritingGoalRecorder } from "./writingGoals";

beforeEach(() => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps newly recorded progress when settings change from an older panel render", () => {
  const rendered = readGoals("project");
  recordWriting("project", "", "가 나", new Date(2026, 9, 7));
  updateGoalSettings("project", { daily: rendered.daily + 500, includeSpaces: false });
  expect(readGoals("project")).toMatchObject({ daily: 1500, includeSpaces: false, days: {
    "2026-10-07": { spaces: 3, compact: 2 },
  } });
});

it("notifies the current project after storage is updated and stops on unsubscribe", () => {
  const observed: number[] = [];
  const stop = subscribeGoals("project", () => observed.push(readGoals("project").daily));
  try {
    updateGoalSettings("other", { daily: 200 });
    updateGoalSettings("project", { daily: 500 });
    recordWriting("project", "", "abc");
    expect(observed).toEqual([500, 500]);
    stop();
    updateGoalSettings("project", { daily: 600 });
    expect(observed).toEqual([500, 500]);
  } finally { stop(); }
});

it("attributes delayed edits to their input days across midnight", () => {
  const recorder = new WritingGoalRecorder();
  const beforeMidnight = new Date(2026, 9, 7, 23, 59, 59);
  const afterMidnight = new Date(2026, 9, 8, 0, 0, 0);
  recorder.queue("project", "scene", "", "가", beforeMidnight);
  recorder.queue("project", "scene", "가", "가 나", afterMidnight);
  // Changing the caller's Date must not change the pending edit's attribution.
  beforeMidnight.setDate(10);
  recorder.flush();
  expect(readGoals("project").days).toEqual({
    "2026-10-07": { spaces: 1, compact: 1 },
    [localDay(afterMidnight)]: { spaces: 2, compact: 1 },
  });
  recorder.flush();
  expect(readGoals("project").days["2026-10-07"].spaces).toBe(1);
});

it("coalesces typing, replacements and undo per scene without mixing projects", () => {
  const recorder = new WritingGoalRecorder();
  const day = new Date(2026, 9, 7);
  recorder.queue("one", "a", "", "abc", day);
  recorder.queue("one", "a", "abc", "ab", day);
  recorder.queue("one", "b", "old", "", day);
  recorder.queue("two", "a", "", "가 나", day);
  recorder.flush();
  expect(readGoals("one").days[localDay(day)]).toEqual({ spaces: -1, compact: -1 });
  expect(readGoals("two").days[localDay(day)]).toEqual({ spaces: 3, compact: 2 });
  recorder.queue("one", "a", "ab", "abc", day);
  recorder.queue("one", "a", "abc", "ab", day);
  recorder.flush();
  expect(readGoals("one").days[localDay(day)]).toEqual({ spaces: -1, compact: -1 });
});
