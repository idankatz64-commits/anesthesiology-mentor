import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDomain } from "@/lib/academyDomains";
import {
  AttemptLike,
  COHORT_KEY,
  QuestionResolver,
  QuizLike,
  YEAR_KEY,
  cohortStrength,
  comparisonTrend,
  domainTrend,
  heatmap,
} from "@/lib/academyProgress";
import { Chip, Chips, Empty, Panel } from "./academy/chartKit";
import {
  axisTick,
  colorFor,
  gridStroke,
  tooltipStyle,
  truncate,
} from "./academy/chartTokens";

interface MemberLike {
  id: string;
  label: string;
  userId: string | null;
  residencyYear: number | null;
}

interface Props {
  members: MemberLike[];
  quizzes: QuizLike[];
  attempts: AttemptLike[];
  resolve: QuestionResolver;
  selectedUserId: string | null;
}

const COHORT_COLOR = "#64748B";
const YEAR_COLOR = "#0891B2";
const HOW_MANY_WEAK_DOMAINS_SHOWN_BY_DEFAULT = 3;

/** Red (0%) → green (100%). Lightness 28% keeps the white cell text above 4.8:1 across the whole range. */
const heatColor = (pct: number | null) =>
  pct === null ? "hsl(var(--muted))" : `hsl(${Math.round(pct * 1.2)} 65% 28%)`;

