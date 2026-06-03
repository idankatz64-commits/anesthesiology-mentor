import { Pencil } from "lucide-react";
import type { PlanRotation } from "@/lib/cohortDetail";

const statusMeta = {
  completed: { cls: "bg-success/10 border-success/30", dot: "bg-success" },
  current: { cls: "bg-primary/10 border-primary/30", dot: "bg-primary" },
  upcoming: { cls: "bg-muted/20 border-border", dot: "bg-muted-foreground/50" },
} as const;

/** Read-only rotation timeline. Editing interactions land in the next iteration. */
export default function ResidentPlanTab({ plan }: { plan: PlanRotation[] }) {
  return (
    <div className="glass-tile rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Training Plan</h3>
          <p className="text-[11px] text-muted-foreground">Rotation schedule · editing in next iteration</p>
        </div>
        <button className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors">
          <Pencil className="w-3 h-3" /> Edit plan
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {plan.map((rot) => {
          const m = statusMeta[rot.status];
          return (
            <div key={rot.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${m.cls}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
              <span className="text-xs font-semibold text-foreground flex-1">{rot.name}</span>
              {rot.note && <span className="text-[10px] text-warning">{rot.note}</span>}
              <span className="text-[10px] text-muted-foreground">{rot.period}</span>
              <span className="text-[10px] text-muted-foreground capitalize w-20 text-right">{rot.status}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
