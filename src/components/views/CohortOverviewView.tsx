import { useState } from "react";
import { motion } from "framer-motion";
import { Users, LayoutGrid, Table2, ChevronDown, FileText } from "lucide-react";
import ResidentTileGrid from "@/components/cohort/ResidentTileGrid";
import ResidentDetail from "@/components/cohort/ResidentDetail";
import CohortKpiRow from "@/components/cohort/CohortKpiRow";
import CohortTable from "@/components/cohort/CohortTable";
import CohortTopicHeatmap from "@/components/cohort/CohortTopicHeatmap";
import CohortReport from "@/components/cohort/CohortReport";
import { computeCohortKpis } from "@/lib/cohortStats";
import { COHORT_RESIDENTS, COHORT_TOPICS } from "@/data/cohortMockData";

type ViewMode = "residents" | "cohort";

/**
 * Manager dashboard — individual-first, with a secondary aggregate view.
 *  • "Residents" = grid of resident tiles → personal file (the default star).
 *  • "Cohort"    = aggregate KPIs + comparison table + cohort topic weak-spots.
 * Either way, clicking a resident opens the same personal file.
 * DEMO MOCKUP: frontend-only, synthetic data, English UI. No backend.
 */
export default function CohortOverviewView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("residents");
  const [showWeakSpots, setShowWeakSpots] = useState(false);
  const [showCohortReport, setShowCohortReport] = useState(false);
  const selected = COHORT_RESIDENTS.find((r) => r.id === selectedId) || null;
  const kpis = computeCohortKpis(COHORT_RESIDENTS);

  const tabClass = (active: boolean) =>
    `flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors ${
      active ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
    }`;

  if (showCohortReport && !selected) {
    return (
      <div className="fade-in w-full mx-auto">
        <CohortReport residents={COHORT_RESIDENTS} topics={COHORT_TOPICS} onBack={() => setShowCohortReport(false)} />
      </div>
    );
  }

  return (
    <div className="fade-in w-full mx-auto flex flex-col gap-3" dir="ltr">
      {!selected && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-brand-mark">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">Manager Dashboard</h1>
              <p className="text-xs text-muted-foreground">Anesthesiology · Residents</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-muted/20 p-0.5">
              <button onClick={() => setViewMode("residents")} className={tabClass(viewMode === "residents")}>
                <LayoutGrid className="w-3.5 h-3.5" /> Residents
              </button>
              <button onClick={() => setViewMode("cohort")} className={tabClass(viewMode === "cohort")}>
                <Table2 className="w-3.5 h-3.5" /> Cohort
              </button>
            </div>
            <button
              onClick={() => setShowCohortReport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <FileText className="w-3.5 h-3.5" /> Cohort Report
            </button>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-warning/15 text-warning border border-warning/20">
              mockup · sample data
            </span>
          </div>
        </div>
      )}

      <motion.div
        key={selected ? selectedId : viewMode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {selected ? (
          <ResidentDetail resident={selected} onBack={() => setSelectedId(null)} />
        ) : viewMode === "cohort" ? (
          <div className="flex flex-col gap-3">
            <CohortKpiRow kpis={kpis} />
            <CohortTable residents={COHORT_RESIDENTS} onResidentClick={setSelectedId} />
            {/* Cohort-level topic strength — de-emphasized, collapsed by default */}
            <div>
              <button
                onClick={() => setShowWeakSpots((s) => !s)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showWeakSpots ? "rotate-180" : ""}`} />
                Cohort weak spots (optional)
              </button>
              {showWeakSpots && (
                <div className="mt-2">
                  <CohortTopicHeatmap topics={COHORT_TOPICS} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <ResidentTileGrid residents={COHORT_RESIDENTS} onSelect={setSelectedId} />
        )}
      </motion.div>
    </div>
  );
}
