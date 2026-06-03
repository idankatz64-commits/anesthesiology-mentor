import { CheckCircle2, Clock, AlertCircle, Sparkles } from "lucide-react";
import type { ResidentDetailData } from "@/lib/cohortDetail";
import ResidentTrendChart from "./ResidentTrendChart";
import ResidentTopicTreemap from "./ResidentTopicTreemap";
import ResidentNotesCard from "./ResidentNotesCard";

const taskIcon = { done: CheckCircle2, pending: Clock, overdue: AlertCircle } as const;
const taskColor = { done: "text-success", pending: "text-muted-foreground", overdue: "text-warning" } as const;

interface Props {
  detail: ResidentDetailData;
  residentId: string;
}

export default function ResidentOverview({ detail, residentId }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* AI verbal summary */}
      <div className="glass-tile rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">AI Summary</h3>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning">sample</span>
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed">{detail.aiSummary}</p>
      </div>

      {/* Accuracy trend — the headline signal (improvement over time) */}
      <ResidentTrendChart quizzes={detail.quizzes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Task adherence */}
        <div className="glass-tile rounded-xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-3">Task Adherence</h3>
          <div className="flex flex-col gap-1.5">
            {detail.tasks.map((t) => {
              const Icon = taskIcon[t.status];
              return (
                <div key={t.id} className="flex items-center gap-2.5 text-xs">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${taskColor[t.status]}`} />
                  <span
                    className={`flex-1 ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                  >
                    {t.title}
                  </span>
                  <span className={`text-[10px] ${t.status === "overdue" ? "text-warning" : "text-muted-foreground"}`}>
                    {t.due}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Topic performance — treemap + Miller chapter drill-down */}
        <ResidentTopicTreemap topics={detail.topics} />
      </div>

      {/* Manager notes */}
      <ResidentNotesCard residentId={residentId} />
    </div>
  );
}
