import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EXAM_DATE } from '@/lib/smartSelection';

interface TimeUnit {
  label: string;
  value: number;
  max: number;
}

function getTimeLeft() {
  const now = Date.now();
  const diff = EXAM_DATE.getTime() - now;
  if (diff <= 0) return null;

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const afterDays = totalSeconds - days * 24 * 3600;
  const hours = Math.floor(afterDays / 3600);
  const afterHours = afterDays - hours * 3600;
  const minutes = Math.floor(afterHours / 60);
  const seconds = afterHours - minutes * 60;

  return { days, hours, minutes, seconds };
}

function Digit({ value, max }: { value: number; max: number }) {
  const str = String(value).padStart(2, '0');
  return (
    <div className="relative flex gap-[2px]">
      {str.split('').map((ch, i) => (
        <div key={i} className="relative w-[1.6em] h-[2.2em] overflow-hidden">
          {/* Faint scanline */}
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,255,65,0.03)_2px,rgba(0,255,65,0.03)_4px)] pointer-events-none z-10 rounded-sm" />
          <div className="absolute inset-0 bg-background/80 border border-matrix/20 rounded-sm" />
          <AnimatePresence mode="popLayout">
            <motion.span
              key={`${ch}-${value}`}
              initial={{ y: -8, opacity: 0, filter: 'blur(2px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: 8, opacity: 0, filter: 'blur(2px)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.6 }}
              className="absolute inset-0 flex items-center justify-center font-mono text-lg font-bold"
              style={{
                color: 'hsl(var(--matrix))',
                textShadow: '0 0 8px hsl(var(--matrix) / 0.6), 0 0 20px hsl(var(--matrix) / 0.2)',
              }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function Separator() {
  return (
    <motion.span
      className="font-mono text-lg font-bold mx-0.5 self-center"
      style={{ color: 'hsl(var(--matrix) / 0.4)' }}
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      :
    </motion.span>
  );
}

export default function MatrixCountdown() {
  const [time, setTime] = useState(getTimeLeft);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  const units: TimeUnit[] = [
    { label: 'ימים', value: time.days, max: 365 },
    { label: 'שעות', value: time.hours, max: 23 },
    { label: 'דקות', value: time.minutes, max: 59 },
    { label: 'שניות', value: time.seconds, max: 59 },
  ];

  const totalDays = Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000);
  const urgency = totalDays <= 30 ? 'imminent' : totalDays <= 90 ? 'approaching' : 'normal';

  return (
    <motion.div
      className="liquid-glass relative overflow-hidden px-4 py-3 shrink-0"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 25 }}
    >
      {/* Matrix rain overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='40'%3E%3Ctext x='2' y='15' font-size='10' fill='%2300ff41'%3E1%3C/text%3E%3Ctext x='8' y='30' font-size='8' fill='%2300ff41'%3E0%3C/text%3E%3Ctext x='3' y='38' font-size='6' fill='%2300ff41'%3E7%3C/text%3E%3C/svg%3E")`,
          backgroundSize: '20px 40px',
        }}
      />
      {/* Glow border based on urgency */}
      <div
        className={`absolute inset-0 rounded-2xl pointer-events-none ${
          urgency === 'imminent'
            ? 'shadow-[inset_0_0_20px_hsl(0_72%_51%/0.15)]'
            : urgency === 'approaching'
            ? 'shadow-[inset_0_0_20px_hsl(45_93%_47%/0.1)]'
            : ''
        }`}
      />

      <div className="relative flex flex-col items-center gap-2">
        {/* Title */}
        <div className="flex items-center gap-2">
          <motion.div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: urgency === 'imminent' ? 'hsl(var(--destructive))' : urgency === 'approaching' ? 'hsl(var(--warning))' : 'hsl(var(--matrix))' }}
            animate={{
              opacity: [1, 0.3, 1],
              scale: [1, 0.8, 1],
            }}
            transition={{ duration: urgency === 'imminent' ? 0.6 : 1.5, repeat: Infinity }}
          />
          <span className="text-[10px] font-medium text-muted-foreground tracking-widest uppercase font-mono">
            BOARD EXAM COUNTDOWN
          </span>
        </div>

        {/* Digits row */}
        <div className="flex items-center gap-1 flex-wrap justify-center" dir="ltr">
          {units.map((u, i) => (
            <div key={u.label} className="flex items-center">
              <div className="flex flex-col items-center gap-0.5">
                <Digit value={u.value} max={u.max} />
                <span className="text-[8px] text-muted-foreground/60 font-medium">{u.label}</span>
              </div>
              {i < units.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
