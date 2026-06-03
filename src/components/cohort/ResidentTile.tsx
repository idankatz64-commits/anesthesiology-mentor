import type { CohortResident } from "@/data/cohortMockData";
import { accuracyColor } from "@/lib/cohortStats";

const signalMeta = {
  active: { label: "On track", cls: "bg-success/15 text-success" },
  steady: { label: "Steady", cls: "bg-muted/40 text-muted-foreground" },
  attention: { label: "Needs attention", cls: "bg-warning/15 text-warning" },
} as const;

export default function ResidentTile({ resident, onClick }: { resident: CohortResident; onClick: () => void }) {
  const r = resident;
  return (
    <button
      onClick={onClick}
      className="glass-tile rounded-xl p-4 text-left w-full hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0 bg-avatar-gradient">
            {r.initials}
          </div>
          <div>
            <div className="text-sm font-bold text-foreground leading-tight">{r.initials}</div>
            <div className="text-[11px] text-muted-foreground">{r.stageLabel}</div>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${signalMeta[r.signal].cls}`}>
          {signalMeta[r.signal].label}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-black tabular-nums" style={{ color: accuracyColor(r.accuracy) }}>
            {r.accuracy}%
          </div>
          <div className="text-[9px] text-muted-foreground">Accuracy</div>
        </div>
        <div>
          <div className="text-lg font-black tabular-nums text-foreground">{r.coverage}%</div>
          <div className="text-[9px] text-muted-foreground">Coverage</div>
        </div>
        <div>
          <div className="text-lg font-black tabular-nums text-foreground">
            {r.tasksCompleted}/{r.tasksTotal}
          </div>
          <div className="text-[9px] text-muted-foreground">Tasks</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{r.questionsPerWeek} Q/week</span>
        <span>Active: {r.lastActive}</span>
      </div>
    </button>
  );
}
