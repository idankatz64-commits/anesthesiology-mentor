import { useApp } from '@/contexts/AppContext';
import { Heart, BookOpen, Timer, BarChart3 } from 'lucide-react';
import { type ViewId } from '@/lib/types';
import { motion } from 'framer-motion';
import SquircleIcon from './SquircleIcon';

const bottomNav: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'ראשי', icon: <SquircleIcon icon={Heart} gradient="gold" size="sm" /> },
  { id: 'setup-practice', label: 'תרגול', icon: <SquircleIcon icon={BookOpen} gradient="teal" size="sm" /> },
  { id: 'setup-exam', label: 'בחינה', icon: <SquircleIcon icon={Timer} gradient="orange" size="sm" /> },
  { id: 'stats', label: 'סטטיסטיקה', icon: <SquircleIcon icon={BarChart3} gradient="blue" size="sm" /> },
];

export default function MobileBottomNav() {
  const { currentView, navigate } = useApp();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/80 backdrop-blur-xl border-t border-border">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-l from-transparent via-primary/30 to-transparent" />
      <div className="flex items-center justify-around px-1 py-2 safe-bottom">
        {bottomNav.map(item => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl transition-all min-w-0 flex-1 relative
                ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-0 bg-primary/10 rounded-xl"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ willChange: 'transform' }}
                />
              )}
              <div className="relative z-10">
                {item.icon}
              </div>
              <span className="text-[10px] font-medium truncate w-full text-center relative z-10">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
