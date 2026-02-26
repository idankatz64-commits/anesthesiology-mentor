/* Reusable Gauge Dial SVG — speedometer style */

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
  const radius = (size - strokeWidth) / 2 - 4;
  const startAngle = -180;
  const endAngle = 0;

  const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
    const rad = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  const arcPath = (start: number, end: number) => {
    const s = polarToCartesian(size / 2, size / 2 + 5, radius, start);
    const e = polarToCartesian(size / 2, size / 2 + 5, radius, end);
    const largeArc = Math.abs(end - start) > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
  };

  const range = endAngle - startAngle;
  const fillAngle = max > 0 ? startAngle + Math.min(value, max) / max * range : startAngle;
  const needleTip = polarToCartesian(size / 2, size / 2 + 5, radius - 12, fillAngle);

  const displayValue = unit ? `${value}${unit}` : `${value}`;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 15} viewBox={`0 0 ${size} ${size / 2 + 15}`}>
        <path d={arcPath(startAngle, endAngle)} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} strokeLinecap="round" />
        {value > 0 &&
        <path d={arcPath(startAngle, fillAngle)} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 4px ${color}40)` }} />
        }
        <line x1={size / 2} y1={size / 2 + 5} x2={needleTip.x} y2={needleTip.y} stroke={color} strokeWidth={2} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2 + 5} r={3} fill={color} />
      </svg>
      <div className="text-lg font-black -mt-1 text-[#47fa00] shadow-sm my-0" style={{ fontFamily: "'Share Tech Mono', monospace" }}>{displayValue}</div>
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="text-[8px] text-[#f9cf15]">{pct}% מהמאגר</div>
    </div>);

}