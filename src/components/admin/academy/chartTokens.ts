// Visual tokens shared by the academy charts. Kept out of the component file so
// Vite's fast refresh keeps working there.
/** Mid-luminance only: every colour clears 3:1 on BOTH the white and the dark card. */
export const SERIES_COLORS = [
  "#EA580C",
  "#3B82F6",
  "#059669",
  "#DB2777",
  "#7C3AED",
  "#A16207",
  "#0891B2",
  "#DC2626",
  "#65A30D",
  "#E11D48",
  "#0284C7",
  "#9333EA",
  "#64748B",
];

export const colorFor = (i: number) => SERIES_COLORS[i % SERIES_COLORS.length];

export const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
export const gridStroke = "hsl(var(--border))";
export const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  padding: "8px 12px",
  direction: "rtl" as const,
};

/** Long quiz titles blow out the axis; the full title still shows in the tooltip. */
export const truncate = (s: string, max = 14) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s;
