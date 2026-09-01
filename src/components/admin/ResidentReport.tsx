import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Loader2, Printer, Save, Sparkles } from "lucide-react";
import { isDemo, maskName } from "@/lib/demoMode";
import {
  fetchMemberChapters,
  fetchManagerNote,
  saveManagerNote,
  accuracyPct,
  weeklyRate,
  coveragePct,
  trendDelta,
  chapterWeaknesses,
  buildResidentSummary,
  type OverviewRow,
  type MemberChapterRow,
} from "@/lib/managerReport";

interface ResidentReportProps {
  row: OverviewRow;
  bankSize: number;
  onBack: () => void;
}

type Lang = "he" | "en";

const T: Record<Lang, Record<string, string>> = {
  he: {
    back: "חזרה לסקירה",
    title: "דוח ביצועים אישי",
    subtitle: "מסלול · הכשרה לשלב א' — הדוח שייך למתמחה; נדון בשיחת הליווי",
    accuracy: "דיוק (מצב עדכני)",
    coverage: "כיסוי מאגר",
    weekly: "שאלות/שבוע",
    trend: "מגמה 30 יום",
    summary: "סיכום אוטומטי",
    summaryBadge: "מבוסס חוקים · לא AI",
    chapters: "ביצועים לפי פרק (מילר)",
    chapter: "פרק",
    seen: "כוסו",
    current: "מצב עדכני",
    firstExposure: "חשיפה ראשונה",
    total: "מענים",
    weaknesses: "מומלץ לחזרה",
    weaknessRule: "לפי הכלל שנקבע: הצלחה בחשיפות ראשונות מתחת ל-70% על לפחות 20 שאלות בפרק",
    noWeakness: "אין פרקים מתחת לסף — כל הכבוד 💪",
    notes: "הערות מנהל",
    notesHint: "נשמר במסד, נראה רק לאדמינים",
    notesDemo: "מצב דמו — שמירת הערות כבויה",
    save: "שמירה",
    print: "ייצוא PDF",
    langBtn: "English",
    year: "שנה",
  },
  en: {
    back: "Back to overview",
    title: "Resident Performance Report",
    subtitle: "Maslul · Stage-1 training — this report belongs to the resident; discussed in the coaching talk",
    accuracy: "Accuracy (current state)",
    coverage: "Bank coverage",
    weekly: "Questions/week",
    trend: "30-day trend",
    summary: "Auto summary",
    summaryBadge: "Rule-based · not AI",
    chapters: "Performance by chapter (Miller)",
    chapter: "Chapter",
    seen: "Covered",
    current: "Current state",
    firstExposure: "First exposure",
    total: "Answers",
    weaknesses: "Recommended review",
    weaknessRule: "Per the approved rule: first-exposure success below 70% on at least 20 questions in a chapter",
    noWeakness: "No chapters below threshold — well done 💪",
    notes: "Manager notes",
    notesHint: "Stored in the database, visible to admins only",
    notesDemo: "Demo mode — note saving is off",
    save: "Save",
    print: "Export PDF",
    langBtn: "עברית",
    year: "Year",
  },
};

