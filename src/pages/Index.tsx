import { AppProvider, useApp } from '@/contexts/AppContext';
import Sidebar from '@/components/Sidebar';
import MobileHeader from '@/components/MobileHeader';
import TopNav from '@/components/TopNav';
import WelcomeModal from '@/components/WelcomeModal';
import HomeView from '@/components/views/HomeView';
import SetupView from '@/components/views/SetupView';
import SessionView from '@/components/views/SessionView';
import ReviewView from '@/components/views/ReviewView';
import ResultsView from '@/components/views/ResultsView';
import StatsView from '@/components/views/StatsView';
import NotebookView from '@/components/views/NotebookView';
import WeeklyPlanView from '@/components/views/WeeklyPlanView';
import AICoachView from '@/components/views/AICoachView';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { currentView, loading } = useApp();

  return (
    <div className="h-screen flex flex-col overflow-hidden" dir="rtl">
      <TopNav />
      <div className="flex flex-1 overflow-hidden pt-14">
        <Sidebar />
        <MobileHeader />

        <main className="flex-grow overflow-y-auto p-4 md:p-10 pt-20 md:pt-10 relative bg-background transition-colors duration-300">
        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 bg-background/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground font-light tracking-wide">טוען נתונים...</p>
          </div>
        )}

        {/* Views */}
        {currentView === 'home' && <HomeView />}
        {currentView === 'setup-practice' && <SetupView mode="practice" />}
        {currentView === 'setup-exam' && <SetupView mode="exam" />}
        {currentView === 'session' && <SessionView />}
        {currentView === 'review' && <ReviewView />}
        {currentView === 'results' && <ResultsView />}
        {currentView === 'stats' && <StatsView />}
        {currentView === 'notebook' && <NotebookView />}
        {currentView === 'weekly-plan' && <WeeklyPlanView />}
        {currentView === 'ai-coach' && <AICoachView />}
      </main>

        <WelcomeModal />
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
