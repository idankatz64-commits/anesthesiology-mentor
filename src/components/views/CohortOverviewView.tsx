import { motion } from "framer-motion";
import { Users } from "lucide-react";
import CohortKpiRow from "@/components/cohort/CohortKpiRow";
import CohortTable from "@/components/cohort/CohortTable";
import CohortTopicHeatmap from "@/components/cohort/CohortTopicHeatmap";
import { COHORT_RESIDENTS, COHORT_TOPICS } from "@/data/cohortMockData";
import { computeCohortKpis } from "@/lib/cohortStats";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

/**
 * Manager dashboard — Cohort Overview (level 1 of the 3-level IA).
 * DEMO MOCKUP: frontend-only, synthetic anonymized data. No backend.
 */
export default function CohortOverviewView() {
  const kpis = computeCohortKpis(COHORT_RESIDENTS);

  return (
    <motion.div
      className="fade-in w-full mx-auto flex flex-col gap-3"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      dir="rtl"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg,#4ade80,#059669)" }}
          >
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground leading-tight">דשבורד מנהל — סקירת מחזור</h1>
            <p className="text-xs text-muted-foreground">מערך ההרדמה · תצוגת ראש־מערך</p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-warning/15 text-warning border border-warning/20">
          מוקאפ · נתונים לדוגמה
        </span>
      </motion.div>

      {/* KPI row */}
      <motion.div variants={itemVariants}>
        <CohortKpiRow kpis={kpis} />
      </motion.div>

      {/* Cohort table + cohort topic heatmap */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <CohortTable residents={COHORT_RESIDENTS} />
        </div>
        <div className="lg:col-span-1">
          <CohortTopicHeatmap topics={COHORT_TOPICS} />
        </div>
      </motion.div>
    </motion.div>
  );
}
