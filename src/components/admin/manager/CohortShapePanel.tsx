import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Panel, Empty } from "@/components/admin/academy/chartKit";
import { axisTick, gridStroke, tooltipStyle } from "@/components/admin/academy/chartTokens";
import { maskName } from "@/lib/demoMode";
import { accuracyPct, coveragePct, type OverviewRow } from "@/lib/managerReport";
import { MONO, accTone } from "./managerTokens";

interface Props {
  rows: OverviewRow[];
  bankSize: number;
}

/**
 * צורת המחזור: כיסוי מול דיוק, נקודה לכל מתמחה.
 * נבחר בכוונה על פני עמודות ממוינות לפי דיוק — טבלה ממוינת היא **מדרג**,
 * וזה נוגד את עקרון "הכשרה לא הערכה" שנפסק. פיזור מראה את פרישת המחזור
 * בלי לסדר מתמחים מהטוב לרע.
 */
export default function CohortShapePanel({ rows, bankSize }: Props) {
  const points = useMemo(
    () =>
      rows
        .map((r) => ({
          id: r.user_id,
          name: maskName(r.display_name),
          coverage: coveragePct(r.coverage, bankSize),
          accuracy: accuracyPct(r.current_correct, r.coverage),
          answered: r.answered_total,
        }))
        .filter(
          (p): p is { id: string; name: string; coverage: number; accuracy: number; answered: number } =>
            p.accuracy !== null,
        ),
    [rows, bankSize],
  );

  const median = useMemo(() => {
    if (points.length === 0) return null;
    const sorted = [...points].map((p) => p.accuracy).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }, [points]);

  return (
    <Panel
      title="צורת המחזור"
      hint="נקודה לכל מתמחה: כמה מהמאגר כיסה (אופקי) מול הדיוק על המצב העדכני (אנכי). הקו = חציון הדיוק."
    >
      {points.length === 0 ? (
        <Empty>אין עדיין נתוני תרגול.</Empty>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid stroke={gridStroke} />
              <XAxis
                type="number"
                dataKey="coverage"
                name="כיסוי"
                unit="%"
                domain={[0, "dataMax + 6"]}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                reversed
              />
              <YAxis
                type="number"
                dataKey="accuracy"
                name="דיוק"
                unit="%"
                domain={[0, 100]}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <ZAxis type="number" dataKey="answered" range={[60, 320]} />
              {median !== null && (
                <ReferenceLine
                  y={median}
                  stroke="hsl(var(--muted-foreground))"
                  strokeDasharray="4 4"
                  label={{
                    value: `חציון ${median}%`,
                    position: "insideTopLeft",
                    fill: "hsl(var(--muted-foreground))",
                    fontSize: 11,
                  }}
                />
              )}
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={tooltipStyle}
                formatter={(v: number, name: string) => [`${v}%`, name]}
                labelFormatter={() => ""}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as (typeof points)[number];
                  return (
                    <div style={tooltipStyle}>
                      <div className="font-bold text-xs mb-1">{p.name}</div>
                      <div className="text-[11px]">
                        כיסוי {p.coverage}% · דיוק {p.accuracy}%
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {p.answered.toLocaleString("he-IL")} מענים
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter data={points} fillOpacity={0.85}>
                {points.map((p) => (
                  <Cell key={p.id} fill={accTone(p.accuracy)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed" style={MONO}>
            גודל הנקודה = סך המענים
          </p>
        </>
      )}
    </Panel>
  );
}
