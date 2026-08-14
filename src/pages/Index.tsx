import { AppProvider, useApp } from "@/contexts/AppContext";
import Sidebar from "@/components/Sidebar";
import MobileHeader from "@/components/MobileHeader";
import MobileBottomNav from "@/components/MobileBottomNav";
import TopNav from "@/components/TopNav";
import WelcomeModal from "@/components/WelcomeModal";
import QuoteSplash from "@/components/QuoteSplash";
import HomeView from "@/components/views/HomeView";
import SetupView from "@/components/views/SetupView";
import SessionView from "@/components/views/SessionView";
import ReviewView from "@/components/views/ReviewView";
import ResultsView from "@/components/views/ResultsView";
import StatsView from "@/components/views/StatsView";
import NotebookView from "@/components/views/NotebookView";
import FlashcardView from "@/components/views/FlashcardView";
import FormulaSheetView from "@/components/views/FormulaSheetView";
import SummariesView from "@/components/views/SummariesView";
import MillerGuideView from "@/components/views/MillerGuideView";
import { SrsDashboardView } from "@/components/views/SrsDashboardView";
import AcademyView from "@/components/views/AcademyView";
import { motion, AnimatePresence } from "framer-motion";
import { slideFromRight } from "@/lib/animations";
import { Navigate } from "react-router-dom";
import { resolveGate } from "@/lib/accessGate";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

function FullScreenLoader() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background" dir="rtl">
      <motion.div
        className="w-16 h-16 rounded-2xl bg-primary/20"
        animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      />
      <p className="text-muted-foreground font-light tracking-wide mt-4">טוען...</p>
    </div>
  );
}

/** Logged in, but not on the approved list. Shows a notice instead of an empty app. */
function PendingApproval() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-background p-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-md text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Clock className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground mb-3">החשבון ממתין לאישור</h1>
        <p className="text-muted-foreground leading-relaxed mb-8">
          נרשמת בהצלחה, אבל הגישה לאפליקציה ניתנת באישור אישי.
          <br />
          פנה לעידן כדי לקבל גישה.
        </p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>
          התנתקות
        </Button>
      </motion.div>
    </div>
  );
}

function AppContent() {
  const { currentView, loading, academyOnly, membershipResolved, userId, authResolved, approved } = useApp();

  // Access gate (lockdown 2026-08-14). Runs before ANY app chrome renders —
  // nav, sidebar and views are all downstream of this. The database enforces
  // the same rule via is_approved(), so this is the display half, not the lock.
  const gate = resolveGate({ authResolved, userId, approved });
  if (gate === "loading") return <FullScreenLoader />;
  if (gate === "signin") return <Navigate to="/auth" replace />;
  if (gate === "pending") return <PendingApproval />;

  const renderView = () => {
    // membershipResolved is only ever false while a logged-in user's academy
    // status is still loading — so this alone gates the "flash of full app"
    // race without needing a separate "is a user logged in" check.
    if (!membershipResolved) {
      return (
        <div className="flex flex-col items-center justify-center py-24">
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
      );
    }
    if (academyOnly && !["academy", "setup-practice", "session", "results", "review", "stats"].includes(currentView)) {
      return <AcademyView />;
    }
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
      case "academy":
        return <AcademyView />;
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
              {renderView()}
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
