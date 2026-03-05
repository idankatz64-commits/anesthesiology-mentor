import { AppProvider, useApp } from '@/contexts/AppContext';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import MobileBottomNav from '@/components/MobileBottomNav';
import TopNav from '@/components/TopNav';
import WelcomeModal from '@/components/WelcomeModal';
import QuoteSplash from '@/components/QuoteSplash';
import HomeView from '@/components/views/HomeView';
import SetupView from '@/components/views/SetupView';
import SessionView from '@/components/views/SessionView';
import ReviewView from '@/components/views/ReviewView';
import ResultsView from '@/components/views/ResultsView';
import StatsView from '@/components/views/StatsView';
import NotebookView from '@/components/views/NotebookView';
import WeeklyPlanView from '@/components/views/WeeklyPlanView';
import AICoachView from '@/components/views/AICoachView';
import FlashcardView from '@/components/views/FlashcardView';
import AdminView from '@/components/views/AdminView';
import FormulaSheetView from '@/components/views/FormulaSheetView';
import StudyRoomView from '@/components/views/StudyRoomView';
import { motion, AnimatePresence } from 'framer-motion';
import { slideFromRight } from '@/lib/animations';

function AppContent() {
  const { currentView, loading } = useApp();

  const renderView = () => {
    switch (currentView) {
      case 'home': return <HomeView />;
      case 'setup-practice': return <SetupView mode="practice" />;
      case 'setup-exam': return <SetupView mode="exam" />;
      case 'session': return <SessionView />;
      case 'review': return <ReviewView />;
      case 'results': return <ResultsView />;
      case 'stats': return <StatsView />;
      case 'notebook': return <NotebookView />;
      case 'weekly-plan': return <WeeklyPlanView />;
      case 'ai-coach': return <AICoachView />;
      case 'flashcards': return <FlashcardView />;
      case 'admin': return <AdminView />;
      case 'formula-sheet': return <FormulaSheetView />;
      case 'study-room': return <StudyRoomView />;
      default: return <HomeView />;
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
              style={{ willChange: 'transform', minHeight: '60vh' }}
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

export default function Index() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