const toggle = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export default function AcademyProgressCharts({
  members,
  quizzes,
  attempts,
  resolve,
  selectedUserId,
}: Props) {
  const registered = useMemo(() => members.filter((m) => m.userId), [members]);
  const selectedMember = useMemo(
    () => registered.find((m) => m.userId === selectedUserId) ?? null,
    [registered, selectedUserId],
  );

  // Comparison: the picked resident is always on; the admin adds peers on top.
  const [comparedIds, setComparedIds] = useState<Set<string>>(new Set());
  const [showCohort, setShowCohort] = useState(true);
  const [showYear, setShowYear] = useState(true);
  const [openDomains, setOpenDomains] = useState<Set<string> | null>(null);

  const yearPeerIds = useMemo(() => {
    const year = selectedMember?.residencyYear;
    if (!year || !showYear) return null;
    return registered
      .filter((m) => m.residencyYear === year)
      .map((m) => m.userId!);
  }, [selectedMember, registered, showYear]);

  const compared = useMemo(
    () =>
      registered
        .filter(
          (m) => m.userId === selectedUserId || comparedIds.has(m.userId!),
        )
        .map((m) => ({ userId: m.userId!, label: m.label })),
    [registered, comparedIds, selectedUserId],
  );

  const trend = useMemo(
    () =>
      selectedUserId
        ? comparisonTrend(quizzes, attempts, compared, yearPeerIds)
        : { series: [], points: [] },
    [quizzes, attempts, compared, yearPeerIds, selectedUserId],
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

  // Default to the resident's weakest domains rather than all 12 at once.
  const weakestFirst = useMemo(() => {
    const last = byDomain.points[byDomain.points.length - 1] ?? {};
    return [...byDomain.domains].sort(
      (a, b) => Number(last[a] ?? 101) - Number(last[b] ?? 101),
    );
  }, [byDomain]);
  const activeDomains =
    openDomains ??
    new Set(weakestFirst.slice(0, HOW_MANY_WEAK_DOMAINS_SHOWN_BY_DEFAULT));

  const trendSeriesColor = (key: string, i: number) =>
    key === COHORT_KEY
      ? COHORT_COLOR
      : key === YEAR_KEY
        ? YEAR_COLOR
        : colorFor(i);

  const peerChips: Chip[] = registered
    .filter((m) => m.userId !== selectedUserId)
    .map((m, i) => ({
      key: m.userId!,
      label: m.label,
      color: colorFor(i + 1),
    }));

  const pointsHaveData = trend.points.filter((p) =>
    compared.some((c) => p[c.userId] !== null),
  ).length;

  return (
    <div className="space-y-6" dir="rtl">
      <Panel
        title="מגמה והשוואה"
        hint="ציון כולל בכל בוחן. המתמחה הנבחר תמיד מוצג — הוסף מתמחים להשוואה, או כבה את קווי הממוצע."
      >
        {!selectedUserId ? (
          <Empty>בחר מתמחה למעלה כדי לראות את המגמה שלו.</Empty>
        ) : (
          <>
            <Chips
              chips={[
                { key: COHORT_KEY, label: "ממוצע המחזור", color: COHORT_COLOR },
                ...(selectedMember?.residencyYear
                  ? [
                      {
                        key: YEAR_KEY,
                        label: `ממוצע שנה ${selectedMember.residencyYear}`,
                        color: YEAR_COLOR,
                      },
                    ]
                  : []),
                ...peerChips,
              ]}
              active={
                new Set([
                  ...(showCohort ? [COHORT_KEY] : []),
                  ...(showYear && selectedMember?.residencyYear
                    ? [YEAR_KEY]
                    : []),
                  ...comparedIds,
                ])
              }
              onToggle={(key) => {
                if (key === COHORT_KEY) setShowCohort((v) => !v);
                else if (key === YEAR_KEY) setShowYear((v) => !v);
                else setComparedIds((s) => toggle(s, key));
              }}
            />
            {pointsHaveData === 0 ? (
              <Empty>המתמחה עדיין לא הגיש אף בוחן.</Empty>
            ) : pointsHaveData === 1 ? (
              <Empty>יש הגשה אחת בלבד — קו מגמה יופיע מהבוחן השני.</Empty>
            ) : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={trend.points}
                    margin={{ top: 5, right: 8, left: -18, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="quiz"
                      tick={axisTick}
                      tickFormatter={(v: string) => truncate(v)}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      height={36}
                      reversed
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    {trend.series
                      .filter((s) => (s.key === COHORT_KEY ? showCohort : true))
                      .map((s, i) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={trendSeriesColor(s.key, i)}
                          strokeWidth={
                            s.key === COHORT_KEY || s.key === YEAR_KEY ? 2 : 2.5
                          }
                          strokeDasharray={
                            s.key === COHORT_KEY || s.key === YEAR_KEY
                              ? "6 3"
                              : undefined
                          }
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="מגמה לפי תחום קליני"
        hint="לחץ על תחום כדי להדליק או לכבות את הקו שלו. כברירת מחדל דלוקים שלושת התחומים החלשים ביותר."
      >
        {!selectedUserId ? (
          <Empty>בחר מתמחה למעלה כדי לראות פילוח לאורך זמן.</Empty>
        ) : byDomain.domains.length === 0 ? (
          <Empty>אין עדיין נתונים לפילוח תחומים.</Empty>
        ) : (
          <>
            <Chips
              chips={weakestFirst.map((d, i) => ({
                key: d,
                label: shortDomain(d),
                color: colorFor(i),
              }))}
              active={activeDomains}
              onToggle={(key) => setOpenDomains(toggle(activeDomains, key))}
            />
            {activeDomains.size === 0 ? (
              <Empty>כל התחומים כבויים — לחץ על תחום כדי להציג אותו.</Empty>
            ) : (
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={byDomain.points}
                    margin={{ top: 5, right: 8, left: -18, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={gridStroke}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="quiz"
                      tick={axisTick}
                      tickFormatter={(v: string) => truncate(v)}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                      height={36}
                      reversed
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      tick={axisTick}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    {weakestFirst
                      .filter((d) => activeDomains.has(d))
                      .map((domain) => (
                        <Line
                          key={domain}
                          type="monotone"
                          dataKey={domain}
                          name={domain}
                          stroke={colorFor(weakestFirst.indexOf(domain))}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="מפת חום — מתמחה × תחום"
        hint="אחוז הצלחה מצטבר. אפור = המתמחה טרם נבחן בתחום הזה."
      >
        {matrix.domains.length === 0 ? (
          <Empty>אין עדיין הגשות במחזור.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table
              className="text-xs border-separate"
              style={{ borderSpacing: 3 }}
            >
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="p-2 text-right font-semibold sticky right-0 bg-background"
                  >
                    מתמחה
                  </th>
                  {matrix.domains.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      className="p-2 font-medium whitespace-nowrap"
                      title={d}
                    >
                      {shortDomain(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.id}>
                    <th
                      scope="row"
                      className="p-2 whitespace-nowrap text-right font-normal sticky right-0 bg-background"
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell) => (
                      <td
                        key={cell.domain}
                        title={`${row.label} · ${cell.domain}: ${cell.pct === null ? "אין נתונים" : `${cell.pct}% מתוך ${cell.answered} שאלות`}`}
                        className="text-center text-white font-semibold rounded-md"
                        style={{
                          backgroundColor: heatColor(cell.pct),
                          minWidth: 46,
                          height: 34,
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
        hint="החלש ביותר למעלה — נושא לישיבה. ריחוף מציג את מספר השאלות."
      >
        {strength.length === 0 ? (
          <Empty>אין עדיין הגשות במחזור.</Empty>
        ) : (
          // ltr: recharts anchors a right-side axis at "start", which under RTL flows the
          // labels leftward into the plot, where the bars then paint over them.
          <div
            dir="ltr"
            style={{ height: Math.max(180, strength.length * 38 + 30) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={strength}
                layout="vertical"
                margin={{ top: 5, right: 4, left: 4, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStroke}
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  reversed
                />
                <YAxis
                  type="category"
                  dataKey="domain"
                  tickFormatter={shortDomain}
                  width={104}
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  orientation="right"
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                  formatter={(value: number, _n, item) => [
                    `${value}% מתוך ${(item.payload as { answered: number }).answered} שאלות`,
                    "הצלחה",
                  ]}
                />
                <Bar
                  dataKey="pct"
                  name="הצלחה"
                  radius={4}
                  fill="#3B82F6"
                  barSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}
