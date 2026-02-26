import { useMemo } from 'react';
import AnimatedStatsTile from './AnimatedStatsTile';
import type { ForgettingRisk } from './useStatsData';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { AlertTriangle } from 'lucide-react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  risks: ForgettingRisk[];
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

function getRiskColor(risk: number) {
  // Logarithmic mapping: spread low values more, compress high values
  // Risk range 0-3.5 → normalized 0-1 via log scale
  const maxRisk = 3.5;
  const clamped = Math.max(0, Math.min(maxRisk, risk));
  // log1p gives better spread for low values
  const t = Math.log1p(clamped) / Math.log1p(maxRisk); // 0..1

  const stops = [
    { at: 0, color: '#00C853' },
    { at: 0.25, color: '#2E7D32' },
    { at: 0.45, color: '#4A4A4A' },
    { at: 0.65, color: '#CC0000' },
    { at: 1.0, color: '#8B0000' },
  ];

  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1].at) {
      const localT = (t - stops[i].at) / (stops[i + 1].at - stops[i].at);
      return interpolateColor(stops[i].color, stops[i + 1].color, localT);
    }
  }
  return stops[stops.length - 1].color;
}

function RiskTreemapContent(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, topic, risk = 0, depth } = props;
  if (depth !== 1) return null;

  const color = getRiskColor(risk);
  const showText = width > 45 && height > 28;

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={1} rx={4} ry={4} />
      {showText && (
        <>
          <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.min(10, width / 8)} fontWeight="bold">
            {topic && topic.length > Math.floor(width / 7) ? topic.slice(0, Math.floor(width / 7)) + '…' : topic}
          </text>
          <text x={x + width / 2} y={y + height / 2 + 8} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontFamily="'Share Tech Mono', monospace">
            {risk.toFixed(1)}
          </text>
        </>
      )}
    </g>
  );
}

const RiskTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="bg-card dark:bg-[#1a1d28] border border-border dark:border-white/[0.1] rounded-lg px-3 py-2 text-xs shadow-xl" dir="rtl">
      <div className="font-bold text-foreground mb-1">{d.topic}</div>
      <div className="text-muted-foreground">סיכון: <span className="font-bold text-orange-400">{d.risk.toFixed(1)}</span></div>
      <div className="text-muted-foreground">ימים מאז: <span className="font-bold text-foreground">{d.daysSince}</span></div>
      <div className="text-muted-foreground">דיוק: <span className="font-bold text-foreground">{d.accuracy}%</span></div>
    </div>
  );
};

export default function ForgettingRiskTile({ risks }: Props) {
  const { data, startSession } = useApp();
  const hasHighRisk = risks.some(r => r.risk > 2.0);

  const handlePractice = (topic: string) => {
    const questions = data.filter(q => q[KEYS.TOPIC] === topic);
    if (questions.length > 0) startSession(questions, Math.min(questions.length, 15), 'practice');
  };

  const treemapData = useMemo(() => {
    return risks.map(r => ({
      name: r.topic,
      topic: r.topic,
      size: Math.max(r.daysSince, 1),
      risk: r.risk,
      daysSince: r.daysSince,
      accuracy: r.accuracy,
    }));
  }, [risks]);

  return (
    <AnimatedStatsTile
      className={hasHighRisk ? 'animate-pulse-border' : ''}
      collapsed={
        <div className="p-5">
          <span className="text-sm text-muted-foreground font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> סיכון שכחה
          </span>
          <div className="mt-3 flex flex-col gap-2 w-full">
            {risks.length === 0 ? (
              <p className="text-xs text-muted-foreground/50">אין נושאים בסיכון כרגע</p>
            ) : (
              risks.slice(0, 4).map(r => (
                <div key={r.topic} className="flex items-center justify-between w-full rounded-lg px-3 py-2" style={{
                  backgroundColor: getRiskColor(r.risk) + '12',
                  borderRight: `3px solid ${getRiskColor(r.risk)}`,
                }}>
                  <span className="text-xs font-medium text-foreground truncate flex-1 text-right">
                    {r.topic}
                  </span>
                  <span className="text-xs font-black mr-3 shrink-0" style={{ color: getRiskColor(r.risk), fontFamily: "'Share Tech Mono', monospace" }}>
                    {r.risk.toFixed(1)}
                  </span>
                </div>
              ))
            )}
          </div>
          {treemapData.length > 0 && (
            <div className="mt-4" style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap data={treemapData} dataKey="size" nameKey="topic" content={<RiskTreemapContent />}>
                  <Tooltip content={<RiskTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-2">סיכון שכחה — מפת חום</h3>
          <p className="text-xs text-muted-foreground mb-4">גודל = ימים מהניסיון האחרון • צבע = ציון סיכון</p>
          {treemapData.length > 0 && (
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap data={treemapData} dataKey="size" nameKey="topic" content={<RiskTreemapContent />}>
                  <Tooltip content={<RiskTooltip />} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-2 mt-4 max-h-[40vh] overflow-y-auto">
            {risks.map(r => (
              <div key={r.topic} className="flex items-center justify-between bg-muted/30 rounded-lg px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">{r.topic}</div>
                  <div className="text-[10px] text-muted-foreground">{r.daysSince} ימים מאז • דיוק {r.accuracy}%</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-lg font-black" style={{ color: getRiskColor(r.risk), fontFamily: "'Share Tech Mono', monospace" }}>{r.risk.toFixed(1)}</span>
                  <button onClick={(e) => { e.stopPropagation(); handlePractice(r.topic); }} className="text-[10px] bg-orange-500/20 text-orange-400 px-3 py-1.5 rounded-lg hover:bg-orange-500/30 transition font-bold">
                    התחל תרגול
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      }
    />
  );
}
