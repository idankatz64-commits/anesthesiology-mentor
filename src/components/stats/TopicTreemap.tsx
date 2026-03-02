import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AnimatedStatsTile from './AnimatedStatsTile';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import type { TopicStat } from './useStatsData';

interface Props {
  topicData: TopicStat[];
  onTopicClick: (topic: string) => void;
  unclassifiedData?: TopicStat;
  isAdmin?: boolean;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

function interpolateColor(c1: string, c2: string, t: number) {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return `rgb(${r},${g},${b})`;
}

function getTreemapColor(score: number) {
  // S&P 500 style gradient: deep red → red → neutral → green → deep green
  const stops = [
    { at: 0, color: '#8B0000' },
    { at: 40, color: '#CC0000' },
    { at: 55, color: '#4A4A4A' },
    { at: 70, color: '#2E7D32' },
    { at: 100, color: '#00C853' },
  ];
  const clamped = Math.max(0, Math.min(100, score));
  for (let i = 0; i < stops.length - 1; i++) {
    if (clamped <= stops[i + 1].at) {
      const t = (clamped - stops[i].at) / (stops[i + 1].at - stops[i].at);
      return interpolateColor(stops[i].color, stops[i + 1].color, t);
    }
  }
  return stops[stops.length - 1].color;
}

function isUnclassifiedTopic(topic: string) {
  const normalized = topic.trim().toUpperCase();
  return normalized === 'N/A#' || normalized === '#N/A';
}

interface CustomContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  smartScore?: number;
  depth?: number;
}

function CustomTreemapContent(props: CustomContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name, smartScore = 0, depth } = props;
  if (depth !== 1) return null;

  const color = getTreemapColor(smartScore);
  const showText = width >= 60 && height >= 35;
  const showScore = showText && height >= 45;
  const maxChars = Math.floor(width / 7);
  const displayName = name && name.length > maxChars ? name.slice(0, maxChars) + '…' : name;

  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={1}
        rx={4} ry={4}
        style={{ cursor: 'pointer' }}
      />
      {showText && (
        <foreignObject x={x} y={y} width={width} height={height} style={{ overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ width, height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '2px 4px', boxSizing: 'border-box' }}>
            <span style={{ color: '#fff', fontSize: Math.min(14, width / 6), fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', textAlign: 'center' }}>
              {displayName}
            </span>
            {showScore && (
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: "'Share Tech Mono', monospace", marginTop: 2 }}>
                {smartScore}%
              </span>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card dark:bg-[#1a1d28] border border-border dark:border-white/[0.1] rounded-lg px-3 py-2 text-xs shadow-xl" dir="rtl">
      <div className="font-bold text-foreground mb-1">{d.name}</div>
      <div className="text-muted-foreground">Smart Score: <span className="font-bold text-foreground">{d.smartScore}%</span></div>
      <div className="text-muted-foreground">דיוק: <span className="font-bold text-foreground">{d.accuracy}%</span></div>
      <div className="text-muted-foreground">כיסוי: <span className="font-bold text-foreground">{d.coverage}%</span></div>
      <div className="text-muted-foreground">ניסיונות: <span className="font-bold text-foreground">{d.totalAnswered}</span></div>
    </div>
  );
};

export default function TopicTreemap({ topicData, onTopicClick, unclassifiedData, isAdmin }: Props) {
  const navigate = useNavigate();

  const unclassifiedBanner = useMemo(() => {
    if (!unclassifiedData || unclassifiedData.totalInDb === 0) return null;
    const coverage = unclassifiedData.totalInDb > 0 ? Math.round((unclassifiedData.totalAnswered / unclassifiedData.totalInDb) * 100) : 0;
    return (
      <div dir="rtl" className="bg-white/5 border border-dashed border-white/10 rounded-lg px-4 py-2.5 h-12 flex items-center justify-between mt-3">
        <span className="text-[11px] text-muted-foreground">
          ⚠️ שאלות ללא סיווג פרק: <span className="font-bold text-foreground">{unclassifiedData.totalInDb}</span> שאלות | כיסוי: <span className="font-bold text-foreground">{coverage}%</span> | דיוק: <span className="font-bold text-foreground">{unclassifiedData.accuracy}%</span>
        </span>
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="text-[10px] font-bold text-orange-400 border border-orange-500/20 bg-orange-500/10 rounded-md px-2.5 py-1 hover:bg-orange-500/20 transition"
          >
            סווג שאלות
          </button>
        )}
      </div>
    );
  }, [unclassifiedData, isAdmin, navigate]);
  const treemapData = useMemo(() => {
    return topicData
      .filter(t => t.totalInDb > 0 && !isUnclassifiedTopic(t.topic))
      .map(t => ({
        name: t.topic,
        size: Math.max(t.totalInDb, 1),
        smartScore: t.smartScore,
        accuracy: t.accuracy,
        coverage: t.totalInDb > 0 ? Math.round((t.totalAnswered / t.totalInDb) * 100) : 0,
        totalAnswered: t.totalAnswered,
      }));
  }, [topicData]);

  if (treemapData.length === 0) {
    return (
      <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-8 text-center">
        <p className="text-muted-foreground">אין נתוני נושאים עדיין</p>
      </div>
    );
  }

  return (
    <AnimatedStatsTile
      expandedClassName="max-w-[95vw] max-h-[95vh]"
      collapsed={
        <div className="p-5">
          <span className="text-xs text-muted-foreground font-medium">מפת ביצועים לפי נושא</span>
          <p className="text-[10px] text-muted-foreground/50 mb-3">גודל = כמות שאלות • צבע = Smart Score</p>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                content={<CustomTreemapContent />}
                onClick={(node: any) => {
                  if (node?.name) onTopicClick(node.name);
                }}
              >
                <Tooltip content={<CustomTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 justify-center">
            <span className="text-[9px] text-muted-foreground">0%</span>
            <div className="h-2.5 w-40 rounded-full" style={{
              background: 'linear-gradient(to right, #8B0000, #CC0000, #4A4A4A, #2E7D32, #00C853)',
            }} />
            <span className="text-[9px] text-muted-foreground">100%</span>
          </div>
          {unclassifiedBanner}
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-2">מפת ביצועים לפי נושא</h3>
          <p className="text-xs text-muted-foreground mb-4">לחץ על ריבוע כדי להתחיל תרגול בנושא</p>
          <div style={{ height: 'calc(95vh - 120px)' }}>
            <ResponsiveContainer width="100%" height="100%">
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                content={<CustomTreemapContent />}
                onClick={(node: any) => {
                  if (node?.name) onTopicClick(node.name);
                }}
              >
                <Tooltip content={<CustomTooltip />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-2 mt-4 justify-center">
            <span className="text-[10px] text-muted-foreground">חלש 0%</span>
            <div className="h-3 w-48 rounded-full" style={{
              background: 'linear-gradient(to right, #8B0000, #CC0000, #4A4A4A, #2E7D32, #00C853)',
            }} />
            <span className="text-[10px] text-muted-foreground">100% מצוין</span>
          </div>
          {unclassifiedBanner}
        </div>
      }
    />
  );
}
