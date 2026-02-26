import StatsTile from './StatsTile';
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer,
} from 'recharts';

interface ERITileProps {
  value: number;
  accuracy: number;
  coverage: number;
  criticalAvg: number;
  consistency: number;
}

function ERIRing({ value, size = 80 }: { value: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 70 ? '#22C55E' : value >= 50 ? '#EAB308' : '#EF4444';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <span className="absolute text-2xl font-black text-white">{value}%</span>
    </div>
  );
}

function getLabel(value: number) {
  if (value >= 70) return 'מוכן';
  if (value >= 50) return 'טוב';
  return 'מוכן חלקית';
}

export default function ERITile({ value, accuracy, coverage, criticalAvg, consistency }: ERITileProps) {
  const radarData = [
    { subject: 'דיוק (25%)', val: accuracy, fullMark: 100 },
    { subject: 'כיסוי (25%)', val: coverage, fullMark: 100 },
    { subject: 'נושאים קריטיים (30%)', val: criticalAvg, fullMark: 100 },
    { subject: 'עקביות (20%)', val: consistency, fullMark: 100 },
  ];

  return (
    <StatsTile
      collapsed={
        <div className="p-5 flex flex-col items-center justify-center gap-2 min-h-[160px]">
          <ERIRing value={value} />
          <span className="text-xs text-muted-foreground font-medium">{getLabel(value)}</span>
          <span className="text-[10px] text-muted-foreground/60">מדד מוכנות למבחן</span>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-white mb-6">מדד מוכנות למבחן (ERI)</h3>
          <div className="flex flex-col md:flex-row items-center gap-8">
            <ERIRing value={value} size={140} />
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
              { label: 'עקביות', val: consistency, weight: '20%' },
            ].map(item => (
              <div key={item.label} className="bg-white/5 rounded-lg p-3 text-center">
                <div className="text-xl font-bold text-white">{item.val}%</div>
                <div className="text-[10px] text-muted-foreground">{item.label} ({item.weight})</div>
              </div>
            ))}
          </div>
        </div>
      }
    />
  );
}
