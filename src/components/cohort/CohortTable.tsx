import type { CohortResident } from "@/data/cohortMockData";
import { accuracyColor } from "@/lib/cohortStats";

/** SVG trend arrow — same directional-arrow pattern used by TopicPerformanceTable. */
function TrendArrow({ points }: { points: number[] }) {
  if (points.length < 2) return <span className="text-muted-foreground text-xs">—</span>;
  const delta = points[points.length - 1] - points[0];
  const color = delta > 3 ? "#00e676" : delta < -3 ? "#ff1744" : "#888";
  const rotation = delta > 3 ? -45 : delta < -3 ? 45 : 0;
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" style={{ transform: `rotate(${rotation}deg)` }}>
      <path
        d="M3 8h10M9 4l4 4-4 4"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const signalMeta: Record<CohortResident["signal"], { label: string; cls: string }> = {
  active: { label: "On track", cls: "bg-success/15 text-success" },
  steady: { label: "Steady", cls: "bg-muted/40 text-muted-foreground" },
  attention: { label: "Needs attention", cls: "bg-warning/15 text-warning" },
};

interface Props {
  residents: CohortResident[];
  onResidentClick?: (id: string) => void;
}

export default function CohortTable({ residents, onResidentClick }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" dir="ltr">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground">Cohort Residents</h3>
        <span className="text-[11px] text-muted-foreground">{residents.length} residents</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground border-b border-border/60">
              <th className="text-left font-medium px-4 py-2">Resident</th>
              <th className="text-center font-medium px-2 py-2">Stage</th>
              <th className="text-center font-medium px-2 py-2">Coverage</th>
              <th className="text-center font-medium px-2 py-2">Accuracy</th>
              <th className="text-center font-medium px-2 py-2">Trend</th>
              <th className="text-center font-medium px-2 py-2">Q/week</th>
              <th className="text-center font-medium px-2 py-2">Active</th>
              <th className="text-center font-medium px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {residents.map((r) => (
              <tr
                key={r.id}
                onClick={onResidentClick ? () => onResidentClick(r.id) : undefined}
                className={`border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors ${
                  onResidentClick ? "cursor-pointer" : ""
                }`}
              >
                <td className="px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">{r.initials}</td>
                <td className="px-2 py-2.5 text-center text-muted-foreground whitespace-nowrap">{r.stageLabel}</td>
                <td className="px-2 py-2.5 text-center tabular-nums">{r.coverage}%</td>
                <td
                  className="px-2 py-2.5 text-center font-bold tabular-nums"
                  style={{ color: accuracyColor(r.accuracy) }}
                >
                  {r.accuracy}%
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex justify-center">
                    <TrendArrow points={r.trend} />
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center tabular-nums text-muted-foreground">{r.questionsPerWeek}</td>
                <td className="px-2 py-2.5 text-center text-[11px] text-muted-foreground whitespace-nowrap">
                  {r.lastActive}
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${signalMeta[r.signal].cls}`}
                  >
                    {signalMeta[r.signal].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
