import type { CohortTopic } from "@/data/cohortMockData";
import { accuracyColor, accuracyBg } from "@/lib/cohortStats";

/**
 * Cohort-level topic strength — the manager's "secret weapon".
 * Weakest topics first → candidates for a department-wide teaching session.
 */
export default function CohortTopicHeatmap({ topics }: { topics: CohortTopic[] }) {
  const sorted = [...topics].sort((a, b) => a.avgAccuracy - b.avgAccuracy);

  return (
    <div className="glass-tile rounded-xl p-4 h-full" dir="ltr">
      <h3 className="text-sm font-bold text-foreground">Cohort Strength by Topic</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        Where the whole cohort is weakest → candidates for a department teaching session
      </p>
      <div className="grid grid-cols-1 gap-1.5">
        {sorted.map((t) => (
          <div
            key={t.topic}
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: accuracyBg(t.avgAccuracy) }}
          >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: accuracyColor(t.avgAccuracy) }} />
            <span className="text-xs text-foreground/90 flex-1 truncate">{t.topic}</span>
            <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: accuracyColor(t.avgAccuracy) }}>
              {t.avgAccuracy}%
            </span>
            <div className="w-16 h-1.5 rounded-full bg-muted/20 overflow-hidden shrink-0">
              <div
                className="h-full rounded-full"
                style={{ backgroundColor: accuracyColor(t.avgAccuracy), width: `${t.avgAccuracy}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
