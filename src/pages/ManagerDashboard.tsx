import { useAdminGuard } from "@/hooks/useAdminGuard";
import { Link } from "react-router-dom";
import { Loader2, ArrowLeft, Users } from "lucide-react";
import { motion } from "framer-motion";
import { fadeUp } from "@/lib/animations";
import CohortOverviewView from "@/components/views/CohortOverviewView";

/**
 * Manager Portal — a dedicated, role-gated area, SEPARATE from the resident app.
 * Reached from the admin-only sidebar footer (not the resident nav).
 * Renders the manager dashboard content (cohort → resident personal file).
 * DEMO MOCKUP: frontend-only synthetic data. No backend.
 */
export default function ManagerDashboard() {
  const { loading, isAdmin } = useAdminGuard();
  // DX-04: scoped design-direction switch (?theme=glass | graphite | default midnight)
  const themeParam = new URLSearchParams(window.location.search).get("theme");
  const themeClass =
    themeParam === "graphite" ? "theme-graphite" : themeParam === "glass" ? "theme-glass" : "theme-midnight";

  if (loading || !isAdmin) {
    return (
      <div className={`${themeClass} min-h-screen bg-background flex items-center justify-center`}>
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      className={`${themeClass} min-h-screen bg-background bg-grid-pattern`}
      dir="ltr"
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      exit={fadeUp.exit}
      transition={fadeUp.transition}
    >
      {/* Top bar */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-mark">
            <Users className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-foreground">YouShellNotPass · Manager Portal</span>
        </div>
        <Link
          to="/"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to app
        </Link>
      </header>

      <main className="p-4 md:p-8 max-w-7xl mx-auto">
        <CohortOverviewView />
      </main>
    </motion.div>
  );
}
