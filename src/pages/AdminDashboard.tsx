import { useState } from 'react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { Link } from 'react-router-dom';
import { Loader2, FileEdit, Users, Upload, ArrowRight, ShieldAlert, FlaskConical } from 'lucide-react';
import QuestionEditorTab from '@/components/admin/QuestionEditorTab';
import UserManagementTab from '@/components/admin/UserManagementTab';
import ImportQuestionsTab from '@/components/admin/ImportQuestionsTab';
import FormulaManagementTab from '@/components/admin/FormulaManagementTab';

type AdminTab = 'question-editor' | 'user-management' | 'import-questions' | 'formula-management';

const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
  { id: 'question-editor', label: 'Question Editor', icon: <FileEdit className="w-5 h-5" /> },
  { id: 'user-management', label: 'User Management', icon: <Users className="w-5 h-5" /> },
  { id: 'import-questions', label: 'Import Questions', icon: <Upload className="w-5 h-5" /> },
  { id: 'formula-management', label: 'Formula Management', icon: <FlaskConical className="w-5 h-5" /> },
];

export default function AdminDashboard() {
  const { loading, isAdmin } = useAdminGuard();
  const [activeTab, setActiveTab] = useState<AdminTab>('question-editor');

  if (loading || !isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background bg-grid-pattern flex" dir="rtl">
      {/* Sidebar */}
      <aside className="w-64 glass-card border-l border-border flex flex-col shadow-lg">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="bg-destructive/15 text-destructive p-2.5 rounded-xl">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Admin</h1>
            <p className="text-xs text-muted-foreground">ניהול מערכת</p>
          </div>
        </div>

        <nav className="flex-grow p-4 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-all ${
                activeTab === tab.id
                  ? 'bg-primary/10 text-primary font-semibold border-r-[3px] border-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-border">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2"
          >
            <ArrowRight className="w-4 h-4" />
            חזרה לאפליקציה
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-5xl mx-auto fade-in">
          {activeTab === 'question-editor' && <QuestionEditorTab />}
          {activeTab === 'user-management' && <UserManagementTab />}
          {activeTab === 'import-questions' && <ImportQuestionsTab />}
          {activeTab === 'formula-management' && <FormulaManagementTab />}
        </div>
      </main>
    </div>
  );
}
