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
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={strokeWidth} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <span className="absolute text-2xl font-black text-foreground">{value}%</span>
    </div>
  );
}

function getLabel(value: number) {
  if (value >= 70) return 'מוכן';
  if (value >= 50) return 'טוב';
  return 'מוכן חלקית';
}

export default function ERITile({ value }: ERITileProps) {
  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-5 flex flex-col items-center justify-center gap-2 min-h-[160px]">
      <ERIRing value={value} />
      <span className="text-xs text-muted-foreground font-medium">{getLabel(value)}</span>
      <span className="text-[10px] text-muted-foreground/60">מדד מוכנות למבחן</span>
    </div>
  );
}
