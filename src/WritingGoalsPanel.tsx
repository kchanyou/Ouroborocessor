import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "./i18n";
import type { ManuscriptNode, ProjectSnapshot } from "./types";
import { writingToolsText } from "./writingToolsText";
import { goalCounts, localDay, readGoals, subscribeGoals, updateGoalSettings, type Counts } from "./writingGoals";
import { NumericSetting } from "./NumericSetting";

export function WritingGoals({ project, locale }: { project: ProjectSnapshot; locale: Locale }) {
  const [, refresh] = useState(0);
  const cache = useRef(new WeakMap<ManuscriptNode, Counts>());
  useEffect(() => subscribeGoals(project.projectPath, () => refresh(value => value + 1)), [project.projectPath]);
  useEffect(() => { const timer = setInterval(() => refresh(value => value + 1), 30000); return () => clearInterval(timer); }, []);
  const goals = readGoals(project.projectPath), t = writingToolsText[locale];
  const total = useMemo(() => !goals.enabled ? { spaces: 0, compact: 0 } : project.nodes.reduce((sum, node) => {
    if (node.kind !== "scene") return sum;
    let counts = cache.current.get(node);
    if (!counts) { counts = goalCounts(node.content); cache.current.set(node, counts); }
    return { spaces: sum.spaces + counts.spaces, compact: sum.compact + counts.compact };
  }, { spaces: 0, compact: 0 }), [project.nodes, goals.enabled]);
  const metric = goals.includeSpaces ? "spaces" : "compact";
  const today = Math.max(0, goals.days[localDay()]?.[metric] ?? 0);
  const change = (values: Parameters<typeof updateGoalSettings>[1]) => updateGoalSettings(project.projectPath, values);
  return <details className="inspector-section writing-goals">
    <summary>{t.goals}</summary>
    <label className="check-row"><input type="checkbox" checked={goals.enabled} onChange={event => change({ enabled: event.target.checked })} />{t.enableGoals}</label>
    {goals.enabled && <>
      <label className="check-row"><input type="checkbox" checked={goals.includeSpaces} onChange={event => change({ includeSpaces: event.target.checked })} />{t.includeSpaces}</label>
      {([ ["daily", t.dailyGoal, today], ["project", t.projectGoal, total[metric]] ] as const).map(([key, label, count]) => <div className="goal-row" key={key}>
        <label className="goal-target"><span>{label}</span><NumericSetting label={label} min={1} max={100000000} step={1} value={goals[key]} onChange={value => change({ [key]: value })} /></label>
        <div className="goal-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={goals[key]} aria-valuenow={Math.min(count, goals[key])}>
          <span style={{ width: `${Math.min(100, (count / goals[key]) * 100)}%` }} />
        </div>
        <output>{count.toLocaleString(locale)} / {goals[key].toLocaleString(locale)}</output>
      </div>)}
      <p className="goal-hint">{t.goalHint}</p>
    </>}
  </details>;
}
