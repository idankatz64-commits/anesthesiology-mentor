import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import AnimatedStatsTile from './AnimatedStatsTile';

interface DayData {
  date: string;
  total: number;
  correct: number;
  accuracy: number;
  ema7: number | null;
  ema14: number | null;
}

// TradingView-inspired colors
const DATA_COLORS = {
  bullish: '#26a69a',    // TradingView green
  bearish: '#ef5350',    // TradingView red
  neutral: '#ff9800',    // amber for mid-range
  ema7: '#ff9800',
  ema14: '#2196f3',
  globalAvg: '#9c27b0',
};

function getThemeColors() {
  const root = getComputedStyle(document.documentElement);
  const getVar = (name: string) => root.getPropertyValue(name).trim();
  return {
    bg: `hsl(${getVar('--background')})`,
    card: `hsl(${getVar('--card')})`,
    border: `hsl(${getVar('--border')})`,
    text: `hsl(${getVar('--muted-foreground')})`,
    textBright: `hsl(${getVar('--foreground')})`,
    crosshair: `hsl(${getVar('--foreground')} / 0.15)`,
    tooltipBg: `hsl(${getVar('--card')})`,
    tooltipBorder: `hsl(${getVar('--border')})`,
    gridLine: `hsl(${getVar('--border')})`,
  };
}

function getBarColor(acc: number) {
  if (acc >= 70) return DATA_COLORS.bullish;
  if (acc >= 50) return DATA_COLORS.neutral;
  return DATA_COLORS.bearish;
}

function computeEMA(data: { accuracy: number }[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (ema === null) {
      const slice = data.slice(0, period);
      ema = slice.reduce((s, v) => s + v.accuracy, 0) / period;
      result.push(Math.round(ema * 10) / 10);
    } else {
      ema = data[i].accuracy * k + ema * (1 - k);
      result.push(Math.round(ema * 10) / 10);
    }
  }
  return result;
}