export default function ResidentReport({ row, bankSize, onBack }: ResidentReportProps) {
  const [chapters, setChapters] = useState<MemberChapterRow[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState<Lang>("he");
  const t = T[lang];

  useEffect(() => {
    (async () => {
      try {
        // במצב דמו לא מושכים את הערת המנהל האמיתית — טקסט חופשי עלול לזהות את המתמחה
        const [ch, n] = await Promise.all([
          fetchMemberChapters(row.user_id),
          isDemo() ? Promise.resolve("") : fetchManagerNote(row.user_id),
        ]);
        const sorted = [...ch].sort((a, b) => {
          const av = a.seen ? a.current_correct / a.seen : Infinity;
          const bv = b.seen ? b.current_correct / b.seen : Infinity;
          return av - bv;
        });
        setChapters(sorted);
        setNote(n);
      } catch (e) {
        console.error("resident report load failed:", e);
        toast.error("טעינת דוח המתמחה נכשלה");
      } finally {
        setLoading(false);
      }
    })();
  }, [row.user_id]);

  const acc = accuracyPct(row.current_correct, row.coverage);
  const delta = trendDelta(row);
  const weaknesses = useMemo(() => chapterWeaknesses(chapters), [chapters]);
  const summary = useMemo(() => buildResidentSummary(row, chapters, bankSize, lang), [row, chapters, bankSize, lang]);

  const handleSaveNote = async () => {
    if (isDemo()) return;
    setSaving(true);
    try {
      await saveManagerNote(row.user_id, note);
      toast.success("ההערה נשמרה");
    } catch (e) {
      console.error("saveManagerNote failed:", e);
      toast.error("שמירת ההערה נכשלה");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );

  return (
    <div id="resident-report" className="space-y-5" dir={lang === "he" ? "rtl" : "ltr"}>
      <style>{`
        @media print {
          aside, nav, .no-print { display: none !important; }
          main { padding: 0 !important; }
          html, body { background: #fff !important; }
          #resident-report, #resident-report * { color: #111 !important; }
          #resident-report .text-green-600 { color: #15803d !important; }
          #resident-report .text-amber-600 { color: #b45309 !important; }
          .glass-card { box-shadow: none !important; border: 1px solid #ddd !important; background: #fff !important; }
        }
      `}</style>

      <div className="flex items-center justify-between flex-wrap gap-2 no-print">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="w-4 h-4" />
          {t.back}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "he" ? "en" : "he")}
            className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted"
          >
            {t.langBtn}
          </button>
          <button
            onClick={() => window.print()}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            {t.print}
          </button>
        </div>
      </div>

      <header>
        <h2 className="text-xl font-bold">
          {t.title} · {maskName(row.display_name)}
          {row.residency_year != null ? (
            <span className="text-muted-foreground font-normal text-base">
              {" "}
              · {t.year} {row.residency_year}
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-2xl p-4 text-center border border-border">
          <div className="text-2xl font-extrabold text-green-600">{acc !== null ? `${acc}%` : "—"}</div>
          <div className="text-xs text-muted-foreground mt-1">{t.accuracy}</div>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center border border-border">
          <div className="text-2xl font-extrabold">{coveragePct(row.coverage, bankSize)}%</div>
          <div className="text-xs text-muted-foreground mt-1">{t.coverage}</div>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center border border-border">
          <div className="text-2xl font-extrabold">{weeklyRate(row.qs_last30)}</div>
          <div className="text-xs text-muted-foreground mt-1">{t.weekly}</div>
        </div>
        <div className="glass-card rounded-2xl p-4 text-center border border-border">
          <div
            dir="ltr"
            className={`text-2xl font-extrabold tabular-nums ${delta !== null && delta < 0 ? "text-red-500" : "text-green-600"}`}
          >
            {delta !== null ? (delta > 0 ? `+${delta}` : delta) : "—"}
          </div>
          <div className="text-xs text-muted-foreground mt-1">{t.trend}</div>
        </div>
      </div>

      <section className="glass-card rounded-2xl p-5 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">{t.summary}</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t.summaryBadge}</span>
        </div>
        <p className="text-sm leading-relaxed">{summary}</p>
      </section>

      <section className="glass-card rounded-2xl p-5 border border-border">
        <h3 className="font-bold text-sm mb-3">{t.weaknesses}</h3>
        {weaknesses.length > 0 ? (
          <div className="space-y-2">
            {weaknesses.map((w) => (
              <div
                key={w.chapter}
                className="flex items-center justify-between text-sm border border-amber-500/30 bg-amber-500/5 rounded-lg px-3 py-2"
              >
                <span dir="ltr">
                  Ch. {w.chapter} — {w.topic}
                </span>
                <span className="tabular-nums font-bold text-amber-600" dir="ltr">{accuracyPct(w.first_correct, w.first_seen)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.noWeakness}</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">{t.weaknessRule}</p>
      </section>

      <section className="glass-card rounded-2xl border border-border overflow-x-auto">
        <div className="p-4 pb-0">
          <h3 className="font-bold text-sm">{t.chapters}</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr
              className={`border-b border-border text-xs text-muted-foreground ${lang === "he" ? "text-right" : "text-left"}`}
            >
              <th className="p-3">{t.chapter}</th>
              <th className="p-3">{t.seen}</th>
              <th className="p-3">{t.total}</th>
              <th className="p-3">{t.firstExposure}</th>
              <th className="p-3">{t.current}</th>
            </tr>
          </thead>
          <tbody>
            {chapters.map((c) => {
              const cur = accuracyPct(c.current_correct, c.seen);
              const first = accuracyPct(c.first_correct, c.first_seen);
              return (
                <tr key={c.chapter} className="border-b border-border/40">
                  <td className="p-3" dir="ltr">
                    Ch. {c.chapter} — {c.topic}
                  </td>
                  <td className="p-3 tabular-nums" dir="ltr">{c.seen}</td>
                  <td className="p-3 tabular-nums" dir="ltr">{c.answered_total}</td>
                  <td className="p-3 tabular-nums text-muted-foreground" dir="ltr">{first !== null ? `${first}%` : "—"}</td>
                  <td
                    className={`p-3 tabular-nums font-bold ${cur !== null && cur >= 70 ? "text-green-600" : "text-amber-600"}`}
                  >
                    {cur !== null ? `${cur}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="glass-card rounded-2xl p-5 border border-border no-print">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-sm">{t.notes}</h3>
          <button
            onClick={handleSaveNote}
            disabled={saving || isDemo()}
            className="px-3 py-1.5 rounded-lg border border-border text-sm flex items-center gap-2 hover:bg-muted disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {t.save}
          </button>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isDemo()}
          rows={3}
          className="w-full border border-input bg-background text-foreground rounded-lg p-2 text-sm"
          placeholder={t.notes + "…"}
        />
        <p className="text-xs text-muted-foreground mt-1">{isDemo() ? t.notesDemo : t.notesHint}</p>
      </section>
    </div>
  );
}
