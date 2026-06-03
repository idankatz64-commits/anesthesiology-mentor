import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { QuizScore } from "@/lib/cohortDetail";

/**
 * Accuracy trend over time — the headline "is this resident improving?" view.
 * The trajectory matters more than any single snapshot, so this gets prime
 * placement and space in the personal file.
 */
export default function ResidentTrendChart({ quizzes }: { quizzes: QuizScore[] }) {
  const data = quizzes.map((q) => ({ label: q.date, score: q.score }));
  const first = data[0]?.score ?? 0;
  const last = data[data.length - 1]?.score ?? 0;
  const delta = last - first;
  const up = delta >= 0;

  return (
    <div className="glass-tile rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Accuracy Trend</h3>
          <p className="text-[11px] text-muted-foreground">Improvement over time — the signal that matters most</p>
        </div>
        <div
          className={`flex items-center gap-1 text-sm font-bold tabular-nums ${up ? "text-success" : "text-destructive"}`}
        >
          {up ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {delta >= 0 ? "+" : ""}
          {delta}%
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
              formatter={(v: number) => [`${v}%`, "Accuracy"]}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="url(#residentTrendFill)"
              dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
