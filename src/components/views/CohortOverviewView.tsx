import { useState } from "react";
import { motion } from "framer-motion";
import { Users } from "lucide-react";
import ResidentTileGrid from "@/components/cohort/ResidentTileGrid";
import ResidentDetail from "@/components/cohort/ResidentDetail";
import { COHORT_RESIDENTS } from "@/data/cohortMockData";

/**
 * Manager dashboard — individual-first.
 * Grid of resident tiles → click a resident → personal file (Overview + Training Plan).
 * DEMO MOCKUP: frontend-only, synthetic data, English UI. No backend.
 */
export default function CohortOverviewView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = COHORT_RESIDENTS.find((r) => r.id === selectedId) || null;

  return (
    <div className="fade-in w-full mx-auto flex flex-col gap-3" dir="ltr">
      {!selected && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg,#4ade80,#059669)" }}
            >
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground leading-tight">Manager Dashboard</h1>
              <p className="text-xs text-muted-foreground">Anesthesiology · Residents</p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-warning/15 text-warning border border-warning/20">
            mockup · sample data
          </span>
        </div>
      )}

      <motion.div
        key={selectedId || "grid"}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {selected ? (
          <ResidentDetail resident={selected} onBack={() => setSelectedId(null)} />
        ) : (
          <ResidentTileGrid residents={COHORT_RESIDENTS} onSelect={setSelectedId} />
        )}
      </motion.div>
    </div>
  );
}
