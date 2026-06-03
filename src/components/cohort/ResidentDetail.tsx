import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { CohortResident } from "@/data/cohortMockData";
import { getResidentDetail } from "@/lib/cohortDetail";
import { accuracyColor } from "@/lib/cohortStats";
import ResidentOverview from "./ResidentOverview";
import ResidentPlanTab from "./ResidentPlanTab";

type Tab = "overview" | "plan";

interface Props {
  resident: CohortResident;
  onBack: () => void;
}

export default function ResidentDetail({ resident, onBack }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const detail = getResidentDetail(resident);
  const r = resident;

  const stat = (value: string, label: string, color?: string) => (
    <div className="text-center">
      <div className="text-xl font-black tabular-nums" style={color ? { color } : undefined}>
        {value}
      </div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-avatar-gradient">
            {r.initials}
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">{r.initials}</h1>
            <p className="text-xs text-muted-foreground">
              {r.stageLabel} · {r.questionsPerWeek} Q/week · Active {r.lastActive}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {stat(`${r.accuracy}%`, "Accuracy", accuracyColor(r.accuracy))}
          {stat(`${r.coverage}%`, "Coverage")}
          {stat(`${r.tasksCompleted}/${r.tasksTotal}`, "Tasks")}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["overview", "plan"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "overview" ? "Overview" : "Training Plan"}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <ResidentOverview detail={detail} resident={r} />
      ) : (
        <ResidentPlanTab plan={detail.plan} residentId={r.id} />
      )}
    </div>
  );
}
