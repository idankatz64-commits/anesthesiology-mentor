import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Heart, Moon, Sun, Menu, X } from 'lucide-react';
import { type ViewId } from '@/lib/types';

const mobileNav: { id: ViewId; label: string; emoji: string }[] = [
  { id: 'home', label: 'ראשי', emoji: '🏠' },
  { id: 'setup-practice', label: 'תרגול', emoji: '📖' },
  { id: 'setup-exam', label: 'בחינה', emoji: '⏱️' },
  { id: 'stats', label: 'סטטיסטיקה', emoji: '📊' },
  { id: 'weekly-plan', label: 'תוכנית שבועית', emoji: '📅' },
  { id: 'notebook', label: 'המחברת שלי', emoji: '📝' },
  { id: 'ai-coach', label: 'תובנות AI', emoji: '🤖' },
];

export default function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { isDark, toggleTheme, navigate } = useApp();

  return (
    <>
      <div className="md:hidden fixed top-0 left-0 right-0 bg-card/90 backdrop-blur-md h-16 border-b border-border z-30 flex items-center justify-between px-4">
        <div className="font-semibold flex items-center gap-2 text-foreground">
          <Heart className="w-5 h-5 text-primary" />
          סימולטור הרדמה
        </div>
        <div className="flex items-center gap-4">
          <button onClick={toggleTheme} className="text-muted-foreground">
            {isDark ? <Sun className="w-5 h-5 text-warning" /> : <Moon className="w-5 h-5" />}
          </button>
          <button onClick={() => setMenuOpen(true)} className="text-muted-foreground p-2">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 md:hidden backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="absolute right-0 top-0 bottom-0 w-72 bg-card shadow-2xl p-4 space-y-2" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-4">
              <button onClick={() => setMenuOpen(false)} className="text-muted-foreground p-2">
                <X className="w-5 h-5" />
              </button>
            </div>
            {mobileNav.map(item => (
              <button
                key={item.id}
                onClick={() => { navigate(item.id); setMenuOpen(false); }}
                className="w-full text-right p-4 font-medium border-b border-border text-foreground hover:bg-muted transition rounded-lg"
              >
                {item.emoji} {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
