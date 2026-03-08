/* Reusable Circular Progress Ring */

interface GaugeDialProps {
  value: number;
  max: number;
  color: string;
  label: string;
  pct: number;
  unit?: string;
}

export default function GaugeDial({ value, max, color, label, pct, unit }: GaugeDialProps) {
  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value, max) / max : 0;
  const offset = circumference - progress * circumference;

  const displayValue = unit ? `${value}${unit}` : `${value}`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" strokeWidth={strokeWidth} opacity={0.08}
          />
          {value > 0 && (
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={color} strokeWidth={strokeWidth}
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round"
              style={{
                transition: 'stroke-dashoffset 1s ease-out',
                filter: `drop-shadow(0 0 6px ${color}40)`,
              }}
            />
          )}
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className="text-xl font-black text-foreground"
            style={{ fontFamily: "'Share Tech Mono', monospace", color }}
          >
            {displayValue}
          </span>
        </div>
      </div>
      <div className="text-[10px] font-medium text-muted-foreground mt-1">{label}</div>
      <div className="text-[8px] text-muted-foreground">{pct}% מהמאגר</div>
    </div>
  );
}
