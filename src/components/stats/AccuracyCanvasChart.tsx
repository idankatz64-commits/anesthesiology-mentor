import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { Filter, X } from 'lucide-react';
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

function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

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

// S&P 500 style gradient for bar colors (matches Topic Treemap)
function interpolateColorRgb(c1: [number,number,number], c2: [number,number,number], t: number): [number,number,number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function getBarColor(acc: number): string {
  const stops: { at: number; rgb: [number,number,number] }[] = [
    { at: 0,   rgb: [139, 0, 0] },     // #8B0000 deep red
    { at: 40,  rgb: [204, 0, 0] },     // #CC0000 red
    { at: 55,  rgb: [74, 74, 74] },    // #4A4A4A neutral
    { at: 70,  rgb: [46, 125, 50] },   // #2E7D32 green
    { at: 100, rgb: [0, 200, 83] },    // #00C853 deep green
  ];
  const clamped = Math.max(0, Math.min(100, acc));
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped <= stops[i + 1].at) {
      const t = (clamped - stops[i].at) / (stops[i + 1].at - stops[i].at);
      const [r, g, b] = interpolateColorRgb(stops[i].rgb, stops[i + 1].rgb, t);
      return `rgb(${r},${g},${b})`;
    }
  }
  const last = stops[stops.length - 1].rgb;
  return `rgb(${last[0]},${last[1]},${last[2]})`;
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

