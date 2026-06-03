import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { CohortResident } from "@/data/cohortMockData";
import { getResidentTrendSeries, type TrendRange } from "@/lib/cohortDetail";

const RANGES: { key: TrendRange; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "year", label: "Year" },
  { key: "all", label: "All" },
];

/**
 * Accuracy trend over time — the headline "is this resident improving?" view.
 * Range is selectable (week / month / year / all); month is the default.
 * The trajectory matters more than any single snapshot, so this gets prime
 * placement and space in the personal file.
 */
export default function ResidentTrendChart({ resident }: { resident: CohortResident }) {
  const [range, setRange] = useState<TrendRange>("month");
  const data = getResidentTrendSeries(resident, range);
  const first = data[0]?.score ?? 0;
  const last = data[data.length - 1]?.score ?? 0;
  const delta = last - first;
  const up = delta >= 0;

  return (
    <div className="glass-tile rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-foreground">Accuracy Trend</h3>
          <p className="text-[11px] text-muted-foreground">Improvement over time — the signal that matters most</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 text-sm font-bold tabular-nums ${up ? "text-success" : "text-destructive"}`}
          >
            {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {delta >= 0 ? "+" : ""}
            {delta}%
          </div>
          <div className="flex items-center rounded-lg border border-border bg-muted/20 p-0.5">
            {RANGES.map((rg) => (
              <button
                key={rg.key}
                onClick={() => setRange(rg.key)}
                className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                  range === rg.key
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {rg.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
            <defs>
              <linearGradient id="residentTrendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip
              cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeOpacity: 0.3 }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
              itemStyle={{ color: "hsl(var(--primary))" }}
              formatter={(v) => [`${v}%`, "Accuracy"]}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#residentTrendFill)"
              dot={{ r: 2.5, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
