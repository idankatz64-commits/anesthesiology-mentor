import { Users, Target, BookOpen, Activity, Eye } from "lucide-react";
import AnimatedNumber from "@/components/AnimatedNumber";
import type { CohortKpis } from "@/lib/cohortStats";

/** Cohort-level KPI tiles — mirrors the StatsView "row 1" glass-tile pattern. */
export default function CohortKpiRow({ kpis }: { kpis: CohortKpis }) {
  const cards = [
    { label: "Residents", value: kpis.activeResidents, suffix: "", color: "text-primary", icon: Users },
    { label: "Avg Coverage", value: kpis.avgCoverage, suffix: "%", color: "text-foreground", icon: BookOpen },
    { label: "Cohort Accuracy", value: kpis.avgAccuracy, suffix: "%", color: "text-success", icon: Target },
    { label: "Avg Q/week", value: kpis.avgQuestionsPerWeek, suffix: "", color: "text-foreground", icon: Activity },
    { label: "Watch", value: kpis.attentionCount, suffix: "", color: "text-warning", icon: Eye },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" dir="ltr">
      {cards.map((c) => (
        <div key={c.label} className="glass-tile rounded-xl p-3 text-center">
          <div className="flex items-center justify-center mb-1">
            <c.icon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <AnimatedNumber value={c.value} suffix={c.suffix} className={`text-3xl font-black ${c.color}`} />
          <div className="text-[10px] font-medium mt-1 text-muted-foreground">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
