import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play } from 'lucide-react';
import { EXAM_DATE } from '@/lib/smartSelection';
import { motivationalQuotes } from '@/data/motivationalQuotes';

interface TimeUnit {
  label: string;
  value: number;
}

function getTimeLeft() {
  const diff = EXAM_DATE.getTime() - Date.now();
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

function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/* ── Matrix Rain Canvas ── */
function MatrixRain({ width, height, isDark }: { width: number; height: number; isDark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789ABCDEF';
  const FONT_SIZE = 11;
  const FRAME_INTERVAL = 60;

  const accentBright = isDark ? 'hsl(120 100% 50% / 0.7)' : 'hsl(220 80% 55% / 0.7)';
  const accentDim = isDark ? 'hsl(120 100% 50% / 0.2)' : 'hsl(220 80% 55% / 0.2)';
  const fadeBg = isDark ? 'rgba(13, 15, 20, 0.06)' : 'rgba(245, 245, 250, 0.06)';
  const initBg = isDark ? 'rgba(13, 15, 20, 1)' : 'rgba(245, 245, 250, 1)';

  const draw = useCallback((timestamp: number) => {
    if (timestamp - lastFrameRef.current < FRAME_INTERVAL) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }
    lastFrameRef.current = timestamp;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = fadeBg;
    ctx.fillRect(0, 0, width, height);

    ctx.font = `${FONT_SIZE}px "Share Tech Mono", monospace`;

    const cols = columnsRef.current;
    for (let i = 0; i < cols.length; i++) {
      const char = CHARS[Math.floor(Math.random() * CHARS.length)];
      const x = i * FONT_SIZE;
      const y = cols[i] * FONT_SIZE;

      ctx.fillStyle = Math.random() > 0.6 ? accentBright : accentDim;
      ctx.fillText(char, x, y);

      if (y > height && Math.random() > 0.985) {
        cols[i] = 0;
      }
      cols[i]++;
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [width, height, accentBright, accentDim, fadeBg]);

  useEffect(() => {
    if (!width) return;
    const colCount = Math.floor(width / FONT_SIZE);
    columnsRef.current = Array.from({ length: colCount }, () => Math.floor(Math.random() * (height / FONT_SIZE)));

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = initBg;
        ctx.fillRect(0, 0, width, height);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, draw, initBg]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
}

/* ── Digit ── */
function Digit({ value, isDark }: { value: number; isDark: boolean }) {
  const str = String(value).padStart(value > 99 ? 3 : 2, '0');
  const digitColor = isDark ? '#f59f0a' : '#2563eb';
  const glowColor = isDark
    ? '0 0 10px rgba(245,159,10,0.6), 0 0 25px rgba(245,159,10,0.15)'
    : '0 0 10px rgba(37,99,235,0.5), 0 0 25px rgba(37,99,235,0.15)';
  const borderColor = isDark ? 'border-primary/20' : 'border-primary/20';

  return (
    <div className="relative flex gap-[2px]">
      {str.split('').map((ch, i) => (
        <div key={i} className="relative w-[1.8em] h-[2.4em] sm:w-[2.8em] sm:h-[3.6em] overflow-hidden">
          <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(245,159,10,0.03)_2px,rgba(245,159,10,0.03)_4px)] pointer-events-none z-10 rounded-sm" />
          <div className={`absolute inset-0 bg-background/70 border ${borderColor} rounded-sm`} />
          <AnimatePresence mode="popLayout">
            <motion.span
              key={`${ch}-${value}`}
              initial={{ y: -10, opacity: 0, filter: 'blur(3px)' }}
              animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
              exit={{ y: 10, opacity: 0, filter: 'blur(3px)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.6 }}
              className="absolute inset-0 flex items-center justify-center font-mono text-lg sm:text-3xl font-bold"
              style={{
                color: digitColor,
                textShadow: glowColor,
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

/* ── Separator ── */
function ColonSeparator({ isDark }: { isDark: boolean }) {
  const color = isDark ? 'rgba(245,159,10,0.4)' : 'rgba(37,99,235,0.4)';
  return (
    <motion.span
      className="font-mono text-base sm:text-2xl font-bold mx-0.5 sm:mx-1 self-center"
      style={{ color }}
      animate={{ opacity: [0.3, 1, 0.3] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      :
    </motion.span>
  );
}

/* ── Rotating Quote ── */
function RotatingQuote() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * motivationalQuotes.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIndex(prev => {
        let next;
        do { next = Math.floor(Math.random() * motivationalQuotes.length); } while (next === prev && motivationalQuotes.length > 1);
        return next;
      });
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const q = motivationalQuotes[index];

  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={index}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.5 }}
        className="text-muted-foreground/70 text-sm sm:text-base font-medium tracking-wide text-center max-w-lg mx-auto leading-relaxed"
      >
        "{q.quote}" <span className="text-muted-foreground/40">— {q.character}</span>
      </motion.p>
    </AnimatePresence>
  );
}

/* ── Main Component ── */
export default function MatrixCountdown() {
  const [time, setTime] = useState(getTimeLeft);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const isDark = useIsDark();
  const [rainEnabled, setRainEnabled] = useState(() => {
    const stored = localStorage.getItem('matrix_rain_enabled');
    return stored === null ? true : stored === 'true';
  });

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setDims({ w: Math.floor(entry.contentRect.width), h: Math.floor(entry.contentRect.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const toggleRain = () => {
    setRainEnabled(prev => {
      const next = !prev;
      localStorage.setItem('matrix_rain_enabled', String(next));
      return next;
    });
  };

  if (!time) return null;

  const units: TimeUnit[] = [
    { label: 'ימים', value: time.days },
    { label: 'שעות', value: time.hours },
    { label: 'דקות', value: time.minutes },
    { label: 'שניות', value: time.seconds },
  ];

  const totalDays = Math.ceil((EXAM_DATE.getTime() - Date.now()) / 86400000);
  const urgency = totalDays <= 30 ? 'imminent' : totalDays <= 90 ? 'approaching' : 'normal';

  const accentColor = isDark ? '#f59f0a' : '#2563eb';
  const glowLine = isDark
    ? 'linear-gradient(90deg, transparent, rgba(245,159,10,0.4), transparent)'
    : 'linear-gradient(90deg, transparent, rgba(37,99,235,0.4), transparent)';

  const ledColor = urgency === 'imminent'
    ? 'hsl(var(--destructive))'
    : urgency === 'approaching'
    ? 'hsl(var(--warning))'
    : accentColor;

  return (
    <motion.div
      ref={containerRef}
      className="deep-tile relative overflow-hidden rounded-2xl w-full"
      style={{ padding: 0 }}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 250, damping: 25 }}
    >
      {/* Inner padding wrapper so canvas covers full area */}
      <div className="relative px-4 py-4 sm:px-8 sm:py-7">
        {/* Matrix rain background — covers entire tile */}
        {rainEnabled && dims.w > 0 && <MatrixRain width={dims.w} height={dims.h} isDark={isDark} />}

        {/* Toggle button */}
        <button
          onClick={toggleRain}
          className="absolute top-2 right-2 z-20 p-1.5 rounded-md opacity-30 hover:opacity-80 transition-opacity"
          style={{ color: accentColor }}
          title={rainEnabled ? 'השהה אנימציה' : 'הפעל אנימציה'}
        >
          {rainEnabled ? <Pause size={14} /> : <Play size={14} />}
        </button>

        {/* Urgency glow */}
        <div
          className={`absolute inset-0 rounded-2xl pointer-events-none ${
            urgency === 'imminent'
              ? 'shadow-[inset_0_0_30px_hsl(0_72%_51%/0.15)]'
              : urgency === 'approaching'
              ? 'shadow-[inset_0_0_30px_hsl(45_93%_47%/0.1)]'
              : ''
          }`}
        />

        <div className="relative flex flex-col items-center gap-2 sm:gap-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: ledColor }}
              animate={{ opacity: [1, 0.3, 1], scale: [1, 0.8, 1] }}
              transition={{ duration: urgency === 'imminent' ? 0.6 : 1.5, repeat: Infinity }}
            />
            <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground tracking-[0.15em] sm:tracking-[0.2em] uppercase font-mono">
              BOARD EXAM COUNTDOWN
            </span>
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: ledColor }}
              animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
              transition={{ duration: urgency === 'imminent' ? 0.6 : 1.5, repeat: Infinity }}
            />
          </div>

          {/* Digits */}
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-center" dir="ltr">
            {units.map((u, i) => (
              <div key={u.label} className="flex items-center">
                <div className="flex flex-col items-center gap-1">
                  <Digit value={u.value} isDark={isDark} />
                  <span className="text-[8px] sm:text-[10px] text-muted-foreground/50 font-medium tracking-wide">{u.label}</span>
                </div>
                {i < units.length - 1 && <ColonSeparator isDark={isDark} />}
              </div>
            ))}
          </div>

          {/* Rotating motivational quote */}
          <RotatingQuote />
        </div>

        {/* Bottom glow line */}
        <div
          className="absolute bottom-0 left-[10%] right-[10%] h-[1px]"
          style={{ background: glowLine }}
        />
      </div>
    </motion.div>
  );
}
