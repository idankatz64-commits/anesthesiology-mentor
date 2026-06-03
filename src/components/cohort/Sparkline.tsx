interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
}

/**
 * Tiny inline trend line (pure SVG, no chart lib).
 * Stroke color reflects net direction: up = green, down = red, flat = grey.
 * Used in the cohort comparison table to make "trend" the prominent signal.
 */
export default function Sparkline({ points, width = 70, height = 24 }: SparklineProps) {
  if (!points || points.length < 2) return <span className="text-muted-foreground text-xs">—</span>;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const pad = 3;
  const coords = points.map((p, i) => {
    const x = i * stepX;
    const y = pad + (height - 2 * pad) * (1 - (p - min) / range);
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  const delta = points[points.length - 1] - points[0];
  const color = delta > 2 ? "hsl(142 71% 45%)" : delta < -2 ? "hsl(0 84% 60%)" : "hsl(215 16% 55%)";
  const [lx, ly] = coords[coords.length - 1];

  return (
    <svg width={width} height={height} className="overflow-visible shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={2.4} fill={color} />
    </svg>
  );
}