function ChartContent({ expanded = false, refreshKey = 0 }: { expanded?: boolean; refreshKey?: number }) {
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const volCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [rawRows, setRawRows] = useState<{ answered_at: string; is_correct: boolean; topic: string | null }[]>([]);
  const [data, setData] = useState<DayData[]>([]);
  const [groupDailyAvg, setGroupDailyAvg] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [showEma7, setShowEma7] = useState(true);
  const [showEma14, setShowEma14] = useState(true);
  const [showGlobalAvg, setShowGlobalAvg] = useState(true);
  const [logScale, setLogScale] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [topicSearchOpen, setTopicSearchOpen] = useState(false);

  const PANEL1_H = expanded ? 450 : 340;
  const PANEL2_H = expanded ? 110 : 90;
  const MARGIN = { top: 10, right: 10, bottom: 20, left: 40 };

  // Fetch raw rows — re-fetch when refreshKey changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const since = new Date();
      since.setDate(since.getDate() - 90);
      const sinceStr = since.toISOString();

      const [userRes, groupRes] = await Promise.all([
        supabase
          .from('answer_history')
          .select('answered_at, is_correct, topic')
          .eq('user_id', user.id)
          .gte('answered_at', sinceStr)
          .order('answered_at', { ascending: true }),
        supabase.rpc('get_global_daily_accuracy', { since_date: sinceStr }),
      ]);

      if (cancelled) return;
      if (!userRes.error && userRes.data) setRawRows(userRes.data);
      if (!groupRes.error && groupRes.data) {
        const map: Record<string, number> = {};
        (groupRes.data as any[]).forEach((r: any) => { map[r.day] = Number(r.avg_accuracy); });
        setGroupDailyAvg(map);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

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
      const d = toIsraelDateStr(new Date(r.answered_at));
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

    // Log scale helper: maps 0-100% → 0-1 (normalized), then to canvas Y
    const LOG_BASE = Math.log(101); // log(1+100)
    const toY = (pct: number) => {
      const norm = logScale
        ? Math.log(1 + Math.max(0, Math.min(100, pct))) / LOG_BASE
        : pct / 100;
      return MARGIN.top + plotH * (1 - norm);
    };

    // Grid lines – pick nice percentage ticks
    const gridTicks = logScale ? [5, 10, 20, 40, 60, 80, 100] : [20, 40, 60, 80, 100];
    ctx.strokeStyle = theme.gridLine;
    ctx.lineWidth = 1;
    for (const pct of gridTicks) {
      const y = toY(pct);
      ctx.beginPath();
      ctx.moveTo(MARGIN.left, y);
      ctx.lineTo(w - MARGIN.right, y);
      ctx.stroke();
      ctx.fillStyle = theme.text;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, MARGIN.left - 4, y + 3);
    }

    // Draw accuracy as area chart with green fill (TradingView style)
    const accColor = '#26a69a'; // TradingView green
    const accPoints: { x: number; y: number; acc: number }[] = [];
    for (let i = 0; i < data.length; i++) {
      const d = data[i];
      if (d.total === 0) continue;
      const x = MARGIN.left + ((i + 0.5) / data.length) * plotW;
      const y = toY(d.accuracy);
      accPoints.push({ x, y, acc: d.accuracy });
    }

    // Area fill — gradient from green to transparent
    if (accPoints.length > 1) {
      const areaGrad = ctx.createLinearGradient(0, MARGIN.top, 0, MARGIN.top + plotH);
      areaGrad.addColorStop(0, 'rgba(38, 166, 154, 0.35)');
      areaGrad.addColorStop(1, 'rgba(38, 166, 154, 0.02)');
      ctx.fillStyle = areaGrad;
      ctx.beginPath();
      ctx.moveTo(accPoints[0].x, MARGIN.top + plotH); // bottom-left
      for (const pt of accPoints) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(accPoints[accPoints.length - 1].x, MARGIN.top + plotH); // bottom-right
      ctx.closePath();
      ctx.fill();
    }

    // Line on top of area
    ctx.strokeStyle = accColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    let started = false;
    for (const pt of accPoints) {
      if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

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
        const y = toY(val);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    };

    if (showEma7) drawLine(d => d.ema7, DATA_COLORS.ema7, true, 2); // dotted orange
    if (showEma14) drawLine(d => d.ema14, DATA_COLORS.ema14, true, 1.5);

    // Group daily average trend line (dynamic, not flat)
    if (showGlobalAvg) {
      drawLine(d => {
        const gVal = groupDailyAvg[d.date];
        return gVal !== undefined ? gVal : null;
      }, DATA_COLORS.globalAvg, false, 2);
    }

    // Crosshair on hover
    if (hoverIndex !== null && hoverIndex < data.length) {
      const d = data[hoverIndex];
      const x = MARGIN.left + ((hoverIndex + 0.5) / data.length) * plotW;
      const y = toY(d.accuracy);
      ctx.strokeStyle = theme.crosshair;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, MARGIN.top); ctx.lineTo(x, MARGIN.top + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(MARGIN.left, y); ctx.lineTo(w - MARGIN.right, y); ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [data, hoverIndex, maxVol, showEma7, showEma14, showGlobalAvg, logScale, globalAvg, groupDailyAvg, getCanvasWidth, PANEL1_H]);

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

      const barColor = getBarColor(d.accuracy);
      ctx.fillStyle = barColor.replace('rgb(', 'rgba(').replace(')', ', 0.7)');
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
        <div className="flex items-center gap-2.5">
          <span className="text-base">📈</span>
          <div>
            <h3 className="text-sm font-bold text-foreground leading-tight">
              Technical Performance Analysis
              {selectedTopic && <span className="text-xs font-normal text-muted-foreground mr-2">({selectedTopic})</span>}
            </h3>
            <p className="text-[10px] text-muted-foreground leading-tight">Historical performance relative to moving averages</p>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {/* Topic filter */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setTopicSearchOpen(v => !v); }}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all border flex items-center gap-1 ${
                selectedTopic
                  ? 'bg-primary/15 border-primary/30 text-primary'
                  : 'bg-transparent border-foreground/10 text-muted-foreground'
              }`}
            >
              <Filter className="w-3 h-3" />
              {selectedTopic ? 'מסנן' : 'נושא'}
            </button>
            {selectedTopic && (
              <button
                onClick={(e) => { e.stopPropagation(); setSelectedTopic(''); }}
                className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
            {topicSearchOpen && (
              <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-lg shadow-xl w-64 max-h-60 overflow-y-auto" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { setSelectedTopic(''); setTopicSearchOpen(false); }}
                  className={`w-full text-right px-3 py-2 text-xs hover:bg-muted/50 transition ${!selectedTopic ? 'font-bold text-primary' : 'text-foreground'}`}
                >
                  כל הנושאים
                </button>
                {availableTopics.map(t => (
                  <button
                    key={t}
                    onClick={() => { setSelectedTopic(t); setTopicSearchOpen(false); }}
                    className={`w-full text-right px-3 py-2 text-xs hover:bg-muted/50 transition truncate ${selectedTopic === t ? 'font-bold text-primary bg-primary/5' : 'text-foreground'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToggleBtn active={!logScale} label="LINEAR" onClick={() => setLogScale(false)} />
          <ToggleBtn active={logScale} label="LOGARITHMIC" onClick={() => setLogScale(true)} />
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DATA_COLORS.ema7 }} />
            SMA-20
          </span>
          <ToggleBtn active={showGlobalAvg} label="ממוצע כללי" onClick={() => setShowGlobalAvg(v => !v)} />
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative px-2 bg-background"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={mainCanvasRef} style={{ display: 'block', width: '100%' }} />
        <div className="border-t border-border mx-2" />
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
            {showGlobalAvg && groupDailyAvg[hovered.date] !== undefined && <div className="text-muted-foreground">ממוצע קבוצה: <span className="font-bold" style={{ color: DATA_COLORS.globalAvg }}>{groupDailyAvg[hovered.date]}%</span></div>}
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
  const { progress } = useApp();
  // Use history length as refresh key so chart re-fetches after new answers
  const refreshKey = useMemo(() => Object.keys(progress.history || {}).length, [progress.history]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
    >
      <AnimatedStatsTile
        collapsed={<ChartContent refreshKey={refreshKey} />}
        expanded={<ChartContent expanded refreshKey={refreshKey} />}
        expandedClassName="max-w-[95vw] max-h-[95vh] w-full"
      />
    </motion.div>
  );
}
