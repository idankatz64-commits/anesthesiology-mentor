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

function getTreemapColor(score: number) {
  if (score > 75) return '#1A6B3C';
  if (score > 65) return '#A89000';
  if (score >= 50) return '#B8520A';
  return '#8B0000';
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
  const showText = width > 50 && height > 30;
  const showScore = width > 40 && height > 22;

  return (
    <g>
      <rect
        x={x} y={y} width={width} height={height}
        fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth={1}
        rx={4} ry={4}
        style={{ cursor: 'pointer' }}
      />
      {showText && (
        <text x={x + width / 2} y={y + height / 2 - (showScore ? 6 : 0)} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.min(11, width / 8)} fontWeight="bold">
          {name && name.length > Math.floor(width / 7) ? name.slice(0, Math.floor(width / 7)) + '…' : name}
        </text>
      )}
      {showScore && (
        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.7)" fontSize={9} fontFamily="'Share Tech Mono', monospace">
          {smartScore}%
        </text>
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
      .filter(t => t.totalInDb > 0 && t.topic !== 'N/A#')
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
          <div className="flex items-center gap-3 mt-3 justify-center">
            {[
              { label: '<50%', color: '#8B0000' },
              { label: '50-65%', color: '#B8520A' },
              { label: '65-75%', color: '#A89000' },
              { label: '>75%', color: '#1A6B3C' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          {unclassifiedBanner}
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-2">מפת ביצועים לפי נושא</h3>
          <p className="text-xs text-muted-foreground mb-4">לחץ על ריבוע כדי להתחיל תרגול בנושא</p>
          <div style={{ height: 450 }}>
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
          <div className="flex items-center gap-4 mt-4 justify-center">
            {[
              { label: '<50% — חלש', color: '#8B0000' },
              { label: '50-65% — בינוני', color: '#B8520A' },
              { label: '65-75% — טוב', color: '#A89000' },
              { label: '>75% — מצוין', color: '#1A6B3C' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
          {unclassifiedBanner}
        </div>
      }
    />
  );
}
