import { useEffect, useState } from "react";
import { Archive, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import ResultsView from "@/components/views/ResultsView";
import { attemptErrorMessage, listArchive, readAttempt, repeatAvailableAt, type ArchiveEntry } from "@/lib/attemptsRepository";
import { sessionFromAttempt } from "@/lib/attemptSession";
import { formatActiveDuration } from "@/lib/exportPdf";
import type { FeedbackTiming, SessionState } from "@/lib/types";

// Milestone 2 archive: submitted attempts grouped by Israel calendar quarter.
// Reviewing is read-only and never starts the cooldown; repeating asks the
// server, which enforces the 7 elapsed days from the latest submission.
// ponytail: entitlement (how far back a user may review) is a later milestone; today every own attempt is listed.

const israelDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "");
const modeLabel = (entry: ArchiveEntry) => (entry.mode === "practice" ? "תרגול" : "בוחן") + (entry.feedbackTiming === "immediate" ? " • משוב מיידי" : " • משוב בסוף");
const scoreLabel = (entry: ArchiveEntry) => {
  const denominator = entry.mode === "practice" ? entry.scoredCount ?? 0 : entry.totalCount;
  return `${entry.correctCount ?? 0}/${denominator}`;
};

export default function ArchiveView() {
  const { startRepeat, openAttempt } = useApp();
  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [timing, setTiming] = useState<Record<string, FeedbackTiming>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<SessionState | null>(null);
  // NOT_ENTITLED is a standing state of the account, not a passing failure: keep it on the entry instead of a toast.
  const [notice, setNotice] = useState<Record<string, string>>({});
  const fail = (entry: ArchiveEntry, e: unknown) => {
    const message = attemptErrorMessage(e);
    if (e instanceof Error && e.message === "NOT_ENTITLED") setNotice((n) => ({ ...n, [entry.attemptId]: message }));
    else toast.error(message);
  };

  const load = () => {
    setLoadError(null);
    listArchive().then(setEntries).catch((e) => setLoadError(attemptErrorMessage(e)));
  };
  useEffect(load, []);

  const openReview = async (entry: ArchiveEntry) => {
    setBusy(entry.attemptId);
    try { setReview(sessionFromAttempt(await readAttempt(entry.attemptId))); }
    catch (e) { fail(entry, e); }
    finally { setBusy(null); }
  };

  // An attempt left open on the server (lost response, another device) is resumable here without a draft.
  const resume = async (entry: ArchiveEntry) => {
    setBusy(entry.attemptId);
    try { if (!(await openAttempt(entry.attemptId))) { toast.error("המפגש הזה כבר לא פתוח."); load(); } }
    catch (e) { toast.error(attemptErrorMessage(e)); }
    finally { setBusy(null); }
  };

  const repeat = async (entry: ArchiveEntry) => {
    setBusy(entry.attemptId);
    try { await startRepeat(entry.rootId, timing[entry.rootId] ?? entry.feedbackTiming); }
    catch (e) { fail(entry, e); }
    finally { setBusy(null); }
  };

  if (review) return <ResultsView archive={{ session: review, onBack: () => setReview(null) }} />;

  const groupOf = (e: ArchiveEntry) => (e.status === "in_progress" ? "מפגשים פתוחים" : `רבעון ${e.quarter ?? "ללא רבעון"}`);
  const quarters = Array.from(new Set((entries ?? []).map(groupOf)));
  const now = Date.now();

  return (
    <div className="max-w-4xl mx-auto p-4 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Archive className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold">ארכיון מפגשים</h2>
      </div>
      <p className="text-sm text-muted-foreground">כל תרגול או בוחן שהוגש נשמר כאן לפי רבעון. עיון אינו משנה דבר; חזרה על אותו מבחן אפשרית אחרי 7 ימים מההגשה האחרונה שלו.</p>

      {loadError && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          {loadError}
          <button type="button" onClick={load} className="mr-3 underline font-bold">נסו שוב</button>
        </div>
      )}
      {!entries && !loadError && <p className="text-sm text-muted-foreground">טוען...</p>}
      {entries && entries.length === 0 && <p className="text-sm text-muted-foreground">עדיין אין מפגשים שהוגשו.</p>}

      {quarters.map((quarter) => (
        <section key={quarter} aria-label={quarter} className="space-y-3">
          <h3 className="text-lg font-bold">{quarter}</h3>
          {(entries ?? []).filter((e) => groupOf(e) === quarter).map((entry) => {
            if (entry.status === "in_progress") return (
              <div key={entry.attemptId} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{modeLabel(entry)}</p>
                  <p className="text-sm text-muted-foreground">מפגש פתוח שלא הוגש • {entry.totalCount} שאלות</p>
                </div>
                <button type="button" disabled={busy === entry.attemptId} onClick={() => resume(entry)} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-bold disabled:opacity-50">
                  המשך מפגש
                </button>
              </div>
            );
            const availableAt = repeatAvailableAt(entry);
            const canRepeat = availableAt.getTime() <= now;
            const chosen = timing[entry.rootId] ?? entry.feedbackTiming;
            return (
              <div key={entry.attemptId} className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-bold">{modeLabel(entry)}</p>
                  <p className="text-sm text-muted-foreground">הוגש {israelDate(entry.submittedAt)} • {scoreLabel(entry)} נכונות{entry.totalActiveMs != null && ` • ${formatActiveDuration(entry.totalActiveMs)}`}</p>
                  {!canRepeat && <p className="text-xs text-muted-foreground">חזרה זמינה מ־{israelDate(availableAt.toISOString())}</p>}
                  {notice[entry.attemptId] && <p role="note" className="text-xs text-amber-700 dark:text-amber-400 mt-1">{notice[entry.attemptId]}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy === entry.attemptId} onClick={() => openReview(entry)} className="h-10 px-4 rounded-lg border border-border font-bold flex items-center gap-2">
                    <Eye className="w-4 h-4" /> עיון
                  </button>
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    משוב בחזרה
                    <select aria-label={`משוב בחזרה על ${modeLabel(entry)} מ־${israelDate(entry.submittedAt)}`} value={chosen} onChange={(e) => setTiming((t) => ({ ...t, [entry.rootId]: e.target.value as FeedbackTiming }))} className="rounded-md border border-border bg-background p-1">
                      <option value="immediate">מיידי</option>
                      <option value="end">בסוף</option>
                    </select>
                  </label>
                  <button type="button" disabled={!canRepeat || busy === entry.attemptId} onClick={() => repeat(entry)} className="h-10 px-4 rounded-lg bg-primary text-primary-foreground font-bold flex items-center gap-2 disabled:opacity-50">
                    <RotateCcw className="w-4 h-4" /> חזרה על המפגש
                  </button>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
