import { useState, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface AnimatedStatsTileProps {
  collapsed: ReactNode;
  expanded: ReactNode;
  className?: string;
  expandedClassName?: string;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export default function AnimatedStatsTile({ collapsed, expanded, className = '', expandedClassName }: AnimatedStatsTileProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <>
      <motion.div
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={spring}
        className={`deep-tile rounded-2xl cursor-pointer ${className}`}
      >
        {collapsed}
      </motion.div>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
            >
              <motion.div
                className="absolute inset-0 bg-black/70 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={spring}
                className={`bg-card border border-border rounded-2xl w-full overflow-y-auto p-6 relative z-10 ${expandedClassName || 'max-w-[90vw] max-h-[90vh]'}`}
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  if (Math.abs(info.offset.y) > 100) setOpen(false);
                }}
                style={{ willChange: 'transform' }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setOpen(false); }}
                  className="absolute top-4 left-4 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition z-20"
                >
                  <X className="w-4 h-4" />
                </button>
                {expanded}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
