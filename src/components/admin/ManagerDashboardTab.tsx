import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { maskName } from "@/lib/demoMode";
import {
  fetchOverview,
  fetchCohortChapters,
  fetchBankSize,
  accuracyPct,
  weeklyRate,
  coveragePct,
  trendDelta,
  residentStatus,
  type OverviewRow,
  type CohortChapterRow,
  type ResidentStatusKind,
} from "@/lib/managerReport";
import ResidentReport from "./ResidentReport";

const STATUS_META: Record<ResidentStatusKind, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-green-500/10 text-green-600" },
  steady: { label: "יציב", cls: "bg-muted text-muted-foreground" },
  attention: { label: "כדאי לשים לב", cls: "bg-amber-500/10 text-amber-600" },
};

function Kpi({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4 text-center border border-border">
      <div className={`text-2xl font-extrabold ${tone ?? "text-foreground"}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function TrendCell({ delta }: { delta: number | null }) {
  if (delta === null) return <Minus className="w-4 h-4 text-muted-foreground inline" />;
  if (delta > 0)
    return (
      <span className="text-green-600 inline-flex items-center gap-1">
        <TrendingUp className="w-4 h-4" />
        <span dir="ltr">+{delta}</span>
      </span>
    );
  if (delta < 0)
    return (
      <span className="text-red-500 inline-flex items-center gap-1">
        <TrendingDown className="w-4 h-4" />
        <span dir="ltr">{delta}</span>
      </span>
    );
  return <Minus className="w-4 h-4 text-muted-foreground inline" />;
}

function lastActiveLabel(iso: string | null): string {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "היום";
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

function ChapterBar({ topic, pct: p }: { topic: string; pct: number }) {
  const tone = p >= 75 ? "bg-green-500" : p >= 60 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex-1 truncate" dir="ltr">
        {topic}
      </span>
      <div className="w-28 h-2 rounded-full bg-muted overflow-hidden shrink-0">
        <div className={`h-full ${tone}`} style={{ width: `${p}%` }} />
      </div>
      <span className="tabular-nums font-bold w-10 text-left shrink-0" dir="ltr">{p}%</span>
    </div>
  );
}

export default function ManagerDashboardTab() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [chapters, setChapters] = useState<CohortChapterRow[]>([]);
  const [bankSize, setBankSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OverviewRow | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [o, c, b] = await Promise.all([fetchOverview(), fetchCohortChapters(), fetchBankSize()]);
        // הדוח מציג מתמחים בלבד — צוות (אדמין/עורכים) מסונן; מיון על עותק, בלי מוטציה
        const residents = o.filter((r) => !r.is_staff);
        setRows([...residents].sort((a, b2) => b2.answered_total - a.answered_total));
        setChapters(c);
        setBankSize(b);
      } catch (e) {
        console.error("manager dashboard load failed:", e);
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
    const attention = rows.filter((r) => residentStatus(r, now) === "attention").length;
    const weeklyAvg = active.length ? Math.round(active.reduce((s, r) => s + weeklyRate(r.qs_last30), 0) / active.length) : 0;
    const coverageAvg = rows.length
      ? Math.round(rows.reduce((s, r) => s + coveragePct(r.coverage, bankSize), 0) / rows.length)
      : 0;
    return { accuracy: accuracyPct(correct, seen), active: active.length, attention, weeklyAvg, coverageAvg };
  }, [rows, bankSize, now]);

  const chapterSplit = useMemo(() => {
    const rated = chapters
      .filter((c) => c.seen >= 100)
      .map((c) => ({ ...c, pct: Math.round((100 * c.current_correct) / c.seen) }))
      .sort((a, b) => a.pct - b.pct);
    const weak = rated.slice(0, 3);
    const strong = rated
      .slice(-3)
      .reverse()
      .filter((c) => !weak.some((w) => w.chapter === c.chapter));
    return { weak, strong };
  }, [chapters]);

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );

  if (selected) return <ResidentReport row={selected} bankSize={bankSize} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold">דשבורד מנהל — סקירת מחזור</h2>
          <p className="text-sm text-muted-foreground">
            מדידה על המצב העדכני · הכשרה, לא הערכה — האיתותים כאן הם כלי ליווי
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Kpi value={String(rows.length)} label="מתמחים פעילים במערכת" />
        <Kpi value={kpis.accuracy !== null ? `${kpis.accuracy}%` : "—"} label="דיוק קבוצתי" tone="text-green-600" />
        <Kpi value={`${kpis.coverageAvg}%`} label="כיסוי מאגר ממוצע" />
        <Kpi value={String(kpis.weeklyAvg)} label="שאלות/שבוע (פעילים)" />
        <Kpi value={String(kpis.attention)} label="כדאי לשים לב" tone="text-amber-600" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <section className="glass-card rounded-2xl p-5 border border-border space-y-3">
          <h3 className="font-bold text-sm">נקודות תורפה משותפות</h3>
          {chapterSplit.weak.map((c) => (
            <ChapterBar key={c.chapter} topic={c.topic} pct={c.pct} />
          ))}
          {chapterSplit.weak.length === 0 && (
            <p className="text-sm text-muted-foreground">אין עדיין מספיק נתונים פר פרק</p>
          )}
        </section>
        <section className="glass-card rounded-2xl p-5 border border-border space-y-3">
          <h3 className="font-bold text-sm">חוזקות המחזור</h3>
          {chapterSplit.strong.map((c) => (
            <ChapterBar key={c.chapter} topic={c.topic} pct={c.pct} />
          ))}
          {chapterSplit.strong.length === 0 && (
            <p className="text-sm text-muted-foreground">אין עדיין מספיק נתונים פר פרק</p>
          )}
        </section>
      </div>

      <section className="glass-card rounded-2xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-right text-xs text-muted-foreground">
              <th className="p-3">מתמחה</th>
              <th className="p-3">שנה</th>
              <th className="p-3">כיסוי</th>
              <th className="p-3">דיוק</th>
              <th className="p-3">מגמה</th>
              <th className="p-3">שאלות/שבוע</th>
              <th className="p-3">פעיל לאחרונה</th>
              <th className="p-3">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const status = STATUS_META[residentStatus(r, now)];
              const acc = accuracyPct(r.current_correct, r.coverage);
              return (
                <tr
                  key={r.user_id}
                  onClick={() => setSelected(r)}
                  className="border-b border-border/50 hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <td className="p-3 font-semibold">{maskName(r.display_name)}</td>
                  <td className="p-3 tabular-nums" dir="ltr">{r.residency_year ?? "—"}</td>
                  <td className="p-3 tabular-nums" dir="ltr">{coveragePct(r.coverage, bankSize)}%</td>
                  <td
                    className={`p-3 tabular-nums font-bold ${acc !== null && acc >= 75 ? "text-green-600" : "text-amber-600"}`}
                  >
                    {acc !== null ? `${acc}%` : "—"}
                  </td>
                  <td className="p-3 tabular-nums" dir="ltr">
                    <TrendCell delta={trendDelta(r)} />
                  </td>
                  <td className="p-3 tabular-nums" dir="ltr">{weeklyRate(r.qs_last30)}</td>
                  <td className="p-3 text-muted-foreground">{lastActiveLabel(r.last_active)}</td>
                  <td className="p-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${status.cls}`}>
                      {status.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted-foreground">
        לחיצה על שורה פותחת את דוח המתמחה · מגמה = דיוק 30 הימים האחרונים מול 30 שקדמו
      </p>
    </div>
  );
}