function formatDateHeb(d: string) {
  const dt = new Date(d + 'T00:00:00');
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yy = String(dt.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function ChartContent({ expanded = false }: { expanded?: boolean }) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const volCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawRows, setRawRows] = useState<{ answered_at: string; is_correct: boolean; topic: string | null }[]>([]);
  const [data, setData] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [showEma7, setShowEma7] = useState(true);
  const [showEma14, setShowEma14] = useState(true);
  const [showGlobalAvg, setShowGlobalAvg] = useState(true);
  const [logScale, setLogScale] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [topicSearchOpen, setTopicSearchOpen] = useState(false);

  const PANEL1_H = expanded ? 450 : 340;
  const PANEL2_H = expanded ? 110 : 90;
  const MARGIN = { top: 10, right: 10, bottom: 20, left: 40 };

  // Fetch raw rows once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const sinceStr = since.toISOString();

      const { data: rows, error } = await supabase
        .from('answer_history')
        .select('answered_at, is_correct, topic')
        .eq('user_id', user.id)
        .gte('answered_at', sinceStr)
        .order('answered_at', { ascending: true });

      if (cancelled || error || !rows) { setLoading(false); return; }
      if (!cancelled) { setRawRows(rows); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Available topics
  const availableTopics = useMemo(() => {
    const topics = new Set<string>();
    rawRows.forEach(r => { if (r.topic) topics.add(r.topic); });
    return Array.from(topics).sort();
  }, [rawRows]);

  // Process rows into chart data (filtered by topic)
  useEffect(() => {
    const filtered = selectedTopic
      ? rawRows.filter(r => r.topic === selectedTopic)
      : rawRows;

    const byDate: Record<string, { total: number; correct: number }> = {};
    for (const r of filtered) {
      const d = r.answered_at.slice(0, 10);
      if (!byDate[d]) byDate[d] = { total: 0, correct: 0 };
      byDate[d].total++;
      if (r.is_correct) byDate[d].correct++;
    }

    const sorted = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        total: v.total,
        correct: v.correct,
        accuracy: Math.round((v.correct / v.total) * 100 * 10) / 10,
        ema7: null as number | null,
        ema14: null as number | null,
      }));

    const ema7 = computeEMA(sorted, 7);
    const ema14 = computeEMA(sorted, 14);
    sorted.forEach((d, i) => { d.ema7 = ema7[i]; d.ema14 = ema14[i]; });

    setData(sorted);
  }, [rawRows, selectedTopic]);

  const globalAvg = useMemo(() => {
    if (!data.length) return 0;
    const totalCorrect = data.reduce((s, d) => s + d.correct, 0);
    const totalQ = data.reduce((s, d) => s + d.total, 0);
    return totalQ ? Math.round((totalCorrect / totalQ) * 100 * 10) / 10 : 0;
  }, [data]);

  const maxVol = useMemo(() => Math.max(1, ...data.map(d => d.total)), [data]);

  const getCanvasWidth = useCallback(() => containerRef.current?.clientWidth || 600, []);

  const drawMain = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !data.length) return;
    const theme = getThemeColors();
    const dpr = window.devicePixelRatio || 1;
    const w = getCanvasWidth();
    canvas.width = w * dpr;
    canvas.height = PANEL1_H * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = PANEL1_H + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, PANEL1_H);

    const plotW = w - MARGIN.left - MARGIN.right;
    const plotH = PANEL1_H - MARGIN.top - MARGIN.bottom;
    const slotW = plotW / data.length;
    const bodyW = Math.max(3, slotW * 0.55);

    // Grid lines
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    for (const pct of [20, 40, 60, 80, 100]) {
      const y = MARGIN.top + plotH * (1 - pct / 100);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(w - MARGIN.right, y);
      ctx.stroke();
      ctx.fillStyle = theme.text;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, MARGIN.left - 4, y + 3);
    }

    // Draw candlesticks: position = accuracy on Y, height = volume
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.total === 0) continue;

      const centerX = MARGIN.left + (i + 0.5) * slotW;
      const color = getBarColor(d.accuracy);
      const isHovered = hoverIndex === i;

      // Candle center Y = accuracy position
      const centerY = MARGIN.top + plotH * (1 - d.accuracy / 100);

      // Body height proportional to volume (scaled so max volume fills ~40% of chart)
      let volNorm = d.total / maxVol;
      if (logScale && d.total > 0) volNorm = Math.log(d.total + 1) / Math.log(maxVol + 1);
      const bodyH = Math.max(4, volNorm * plotH * 0.4);

      const bodyTop = centerY - bodyH / 2;
      const bodyBottom = centerY + bodyH / 2;

      // Wick (extends 30% beyond body on each side)
      const wickExtend = bodyH * 0.3;
      const wickTop = Math.max(MARGIN.top, bodyTop - wickExtend);
      const wickBottom = Math.min(MARGIN.top + plotH, bodyBottom + wickExtend);

      // Draw wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, wickTop);
      ctx.lineTo(centerX, wickBottom);
      ctx.stroke();

      // Draw body
      ctx.fillStyle = isHovered ? color : hexToRgba(color, 0.85);
      ctx.fillRect(centerX - bodyW / 2, bodyTop, bodyW, bodyH);

      // Body border
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.strokeRect(centerX - bodyW / 2, bodyTop, bodyW, bodyH);

      // Glow effect on hover
      if (isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = hexToRgba(color, 0.3);
        ctx.fillRect(centerX - bodyW / 2 - 2, bodyTop - 2, bodyW + 4, bodyH + 4);
        ctx.shadowBlur = 0;
      }
    }

    // EMA / average lines
    const drawLine = (getValue: (d: DayData) => number | null, color: string, dashed = false, lineW = 2) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < data.length; i++) {
        const val = getValue(data[i]);
        if (val === null) { started = false; continue; }
        const x = MARGIN.left + ((i + 0.5) / data.length) * plotW;
        const y = MARGIN.top + plotH * (1 - val / 100);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (showEma7) drawLine(d => d.ema7, DATA_COLORS.ema7);
    if (showEma14) drawLine(d => d.ema14, DATA_COLORS.ema14);
    if (showGlobalAvg) drawLine(() => globalAvg, DATA_COLORS.globalAvg, true, 1.5);

    // Crosshair on hover
    if (hoverIndex !== null && hoverIndex < data.length) {
      const d = data[hoverIndex];
      const x = MARGIN.left + ((hoverIndex + 0.5) / data.length) * plotW;
      const y = MARGIN.top + plotH * (1 - d.accuracy / 100);
      ctx.strokeStyle = theme.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, MARGIN.top + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(w - MARGIN.right, y); ctx.stroke();
      ctx.setLineDash([]);

      // Price label on Y axis
      ctx.fillStyle = getBarColor(d.accuracy);
      const labelW = 42;
      const labelH = 16;
      ctx.fillRect(0, y - labelH / 2, MARGIN.left - 2, labelH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${d.accuracy}%`, MARGIN.left - 5, y + 4);
    }
  }, [data, hoverIndex, maxVol, showEma7, showEma14, showGlobalAvg, logScale, globalAvg, getCanvasWidth, PANEL1_H]);

  const drawVolume = useCallback(() => {
    const canvas = volCanvasRef.current;
    if (!canvas || !data.length) return;
    const theme = getThemeColors();
    const dpr = window.devicePixelRatio || 1;
    const w = getCanvasWidth();
    canvas.width = w * dpr;
    canvas.height = PANEL2_H * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = PANEL2_H + 'px';
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, PANEL2_H);

    const plotW = w - MARGIN.left - MARGIN.right;
    const plotH = PANEL2_H - 5 - 15;
    const barW = Math.max(2, (plotW / data.length) * 0.5);

    ctx.fillStyle = theme.text;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('שאלות', MARGIN.left - 4, 14);

    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      const x = MARGIN.left + (i / data.length) * plotW + (plotW / data.length - barW) / 2;
      let volNorm = d.total / maxVol;
      if (logScale && d.total > 0) volNorm = Math.log(d.total + 1) / Math.log(maxVol + 1);
      const barH = volNorm * plotH;
      const y = 5 + plotH - barH;

      ctx.fillStyle = hexToRgba(getBarColor(d.accuracy), 0.35);
      ctx.fillRect(x, y, barW, barH);
    }

    const step = Math.max(1, Math.floor(data.length / 6));
    ctx.fillStyle = theme.text;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    for (let i = 0; i < data.length; i += step) {
      const x = MARGIN.left + ((i + 0.5) / data.length) * plotW;
      ctx.fillText(formatDateHeb(data[i].date), x, PANEL2_H - 2);
    }

    if (hoverIndex !== null && hoverIndex < data.length) {
      const x = MARGIN.left + ((hoverIndex + 0.5) / data.length) * plotW;
      ctx.strokeStyle = theme.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, PANEL2_H - 15); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, hoverIndex, maxVol, logScale, getCanvasWidth, PANEL2_H]);

  useEffect(() => { drawMain(); drawVolume(); }, [drawMain, drawVolume]);

  useEffect(() => {
    const onResize = () => { drawMain(); drawVolume(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [drawMain, drawVolume]);

  // Re-draw when theme changes (observe class on html element)
  useEffect(() => {
    const observer = new MutationObserver(() => { drawMain(); drawVolume(); });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [drawMain, drawVolume]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!data.length || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const w = rect.width;
    const plotW = w - MARGIN.left - MARGIN.right;
    const relX = x - MARGIN.left;
    if (relX < 0 || relX > plotW) { setHoverIndex(null); setTooltipPos(null); return; }
    const idx = Math.min(data.length - 1, Math.floor((relX / plotW) * data.length));
    setHoverIndex(idx);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [data]);

  const handleMouseLeave = useCallback(() => { setHoverIndex(null); setTooltipPos(null); }, []);

  const statsBar = useMemo(() => {
    if (!data.length) return null;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const todayData = data.find(d => d.date === today);
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const yesterdayData = data.find(d => d.date === yesterdayStr);

    const lastEma7 = [...data].reverse().find(d => d.ema7 !== null)?.ema7;
    const lastEma14 = [...data].reverse().find(d => d.ema14 !== null)?.ema14;

    const change = todayData && yesterdayData
      ? Math.round((todayData.accuracy - yesterdayData.accuracy) * 10) / 10
      : null;

    return { todayAcc: todayData?.accuracy ?? null, todayVol: todayData?.total ?? 0, lastEma7, lastEma14, globalAvg, change };
  }, [data, globalAvg]);

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <div className="text-sm text-muted-foreground">טוען נתונים...</div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center" dir="rtl">
        <div className="text-sm text-muted-foreground">אין נתוני תרגול ב-90 הימים האחרונים</div>
      </div>
    );
  }

  const ToggleBtn = ({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`px-3 py-1 rounded-md text-xs font-bold transition-all border ${
        active
          ? 'bg-foreground/10 border-foreground/25 text-foreground'
          : 'bg-transparent border-foreground/10 text-muted-foreground'
      }`}
    >
      {label}
    </button>
  );

  const containerWidth = containerRef.current?.clientWidth || 600;
  const tooltipFlipX = tooltipPos && tooltipPos.x > containerWidth * 0.65;

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden" dir="rtl">
      <div className="flex items-center justify-between p-4 pb-2 flex-wrap gap-2">
        <h3 className="text-sm font-bold text-foreground">מגמת דיוק — 90 ימים</h3>
        <div className="flex gap-1.5 flex-wrap">
          <ToggleBtn active={showEma7} label="EMA 7" onClick={() => setShowEma7(v => !v)} />
          <ToggleBtn active={showEma14} label="EMA 14" onClick={() => setShowEma14(v => !v)} />
          <ToggleBtn active={showGlobalAvg} label="ממוצע כללי" onClick={() => setShowGlobalAvg(v => !v)} />
          <ToggleBtn active={logScale} label="לוגריתמי" onClick={() => setLogScale(v => !v)} />
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative px-2 bg-background"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={mainCanvasRef} style={{ display: 'block', width: '100%' }} />
        <canvas ref={volCanvasRef} style={{ display: 'block', width: '100%' }} />

        {hovered && tooltipPos && (
          <div
            className="absolute pointer-events-none rounded-lg px-3 py-2 text-xs z-50 bg-card border border-border shadow-xl"
            style={{
              top: Math.min(tooltipPos.y - 10, PANEL1_H - 20),
              ...(tooltipFlipX
                ? { right: containerWidth - tooltipPos.x + 12 }
                : { left: tooltipPos.x + 12 }),
              direction: 'rtl',
            }}
          >
            <div className="font-bold mb-1 text-foreground">{formatDateHeb(hovered.date)}</div>
            <div className="text-muted-foreground">שאלות היום: <span className="font-bold text-foreground">{hovered.total}</span></div>
            <div className="text-muted-foreground">דיוק: <span className="font-bold" style={{ color: getBarColor(hovered.accuracy) }}>{hovered.accuracy}%</span></div>
            {showEma7 && hovered.ema7 !== null && <div className="text-muted-foreground">EMA 7: <span className="font-bold" style={{ color: DATA_COLORS.ema7 }}>{hovered.ema7}%</span></div>}
            {showEma14 && hovered.ema14 !== null && <div className="text-muted-foreground">EMA 14: <span className="font-bold" style={{ color: DATA_COLORS.ema14 }}>{hovered.ema14}%</span></div>}
            <div className="text-muted-foreground">ממוצע כללי: <span className="font-bold" style={{ color: DATA_COLORS.globalAvg }}>{globalAvg}%</span></div>
          </div>
        )}
      </div>

      {statsBar && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-xs border-t border-border">
          <span className="text-muted-foreground">דיוק היום: <span className="font-bold" style={{ color: statsBar.todayAcc !== null ? getBarColor(statsBar.todayAcc) : undefined }}>{statsBar.todayAcc !== null ? `${statsBar.todayAcc}%` : '—'}</span></span>
          <span className="text-muted-foreground">EMA 7: <span className="font-bold" style={{ color: DATA_COLORS.ema7 }}>{statsBar.lastEma7 !== null && statsBar.lastEma7 !== undefined ? `${statsBar.lastEma7}%` : '—'}</span></span>
          <span className="text-muted-foreground">EMA 14: <span className="font-bold" style={{ color: DATA_COLORS.ema14 }}>{statsBar.lastEma14 !== null && statsBar.lastEma14 !== undefined ? `${statsBar.lastEma14}%` : '—'}</span></span>
          <span className="text-muted-foreground">ממוצע כללי: <span className="font-bold" style={{ color: DATA_COLORS.globalAvg }}>{globalAvg}%</span></span>
          <span className="text-muted-foreground">שאלות היום: <span className="font-bold text-foreground">{statsBar.todayVol}</span></span>
          <span className="text-muted-foreground">שינוי מאתמול: <span className="font-bold" style={{ color: statsBar.change !== null ? (statsBar.change >= 0 ? DATA_COLORS.bullish : DATA_COLORS.bearish) : undefined }}>{statsBar.change !== null ? `${statsBar.change > 0 ? '+' : ''}${statsBar.change}%` : '—'}</span></span>
        </div>
      )}
    </div>
  );
}

export default function AccuracyCanvasChart() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
    >
      <AnimatedStatsTile
        collapsed={<ChartContent />}
        expanded={<ChartContent expanded />}
        expandedClassName="max-w-[95vw] max-h-[95vh] w-full"
      />
    </motion.div>
  );
}
