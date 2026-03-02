import { useState, useEffect, ReactNode } from 'react';
import { X } from 'lucide-react';

interface StatsTileProps {
  collapsed: ReactNode;
  expanded: ReactNode;
  className?: string;
}

export default function StatsTile({ collapsed, expanded, className = '' }: StatsTileProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={`bg-[#141720] border border-white/[0.07] rounded-xl cursor-pointer transition-all duration-200 hover:border-orange-500/30 hover:shadow-[0_0_20px_rgba(249,115,22,0.1)] ${className}`}
      >
        {collapsed}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-[#141720] border border-white/[0.07] rounded-2xl max-w-[90vw] w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="absolute top-4 left-4 w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition"
            >
              <X className="w-4 h-4" />
            </button>
            {expanded}
          </div>
        </div>
      )}
    </>
  );
}
