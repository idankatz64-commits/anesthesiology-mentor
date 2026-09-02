import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { maskName } from "@/lib/demoMode";
import {
  fetchOverview,
  fetchCohortChapters,
  fetchBankSize,
  fetchDailySeries,
  fetchRepetitionCurve,
  accuracyPct,
  weeklyRate,
  coveragePct,
  trendDelta,
  residentStatus,
  repetitionLift,
  type OverviewRow,
  type CohortChapterRow,
  type DailyRow,
  type RepetitionRow,
} from "@/lib/managerReport";
import ResidentReport from "./ResidentReport";
import KpiTile from "./manager/KpiTile";
import ActivityPanel from "./manager/ActivityPanel";
import RepetitionPanel from "./manager/RepetitionPanel";
import CohortShapePanel from "./manager/CohortShapePanel";
import ChapterGrid from "./manager/ChapterGrid";
import { MONO, STATUS_META, TONE, accTone, coverageTone, lastActiveLabel } from "./manager/managerTokens";

const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0, 0, 0.2, 1] as const } },
};

function TrendCell({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return <Minus className="w-3.5 h-3.5 text-muted-foreground inline" />;
  const up = delta > 0;
  return (
    <span className="inline-flex items-center gap-1 font-bold" style={{ color: up ? TONE.good : TONE.low }}>
      {up ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
      <span dir="ltr" style={MONO}>
        {up ? "+" : ""}
        {delta}
      </span>
    </span>
  );
}

/** שלד טעינה בצורת המסך הסופי — פחות קופצני מספינר במרכז */
function Skeleton() {
  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="deep-tile rounded-2xl h-24 animate-pulse" />
        ))}
      </div>
      <div className="deep-tile rounded-2xl h-72 animate-pulse" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="deep-tile rounded-2xl h-80 animate-pulse" />
        <div className="deep-tile rounded-2xl h-80 animate-pulse" />
      </div>
    </div>
  );
}

