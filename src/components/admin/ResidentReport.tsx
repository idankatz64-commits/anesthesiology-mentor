import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Printer, Save, Sparkles } from "lucide-react";
import { isDemo, maskName } from "@/lib/demoMode";
import {
  fetchMemberChapters,
  fetchManagerNote,
  fetchRepetitionCurve,
  saveManagerNote,
  accuracyPct,
  weeklyRate,
  coveragePct,
  trendDelta,
  chapterWeaknesses,
  buildResidentSummary,
  type OverviewRow,
  type MemberChapterRow,
  type DailyRow,
  type RepetitionRow,
} from "@/lib/managerReport";
import KpiTile from "./manager/KpiTile";
import ActivityPanel from "./manager/ActivityPanel";
import RepetitionPanel from "./manager/RepetitionPanel";
import ChapterTable from "./manager/ChapterTable";
import { TONE, accTone } from "./manager/managerTokens";

interface ResidentReportProps {
  row: OverviewRow;
  bankSize: number;
  daily?: DailyRow[];
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
    weaknesses: "מומלץ לחזרה",
    weaknessRule: "לפי הכלל שנקבע: הצלחה בחשיפות ראשונות מתחת ל-70% על לפחות 20 שאלות בפרק",
    noWeakness: "אין פרקים מתחת לסף — כל הכבוד",
    notes: "הערות מנהל",
    notesHint: "נשמר במסד, נראה רק לאדמינים",
    notesDemo: "מצב דמו — שמירת הערות כבויה",
    save: "שמירה",
    print: "ייצוא PDF",
    langBtn: "English",
    year: "שנה",
    activity: "נפח התרגול של המתמחה",
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
    weaknesses: "Recommended review",
    weaknessRule: "Per the approved rule: first-exposure success below 70% on at least 20 questions in a chapter",
    noWeakness: "No chapters below threshold — well done",
    notes: "Manager notes",
    notesHint: "Stored in the database, visible to admins only",
    notesDemo: "Demo mode — note saving is off",
    save: "Save",
    print: "Export PDF",
    langBtn: "עברית",
    year: "Year",
    activity: "Practice volume",
  },
};

const container = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0, 0, 0.2, 1] as const } },
};

export default function ResidentReport({ row, bankSize, daily = [], onBack }: ResidentReportProps) {
  const [chapters, setChapters] = useState<MemberChapterRow[]>([]);
  const [repetition, setRepetition] = useState<RepetitionRow[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lang, setLang] = useState<Lang>("he");
  const t = T[lang];

  useEffect(() => {
    (async () => {
      try {
        // במצב דמו לא מושכים את הערת המנהל האמיתית — טקסט חופשי עלול לזהות את המתמחה
        const [ch, rep, n] = await Promise.all([
          fetchMemberChapters(row.user_id),
          fetchRepetitionCurve(row.user_id),
          isDemo() ? Promise.resolve("") : fetchManagerNote(row.user_id),
        ]);
        setChapters(ch);
        setRepetition(rep);
        setNote(n);
      } catch (e) {
        console.error("resident report load failed:", e);
        setFailed(true);
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

  // טעינה שנכשלה חייבת לעצור את המסך: דוח על מערך פרקים ריק מציג
  // "אין פרקים מתחת לסף — כל הכבוד", וזו קביעה חיובית על מתמחה שאיש לא בדק.
  if (failed)
    return (
      <div className="space-y-4" dir="rtl">
        <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRight className="w-4 h-4" />
          {t.back}
        </button>
        <div className="deep-tile rounded-2xl p-10 text-center">
          <p className="text-sm text-muted-foreground">
            טעינת הדוח נכשלה, ולכן הוא לא מוצג — דוח חלקי היה עלול להיקרא כאילו אין למתמחה חולשות. נסה שוב.
          </p>
        </div>
      </div>
    );

  if (loading)
    return (
      <div className="space-y-4" dir="rtl">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="deep-tile rounded-2xl h-24 animate-pulse" />
          ))}
        </div>
        <div className="deep-tile rounded-2xl h-72 animate-pulse" />
      </div>
    );

  return (
    <motion.div
      id="resident-report"
      className="space-y-4"
      dir={lang === "he" ? "rtl" : "ltr"}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      <style>{`
        @media print {
          aside, nav, .no-print { display: none !important; }
          main { padding: 0 !important; }
          html, body { background: #fff !important; }
          /* צבע בירושה ולא !important: טקסט רגיל יוצא שחור, אבל צבעי הדיוק
             (inline style) שורדים — אחרת הדוח המודפס מאבד את ההבחנה חזק/חלש */
          #resident-report { color: #111; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          #resident-report .text-muted-foreground { color: #555 !important; }
          #resident-report .deep-tile, #resident-report .glass-card {
            box-shadow: none !important; border: 1px solid #ddd !important; background: #fff !important;
          }
          #resident-report section, #resident-report .deep-tile { break-inside: avoid; page-break-inside: avoid; }
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

      <motion.header variants={item}>
        <h2 className="text-xl font-bold">
          {t.title} · {maskName(row.display_name)}
          {row.residency_year != null && (
            <span className="text-muted-foreground font-normal text-base">
              {" "}
              · {t.year} {row.residency_year}
            </span>
          )}
        </h2>
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
      </motion.header>

      <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile value={acc} label={t.accuracy} suffix="%" tone={accTone(acc)} />
        <KpiTile value={coveragePct(row.coverage, bankSize)} label={t.coverage} suffix="%" />
        <KpiTile value={weeklyRate(row.qs_last30)} label={t.weekly} />
        <KpiTile
          value={delta}
          label={t.trend}
          signed
          tone={delta !== null && delta < 0 ? TONE.low : TONE.good}
          suffix={lang === "he" ? " נק'" : " pts"}
        />
      </motion.div>

      <motion.section variants={item} className="deep-tile rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm">{t.summary}</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{t.summaryBadge}</span>
        </div>
        <p className="text-sm leading-relaxed">{summary}</p>
      </motion.section>

      <motion.div variants={item} className="grid lg:grid-cols-2 gap-4">
        <ActivityPanel rows={daily} lockedUserId={row.user_id} title={t.activity} />
        <RepetitionPanel rows={repetition} scope="resident" />
      </motion.div>

      <motion.section variants={item} className="deep-tile rounded-2xl p-5">
        <h3 className="font-bold text-sm mb-3">{t.weaknesses}</h3>
        {weaknesses.length > 0 ? (
          <div className="space-y-2">
            {weaknesses.map((w) => {
              const pct = accuracyPct(w.first_correct, w.first_seen);
              return (
                <div
                  key={w.chapter}
                  className="flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 border"
                  style={{ borderColor: `${accTone(pct)}44`, background: `${accTone(pct)}0f` }}
                >
                  <span dir="ltr" className="truncate">
                    Ch. {w.chapter} — {w.topic}
                  </span>
                  <span className="tabular-nums font-bold shrink-0" style={{ color: accTone(pct) }} dir="ltr">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t.noWeakness}</p>
        )}
        <p className="text-xs text-muted-foreground mt-2">{t.weaknessRule}</p>
      </motion.section>

      <motion.div variants={item}>
        <ChapterTable chapters={chapters} lang={lang} />
      </motion.div>

      <motion.section variants={item} className="deep-tile rounded-2xl p-5 no-print">
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
          placeholder={`${t.notes}…`}
        />
        <p className="text-xs text-muted-foreground mt-1">{isDemo() ? t.notesDemo : t.notesHint}</p>
      </motion.section>
    </motion.div>
  );
}
