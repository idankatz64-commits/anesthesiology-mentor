import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer } from
'recharts';

interface ERITileProps {
  value: number;
  accuracy: number;
  coverage: number;
  criticalAvg: number;
  consistency: number;
  streak: number;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function ERIRing({ value, size = 240 }: {value: number;size?: number;}) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - value / 100 * circumference;
  const color = value >= 70 ? '#22C55E' : value >= 50 ? '#f59e0b' : '#EF4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.1} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1.2s ease-out', filter: `drop-shadow(0 0 8px ${color}40)` }} />

      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-5xl font-black text-foreground" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{value}%</span>
        <span className="text-xs text-muted-foreground font-medium mt-1">{getLabel(value)}</span>
      </div>
    </div>);

}

function getLabel(value: number) {
  if (value >= 70) return 'מוכן למבחן';
  if (value >= 50) return 'טוב';
  return 'מוכן חלקית';
}

export default function ERITile({ value, accuracy, coverage, criticalAvg, consistency, streak }: ERITileProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {if (e.key === 'Escape') setOpen(false);};
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {document.body.style.overflow = '';};
  }, [open]);

  const radarData = [
  { subject: 'דיוק (25%)', val: accuracy, fullMark: 100 },
  { subject: 'כיסוי (25%)', val: coverage, fullMark: 100 },
  { subject: 'נושאים קריטיים (30%)', val: criticalAvg, fullMark: 100 },
  { subject: 'עקביות (20%)', val: consistency, fullMark: 100 }];


  const satellites = [
  { label: 'דיוק', value: `${accuracy}%`, color: accuracy >= 70 ? '#22C55E' : accuracy >= 50 ? '#f59e0b' : '#EF4444' },
  { label: 'כיסוי', value: `${coverage}%`, color: '#F97316' },
  { label: 'רצף', value: `${streak}`, color: '#FB923C' }];


  return (
    <>
      <motion.div
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        transition={spring}
        className="deep-tile rounded-xl cursor-pointer h-full">

        <div className="flex flex-col items-center py-6 px-4">
          <ERIRing value={value} size={240} />
          <p className="mt-2 font-mono font-bold text-xl text-primary">מדד מוכנות למבחן</p>

          {/* Satellite pills */}
          <div className="flex items-center gap-4 mt-4">
            {satellites.map((s) =>
            <div key={s.label} className="flex flex-col items-center bg-muted/20 rounded-lg px-4 py-2 border border-border">
                <span className="text-lg font-black" style={{ fontFamily: "'Share Tech Mono', monospace", color: s.color }}>{s.value}</span>
                <span className="text-[9px] text-muted-foreground">{s.label}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {createPortal(
        <AnimatePresence>
          {open &&
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => {if (e.target === e.currentTarget) setOpen(false);}}>

              <motion.div className="absolute inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
              <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={spring}
              className="bg-card border border-border rounded-2xl max-w-4xl w-full max-h-[85vh] overflow-y-auto p-6 relative z-10">

                <button onClick={(e) => {e.stopPropagation();setOpen(false);}} className="absolute top-4 left-4 w-8 h-8 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground transition z-20">
                  <X className="w-4 h-4" />
                </button>
                <h3 className="text-lg font-bold text-foreground mb-6">מדד מוכנות למבחן (ERI)</h3>
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <ERIRing value={value} size={180} />
                  <div className="flex-1 w-full" style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData}>
                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 10 }} />
                        <Radar dataKey="val" stroke="#F97316" fill="#F97316" fillOpacity={0.25} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
                  {[
                { label: 'דיוק', val: accuracy, weight: '25%' },
                { label: 'כיסוי', val: coverage, weight: '25%' },
                { label: 'נושאים קריטיים', val: criticalAvg, weight: '30%' },
                { label: 'עקביות', val: consistency, weight: '20%' }].
                map((item) =>
                <div key={item.label} className="bg-muted/30 rounded-lg p-3 text-center">
                      <div className="text-xl font-bold text-foreground">{item.val}%</div>
                      <div className="text-[10px] text-muted-foreground">{item.label} ({item.weight})</div>
                    </div>
                )}
                </div>
              </motion.div>
            </motion.div>
          }
        </AnimatePresence>,
        document.body
      )}
    </>);

}