export default function ManagerDashboardTab() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [chapters, setChapters] = useState<CohortChapterRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [repetition, setRepetition] = useState<RepetitionRow[]>([]);
  const [bankSize, setBankSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<OverviewRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, b, d, rep] = await Promise.all([
          fetchOverview(),
          fetchCohortChapters(),
          fetchBankSize(),
          fetchDailySeries(400),
          fetchRepetitionCurve(null),
        ]);
        // הדוח מציג מתמחים בלבד — צוות (אדמין/עורכים) מסונן; מיון על עותק, בלי מוטציה
        const residents = o.filter((r) => !r.is_staff);
        setRows([...residents].sort((a, b2) => b2.answered_total - a.answered_total));
        setChapters(c);
        setBankSize(b);
        setDaily(d);
        setRepetition(rep);
      } catch (e) {
        console.error("manager dashboard load failed:", e);
        setFailed(true);
        toast.error("טעינת דשבורד המנהל נכשלה");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const now = useMemo(() => new Date(), []);

  const kpis = useMemo(() => {
    const seen = rows.reduce((s, r) => s + r.coverage, 0);
    const correct = rows.reduce((s, r) => s + r.current_correct, 0);
    const active = rows.filter((r) => r.qs_last30 > 0);
    const statuses = rows.map((r) => residentStatus(r, now));
    const weeklyAvg = active.length
      ? Math.round(active.reduce((s, r) => s + weeklyRate(r.qs_last30), 0) / active.length)
      : 0;
    const coverageAvg = rows.length
      ? Math.round(rows.reduce((s, r) => s + coveragePct(r.coverage, bankSize), 0) / rows.length)
      : 0;
    return {
      accuracy: accuracyPct(correct, seen),
      attention: statuses.filter((s) => s === "attention").length,
      inactive: statuses.filter((s) => s === "inactive").length,
      weeklyAvg,
      coverageAvg,
    };
  }, [rows, bankSize, now]);

  const lift = useMemo(() => repetitionLift(repetition), [repetition]);
  const people = useMemo(
    () => rows.map((r) => ({ user_id: r.user_id, display_name: maskName(r.display_name) })),
    [rows],
  );

  if (loading) return <Skeleton />;

  if (failed)
    return (
      <div className="deep-tile rounded-2xl p-10 text-center" dir="rtl">
        <p className="text-sm text-muted-foreground">
          טעינת הדשבורד נכשלה. רענן את הדף; אם זה חוזר, כנראה שההרשאה פגה.
        </p>
      </div>
    );

  if (selected)
    return <ResidentReport row={selected} bankSize={bankSize} daily={daily} onBack={() => setSelected(null)} />;

  return (
    <motion.div className="space-y-4" dir="rtl" variants={container} initial="hidden" animate="visible">
      <motion.div variants={item}>
        <h2 className="text-xl font-bold">דשבורד מנהל — סקירת מחזור</h2>
        <p className="text-sm text-muted-foreground">
          מדידה על המצב העדכני · הכשרה, לא הערכה — האיתותים כאן הם כלי ליווי
        </p>
      </motion.div>

      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile value={rows.length} label="מתמחים במערכת" />
        <KpiTile value={kpis.accuracy} label="דיוק המחזור" suffix="%" tone={accTone(kpis.accuracy)} hint="מצב עדכני" />
        <KpiTile
          value={lift.lift}
          label="מה החזרה מוסיפה"
          signed
          suffix=" נק'"
          tone={lift.lift !== null && lift.lift < 0 ? TONE.low : TONE.good}
          hint={lift.first !== null && lift.last !== null ? `${lift.first}% → ${lift.last}%` : undefined}
        />
        <KpiTile value={kpis.coverageAvg} label="כיסוי מאגר ממוצע" suffix="%" tone={coverageTone(kpis.coverageAvg)} />
        <KpiTile value={kpis.weeklyAvg} label="שאלות/שבוע (פעילים)" />
        <KpiTile
          value={kpis.attention}
          label="כדאי לשים לב"
          tone={kpis.attention > 0 ? TONE.watch : undefined}
          hint={kpis.inactive > 0 ? `+${kpis.inactive} לא פעילים` : undefined}
        />
      </motion.div>

      <motion.div variants={item}>
        <ActivityPanel rows={daily} people={people} />
      </motion.div>

      <motion.div variants={item} className="grid lg:grid-cols-2 gap-4">
        <CohortShapePanel rows={rows} bankSize={bankSize} />
        <RepetitionPanel rows={repetition} scope="cohort" />
      </motion.div>

      <motion.div variants={item}>
        <ChapterGrid rows={chapters} />
      </motion.div>

      <motion.section variants={item} className="deep-tile rounded-2xl overflow-x-auto">
        <div className="p-5 pb-2">
          <h3 className="text-base font-bold">המתמחים</h3>
          <p className="text-xs text-muted-foreground mt-1">
            לחיצה על שורה פותחת את הדוח האישי · מגמה = דיוק 30 הימים האחרונים מול 30 שקדמו
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-xs text-muted-foreground">
              <th className="p-3 font-medium">מתמחה</th>
              <th className="p-3 font-medium">שנה</th>
              <th className="p-3 font-medium">כיסוי</th>
              <th className="p-3 font-medium">דיוק</th>
              <th className="p-3 font-medium">מגמה</th>
              <th className="p-3 font-medium">שאלות/שבוע</th>
              <th className="p-3 font-medium">פעיל לאחרונה</th>
              <th className="p-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = STATUS_META[residentStatus(r, now)];
              const acc = accuracyPct(r.current_correct, r.coverage);
              const cov = coveragePct(r.coverage, bankSize);
              return (
                <tr
                  key={r.user_id}
                  onClick={() => setSelected(r)}
                  className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="p-3 font-semibold">{maskName(r.display_name)}</td>
                  <td className="p-3 tabular-nums text-muted-foreground" style={MONO} dir="ltr">
                    {r.residency_year ?? "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2" dir="ltr">
                      <div className="h-1.5 w-12 rounded-full bg-muted/60 overflow-hidden shrink-0">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${cov}%`, background: coverageTone(cov) }}
                        />
                      </div>
                      <span className="tabular-nums text-xs" style={MONO}>
                        {cov}%
                      </span>
                    </div>
                  </td>
                  <td className="p-3 tabular-nums font-bold" style={{ ...MONO, color: accTone(acc) }} dir="ltr">
                    {acc !== null ? `${acc}%` : "—"}
                  </td>
                  <td className="p-3">
                    <TrendCell delta={trendDelta(r)} />
                  </td>
                  <td className="p-3 tabular-nums" style={MONO} dir="ltr">
                    {weeklyRate(r.qs_last30)}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{lastActiveLabel(r.last_active)}</td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${status.cls}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </motion.section>
    </motion.div>
  );
}
