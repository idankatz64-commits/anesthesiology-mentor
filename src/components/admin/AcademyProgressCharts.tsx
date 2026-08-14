import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AttemptLike,
  QuestionResolver,
  QuizLike,
  cohortStrength,
  domainTrend,
  heatmap,
  personalTrend,
} from "@/lib/academyProgress";

interface MemberLike {
  id: string;
  label: string;
  userId: string | null;
}

interface Props {
  members: MemberLike[];
  quizzes: QuizLike[];
  attempts: AttemptLike[];
  resolve: QuestionResolver;
  selectedUserId: string | null;
}

// Distinct enough to tell 13 domain lines apart. Mid-luminance shades only:
// each clears 3:1 against BOTH the white light-theme card and the dark card.
const DOMAIN_COLORS = [
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

const axisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
  direction: "rtl" as const,
};

const Panel = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <section className="border rounded-xl p-3 space-y-2">
    <h3 className="font-semibold">{title}</h3>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    {children}
  </section>
);

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-muted-foreground py-6 text-center">{children}</p>
);

/** Red (0%) → green (100%). Neutral when there is no data.
 * Lightness is pinned at 28%: at 45% the yellow/green half of the range dropped
 * to ~2:1 against the white cell text (WCAG AA needs 4.5:1). At 28% the worst
 * point of the range (yellow, hue 60) sits at 4.8:1. */
const heatColor = (pct: number | null) =>
  pct === null ? "hsl(var(--muted))" : `hsl(${Math.round(pct * 1.2)} 65% 28%)`;

export default function AcademyProgressCharts({
  members,
  quizzes,
  attempts,
  resolve,
  selectedUserId,
}: Props) {
  const trend = useMemo(
    () =>
      selectedUserId ? personalTrend(quizzes, attempts, selectedUserId) : [],
    [quizzes, attempts, selectedUserId],
  );
  const byDomain = useMemo(
    () =>
      selectedUserId
        ? domainTrend(quizzes, attempts, selectedUserId, resolve)
        : { domains: [], points: [] },
    [quizzes, attempts, selectedUserId, resolve],
  );
  const matrix = useMemo(
    () => heatmap(members, attempts, resolve),
    [members, attempts, resolve],
  );
  const strength = useMemo(
    () => cohortStrength(attempts, resolve),
    [attempts, resolve],
  );

  const satQuizzes = trend.filter((p) => p.mine !== null).length;

  return (
    <div className="space-y-6" dir="rtl">
      <Panel
        title="קו מגמה אישי מול ממוצע המחזור"
        hint="ציון כולל בכל בוחן. הקו המקווקו = ממוצע כל מי שהגיש."
      >
        {!selectedUserId ? (
          <Empty>בחר מתמחה כדי לראות את המגמה שלו.</Empty>
        ) : satQuizzes === 0 ? (
          <Empty>המתמחה עדיין לא הגיש אף בוחן.</Empty>
        ) : satQuizzes === 1 ? (
          <Empty>יש הגשה אחת בלבד — מגמה תופיע מהבוחן השני.</Empty>
        ) : (
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trend}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="quiz"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  reversed
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="mine"
                  name="המתמחה"
                  stroke="#EA580C"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
                <Line
                  type="monotone"
                  dataKey="cohort"
                  name="ממוצע המחזור"
                  stroke="#2563EB"
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="מגמה לפי תחום קליני"
        hint="רק תחומים שהמתמחה נבחן בהם בפועל."
      >
        {!selectedUserId ? (
          <Empty>בחר מתמחה כדי לראות פילוח לאורך זמן.</Empty>
        ) : byDomain.domains.length === 0 ? (
          <Empty>אין עדיין נתונים לפילוח תחומים.</Empty>
        ) : (
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={byDomain.points}
                margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="quiz"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  reversed
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {byDomain.domains.map((domain, i) => (
                  <Line
                    key={domain}
                    type="monotone"
                    dataKey={domain}
                    name={domain}
                    stroke={DOMAIN_COLORS[i % DOMAIN_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>

      <Panel
        title="מפת חום — מתמחה × תחום"
        hint="אחוז הצלחה מצטבר בכל התחומים. אפור = טרם נבחן בתחום."
      >
        {matrix.domains.length === 0 ? (
          <Empty>אין עדיין הגשות במחזור.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="text-xs border-separate"
              style={{ borderSpacing: 2 }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="p-1 text-right font-medium sticky right-0 bg-background"
                  >
                    מתמחה
                  </th>
                  {matrix.domains.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      className="p-1 font-medium align-bottom"
                      title={d}
                    >
                      <div
                        className="whitespace-nowrap"
                        style={{
                          writingMode: "vertical-rl",
                          height: 150,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {d}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.id}>
                    <th
                      scope="row"
                      className="p-1 whitespace-nowrap text-right font-normal sticky right-0 bg-background"
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.domain}
                        title={`${row.label} · ${cell.domain}: ${cell.pct === null ? "אין נתונים" : `${cell.pct}% מתוך ${cell.answered} שאלות`}`}
                        className="text-center text-white font-medium rounded"
                        style={{
                          backgroundColor: heatColor(cell.pct),
                          minWidth: 34,
                          height: 26,
                        }}
                      >
                        {cell.pct === null ? "" : cell.pct}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title="חוזק המחזור לפי תחום"
        hint="החלש ביותר למעלה — נושא לישיבה."
      >
        {strength.length === 0 ? (
          <Empty>אין עדיין הגשות במחזור.</Empty>
        ) : (
          <div style={{ height: Math.max(160, strength.length * 32 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={strength}
                layout="vertical"
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  // 0% must sit at the right-hand labels so bars grow leftward, like the reading direction
                  reversed
                />
                <YAxis
                  type="category"
                  dataKey="domain"
                  width={150}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  orientation="right"
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, _n, item) => [
                    `${value}% מתוך ${(item.payload as { answered: number }).answered} שאלות`,
                    "הצלחה",
                  ]}
                />
                <Bar dataKey="pct" name="הצלחה" radius={4} fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}
