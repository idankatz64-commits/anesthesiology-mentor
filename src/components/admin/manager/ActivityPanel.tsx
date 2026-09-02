import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Panel, Empty } from "@/components/admin/academy/chartKit";
import { axisTick, gridStroke, tooltipStyle } from "@/components/admin/academy/chartTokens";
import { seriesForRange, type DailyRow, type RangeKey } from "@/lib/managerReport";
import { TONE, shortDay } from "./managerTokens";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 7, label: "7 ימים" },
  { key: 30, label: "30 יום" },
  { key: 90, label: "90 יום" },
  { key: "all", label: "כל הזמן" },
];

interface Props {
  rows: DailyRow[];
  /** רשימת המתמחים לבחירה; null = כל המחזור */
  people?: { user_id: string; display_name: string }[];
  /** כשמוצג בתוך דוח אישי — נעול על מתמחה אחד, בלי בורר */
  lockedUserId?: string;
  title?: string;
}

/**
 * נפח התרגול על ציר זמן. **מדד אחד על הציר** (מענים ליום); הדיוק של אותו יום
 * מופיע ב-tooltip ולא כציר שני — שני סולמות על אותו גרף הם הטעות הקלאסית
 * שהופכת אותו לבלתי-קריא.
 */
export default function ActivityPanel({ rows, people, lockedUserId, title }: Props) {
  const [range, setRange] = useState<RangeKey>(30);
  const [userId, setUserId] = useState<string | null>(lockedUserId ?? null);
  const now = useMemo(() => new Date(), []);
  const effectiveUser = lockedUserId ?? userId;

  const series = useMemo(() => seriesForRange(rows, range, effectiveUser, now), [rows, range, effectiveUser, now]);

  const totals = useMemo(() => {
    const answered = series.reduce((s, p) => s + p.answered, 0);
    const activeDays = series.filter((p) => p.answered > 0).length;
    return { answered, activeDays };
  }, [series]);

  // ציר תאריכים צפוף מתפורר; בטווחים ארוכים מדלגים על תוויות
  const tickGap = series.length > 60 ? 13 : series.length > 30 ? 6 : series.length > 14 ? 2 : 0;

  return (
    <Panel
      title={title ?? "נפח תרגול לאורך זמן"}
      hint={`${totals.answered.toLocaleString("he-IL")} מענים · ${totals.activeDays} ימים פעילים בטווח. הדיוק היומי מופיע בהצבעה על עמודה.`}
    >
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={String(r.key)}
              type="button"
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`text-xs rounded-full px-3 py-1.5 border transition-colors ${
                range === r.key
                  ? "bg-primary/15 border-primary/40 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {!lockedUserId && people && people.length > 0 && (
          <select
            value={userId ?? ""}
            onChange={(e) => setUserId(e.target.value || null)}
            className="text-xs rounded-full px-3 py-1.5 border border-border bg-background text-foreground me-auto"
          >
            <option value="">כל המחזור</option>
            {people.map((p) => (
              <option key={p.user_id} value={p.user_id}>
                {p.display_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {series.length === 0 || totals.answered === 0 ? (
        <Empty>אין פעילות מתועדת בטווח הזה.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke={gridStroke} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={axisTick}
              interval={tickGap}
              tickLine={false}
              axisLine={false}
              reversed
            />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted) / 0.35)" }}
              contentStyle={tooltipStyle}
              labelFormatter={(d: string) => shortDay(d)}
              formatter={(v: number, _n, item) => {
                const acc = (item?.payload as { accuracy: number | null })?.accuracy;
                return [`${v} מענים${acc !== null && acc !== undefined ? ` · דיוק ${acc}%` : ""}`, ""];
              }}
            />
            <Bar dataKey="answered" radius={[4, 4, 0, 0]} fill={TONE.good} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      )}

    </Panel>
  );
}
