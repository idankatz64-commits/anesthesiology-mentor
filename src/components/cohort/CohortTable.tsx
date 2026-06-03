import type { CohortResident } from "@/data/cohortMockData";
import { accuracyColor } from "@/lib/cohortStats";
import Sparkline from "./Sparkline";

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
                    <Sparkline points={r.trend} />
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
