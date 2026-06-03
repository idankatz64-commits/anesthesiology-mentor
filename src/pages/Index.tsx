import { lazy, Suspense } from "react";
import { AppProvider, useApp } from "@/contexts/AppContext";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import TopNav from "@/components/TopNav";
import WelcomeModal from "@/components/WelcomeModal";
import QuoteSplash from "@/components/QuoteSplash";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { slideFromRight } from "@/lib/animations";

// Code-split each view into its own chunk — loaded on demand.
const HomeView = lazy(() => import("@/components/views/HomeView"));
const SetupView = lazy(() => import("@/components/views/SetupView"));
const SessionView = lazy(() => import("@/components/views/SessionView"));
const ReviewView = lazy(() => import("@/components/views/ReviewView"));
const ResultsView = lazy(() => import("@/components/views/ResultsView"));
const StatsView = lazy(() => import("@/components/views/StatsView"));
const NotebookView = lazy(() => import("@/components/views/NotebookView"));
const FlashcardView = lazy(() => import("@/components/views/FlashcardView"));
const FormulaSheetView = lazy(() => import("@/components/views/FormulaSheetView"));
const SummariesView = lazy(() => import("@/components/views/SummariesView"));
const MillerGuideView = lazy(() => import("@/components/views/MillerGuideView"));
const SrsDashboardView = lazy(() =>
  import("@/components/views/SrsDashboardView").then((m) => ({
    default: m.SrsDashboardView,
  })),
);
const CohortOverviewView = lazy(() => import("@/components/views/CohortOverviewView"));

function AppContent() {
  const { currentView, loading } = useApp();

  const renderView = () => {
    switch (currentView) {
      case "home":
        return <HomeView />;
      case "setup-practice":
        return <SetupView mode="practice" />;
      case "setup-exam":
        return <SetupView mode="exam" />;
      case "session":
        return <SessionView />;
      case "review":
        return <ReviewView />;
      case "results":
        return <ResultsView />;
      case "stats":
        return <StatsView />;
      case "notebook":
        return <NotebookView />;
      case "flashcards":
        return <FlashcardView />;
      case "formula-sheet":
        return <FormulaSheetView />;
      case "summaries":
        return <SummariesView />;
      case "miller-guide":
        return <MillerGuideView />;
      case "srs-dashboard":
        return <SrsDashboardView />;
      case "cohort-overview":
        return <CohortOverviewView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" dir="rtl">
      <TopNav />
      <div className="flex flex-1 overflow-hidden pt-14">
        <Sidebar />
        <MobileHeader />

        <main className="flex-grow overflow-y-auto p-4 md:p-10 pt-20 md:pt-10 pb-24 md:pb-10 relative bg-background bg-grid-pattern transition-colors duration-300">
          {loading && (
            <div className="absolute inset-0 bg-background/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
              <motion.div
                className="w-16 h-16 rounded-2xl bg-primary/20"
                animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.p
                className="text-muted-foreground font-light tracking-wide mt-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                טוען נתונים...
              </motion.p>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={slideFromRight.initial}
              animate={slideFromRight.animate}
              exit={slideFromRight.exit}
              transition={slideFromRight.transition}
              className="w-full px-4"
              style={{ willChange: "transform", minHeight: "60vh" }}
            >
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                }
              >
                {renderView()}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <MobileBottomNav />
        <WelcomeModal />
        <QuoteSplash />
      </div>
    </div>
  );
}

// Main entry point
export default function Index() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
