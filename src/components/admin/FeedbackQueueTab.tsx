import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import DOMPurify from "dompurify";
import { explanationSections } from "@/lib/explanationSections";
import {
  FEEDBACK_KIND_LABEL, FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, FEEDBACK_TARGET_LABEL, approveFeedback, feedbackErrorMessage,
  fetchAuthorCandidates, fetchFeedbackQueue, fetchFeedbackReview, fetchMyFeedbackRole, resolveFeedback, setExplanationAuthor,
  type AuthorCandidate, type FeedbackQueueItem, type FeedbackReview, type FeedbackStatus,
} from "@/lib/feedbackRepository";

const BTN = "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50";
const FIELD = "w-full rounded-lg border border-input bg-background p-2 text-sm text-foreground";
const shortId = (id: string) => id.slice(0, 8);
const when = (iso: string) => new Date(iso).toLocaleString("he-IL");
const notOwner = (e: unknown) => e instanceof Error && e.message === "NOT_OWNER";

export interface FeedbackQueueTabProps {
  /** Current auth user id from AppContext; null = signed out. Any change remounts the whole tab. */
  userId: string | null;
}

type PanelProps = { onNotOwner: () => void };

function ReviewContent({ text }: { text: string | null }) {
  return <div className="rich-content whitespace-pre-wrap break-words [&_img]:max-w-full [&_img]:h-auto [&_table]:block [&_table]:overflow-x-auto">
    {explanationSections(text ?? "(ריק)").map((part, i) => <div key={i}>
      {part.title && <h5 className="font-semibold">{part.title}</h5>}
      {/<[a-z][\s\S]*>/i.test(part.content)
        ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(part.content, {
          ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'i', 'em', 'u', 'sub', 'sup', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'blockquote', 'code', 'pre', 'h3', 'h4', 'a', 'img', 'hr', 'span', 'div'],
          ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'colspan', 'rowspan'],
        }) }} />
        : part.content}
    </div>)}
  </div>;
}

// Owner-only review panel: the whole live question next to the proposal, because
// approval is bound to a hash of all of it. Approve is disabled while the base is
// stale; the server re-checks the hash anyway.
function ReviewPanel({ id, onDone, onNotOwner }: PanelProps & { id: string; onDone: (id: string) => void }) {
  const [review, setReview] = useState<FeedbackReview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // Bumped when the reviewed id changes or the panel unmounts: an answer to an older
  // load or action is dropped instead of being painted over the current review.
  const gen = useRef(0);

  const load = useCallback(async () => {
    const g = gen.current;
    try {
      const r = await fetchFeedbackReview(id);
      if (g === gen.current) setReview(r);
    } catch (e) {
      if (g !== gen.current) return;
      if (notOwner(e)) onNotOwner(); else setError(feedbackErrorMessage(e));
    }
  }, [id, onNotOwner]);
  useEffect(() => {
    gen.current += 1; setReview(null); setError(null); setNote("");
    void load();
    return () => { gen.current += 1; };
  }, [load]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    const g = gen.current;
    setBusy(true); setError(null);
    try {
      await fn();
      toast.success(done); // the server did act, whatever is on screen now
      onDone(id);
    } catch (e) {
      if (g !== gen.current) return;
      if (notOwner(e)) { onNotOwner(); return; }
      await load(); // refresh the base so a stale conflict is visible
      if (g === gen.current) setError(feedbackErrorMessage(e));
    } finally { if (g === gen.current) setBusy(false); }
  };

  if (!review) return error ? <p role="alert" className="text-sm text-destructive">{error}</p> : <p role="status" className="text-sm text-muted-foreground">טוען את תוכן הבדיקה…</p>;
  const isCorrection = review.kind === "correction";
  const canApprove = isCorrection && review.status === "pending" && !review.stale && !!review.currentHash && !busy;
  const options = [["A", review.optionA], ["B", review.optionB], ["C", review.optionC], ["D", review.optionD]] as const;
  return (
    <section aria-label="בדיקת דיווח" className="space-y-3 rounded-xl border bg-muted/30 p-4">
      <h4 className="font-semibold">{FEEDBACK_KIND_LABEL[review.kind]}{review.target ? ` · ${FEEDBACK_TARGET_LABEL[review.target]}` : ""}</h4>
      {review.questionId && <p className="font-semibold break-words">שאלה {review.questionRefId ?? "ללא מספר מקור"} · מזהה מאגר: {review.questionId}</p>}
      {review.questionExists && (
        <div className="space-y-1 rounded-lg border bg-background p-2 text-sm" aria-label="השאלה כפי שהיא כרגע">
          <div><span className="text-muted-foreground">השאלה: </span><ReviewContent text={review.questionText} /></div>
          <ol className="space-y-0.5">
            {options.map(([k, text]) => (
              <li key={k} className={k === review.currentKey ? "font-semibold" : ""}><span className="font-mono" dir="ltr">{k}.</span><ReviewContent text={text} />{k === review.currentKey ? " ✓" : ""}</li>
            ))}
          </ol>
          <p><span className="text-muted-foreground">תשובה נכונה כרגע: </span><span className="font-mono" dir="ltr">{review.currentKey ?? "(ריק)"}</span></p>
          <div><span className="text-muted-foreground">ההסבר כרגע: </span><ReviewContent text={review.explanationText} /></div>
          {review.questionMediaType === "image" && review.questionMediaLink && /^(https?:\/\/|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(review.questionMediaLink) && (
            <img src={review.questionMediaLink} alt="מדיה של השאלה" className="max-h-96 max-w-full object-contain" />
          )}
          {/* provenance/media are part of the approval hash too, so they are on screen */}
          <p className="text-xs text-muted-foreground" aria-label="הקשר השאלה">
            {[["מזהה", review.questionRefId], ["מקור", review.questionSource], ["נושא", review.questionTopic], ["פרק", review.questionChapter], ["מילר", review.questionMiller],
              ["שנה", review.questionYear], ["סוג", review.questionKind], ["מדיה", review.questionMediaType], ["קישור מדיה", review.questionMediaLink]]
              .map(([k, v]) => `${k}: ${v ?? "—"}`).join(" · ")}
          </p>
        </div>
      )}
      {review.questionId && !review.questionExists && <p role="alert" className="text-sm text-destructive">השאלה נמחקה מהמאגר.</p>}
      <p className="whitespace-pre-wrap text-sm"><span className="text-muted-foreground">הסיבה: </span>{review.issueText}</p>
      {review.reference && <p className="text-sm"><span className="text-muted-foreground">מקור: </span>{review.reference}</p>}
      {isCorrection && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0 rounded-lg border bg-background p-2"><div className="text-xs text-muted-foreground">הגרסה החיה כרגע</div><ReviewContent text={review.currentText} /></div>
          <div className="min-w-0 rounded-lg border border-green-600/50 bg-background p-2"><div className="text-xs text-muted-foreground">הנוסח המוצע (מה שיפורסם)</div><ReviewContent text={review.proposedText} /></div>
        </div>
      )}
      {review.stale && <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">הבסיס השתנה מאז שההצעה נכתבה. אי אפשר לאשר; אפשר לדחות ולבקש הצעה חדשה.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {review.status === "pending" ? (
        <>
          <label className="block space-y-1 text-sm"><span>הערה (לא חובה)</span><input className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} /></label>
          <div className="flex flex-wrap gap-2">
            {isCorrection && (
              <button type="button" disabled={!canApprove} onClick={() => void act(() => approveFeedback(review.id, review.currentHash!, note), "התיקון אושר ופורסם")} className={`${BTN} bg-green-600 text-white`}>
                אישור ופרסום הגרסה הזו
              </button>
            )}
            <button type="button" disabled={busy} onClick={() => void act(() => resolveFeedback(review.id, "handled", note), "סומן כטופל")} className={`${BTN} bg-primary text-primary-foreground`}>טופל</button>
            <button type="button" disabled={busy} onClick={() => void act(() => resolveFeedback(review.id, "rejected", note), "הדיווח נדחה")} className={`${BTN} border text-destructive`}>דחייה</button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">סטטוס: {FEEDBACK_STATUS_LABEL[review.status]}{review.reviewNote ? ` · ${review.reviewNote}` : ""}</p>
      )}
    </section>
  );
}

// Owner-only resident picker: approved users by name/email with their current
// grant state. Identifiers stay internal; the server refuses unapproved targets.
function AuthorsPanel({ onNotOwner }: PanelProps) {
  const [candidates, setCandidates] = useState<AuthorCandidate[] | null>(null);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const gen = useRef(0); // mount/identity generation (bumped on unmount; see ReviewPanel)
  const req = useRef(0); // search sequence: only the newest search may touch the list, the error or the loading flag

  const load = useCallback(async (term: string) => {
    const g = gen.current; const r = ++req.current;
    const current = () => g === gen.current && r === req.current;
    setError(null); setLoading(true);
    try {
      const rows = await fetchAuthorCandidates(term);
      if (current()) setCandidates(rows);
    } catch (e) {
      if (!current()) return;
      if (notOwner(e)) onNotOwner(); else { setError(feedbackErrorMessage(e)); setCandidates([]); }
    } finally { if (current()) setLoading(false); }
  }, [onNotOwner]);
  useEffect(() => { gen.current += 1; void load(""); return () => { gen.current += 1; }; }, [load]);

  const set = async (c: AuthorCandidate, enabled: boolean) => {
    const g = gen.current;
    setBusy(c.userId); setError(null);
    try {
      await setExplanationAuthor(c.userId, enabled, note);
      // identity/mount check BEFORE any follow-up: a late completion must not name this candidate on another user's screen
      if (g !== gen.current) return;
      toast.success(enabled ? `הרשאת הכתיבה הוענקה ל-${c.name ?? c.email}` : `הרשאת הכתיבה של ${c.name ?? c.email} בוטלה`);
      setNote("");
      await load(search);
    } catch (e) {
      if (g !== gen.current) return;
      if (notOwner(e)) onNotOwner(); else setError(feedbackErrorMessage(e));
    } finally { if (g === gen.current) setBusy(null); }
  };

  return (
    <section aria-label="הרשאות כתיבת הסברים" className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">הרשאות כתיבת הסברים</h3>
      <p className="text-sm text-muted-foreground">מי שמקבל הרשאה יכול להציע הסבר לשאלה שאין לה הסבר. גם אז שום דבר לא מתפרסם בלי האישור שלך. ההרשאה נפרדת ממנהל/עורך ומגישה לשאלות ארצי. ברשימה מופיעים רק משתמשים מאושרים.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void load(search); }}>
        <label className="block flex-1 space-y-1 text-sm"><span>חיפוש לפי שם או אימייל</span><input className={FIELD} value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} /></label>
        <label className="block flex-1 space-y-1 text-sm"><span>הערה לשינוי הבא</span><input className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
        <button type="submit" disabled={candidates === null} className={`${BTN} border`}>חיפוש</button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && candidates !== null && <p role="status" className="text-sm text-muted-foreground">מחפש…</p>}
      {candidates === null ? <p role="status" className="text-sm text-muted-foreground">טוען משתמשים…</p> : (
        <ul className="divide-y text-sm">
          {candidates.map((c) => (
            <li key={c.userId} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{c.name ?? c.email}</span>
                {c.name && <span className="block truncate text-xs text-muted-foreground" dir="ltr">{c.email}</span>}
                {c.note && <span className="block text-xs text-muted-foreground">{c.note}</span>}
              </span>
              <button type="button" role="switch" aria-checked={c.author} aria-label={`הרשאת כתיבה עבור ${c.name ?? c.email}`} disabled={busy === c.userId}
                onClick={() => void set(c, !c.author)} className={`rounded-md border px-2 py-1 text-xs ${c.author ? "bg-green-600 text-white border-green-700" : "bg-muted text-muted-foreground"}`}>
                {c.author ? "פעילה" : "ללא הרשאה"}
              </button>
            </li>
          ))}
          {candidates.length === 0 && <li className="py-2 text-muted-foreground">לא נמצאו משתמשים מאושרים.</li>}
        </ul>
      )}
    </section>
  );
}

// Everything below is keyed by userId (see the default export): a sign-out or a user
// swap unmounts items, review and picker at once, so nothing of the previous person
// survives and its in-flight answers land on nothing. Within one identity, each fetch
// is tied to the tab/review it was started for, and a NOT_OWNER answer to any call
// (revocation mid-session) collapses the tab back to the refusal view.
function Queue({ userId }: FeedbackQueueTabProps) {
  const [owner, setOwner] = useState<boolean | null>(userId ? null : false);
  const [status, setStatus] = useState<FeedbackStatus>("pending");
  const [items, setItems] = useState<FeedbackQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // bump = refetch the current tab
  const deny = useCallback(() => setOwner(false), []);
  const reload = () => setTick((t) => t + 1);
  const onDone = useCallback((id: string) => { setSelected((s) => (s === id ? null : s)); setTick((t) => t + 1); }, []);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchMyFeedbackRole().then((r) => { if (live) setOwner(r.owner); }).catch((e) => { if (live) { setOwner(false); setError(feedbackErrorMessage(e)); } });
    return () => { live = false; };
  }, [userId]);

  useEffect(() => {
    if (!owner) return;
    let live = true; // false once the tab, identity or refresh generation moved on: a slower old answer must not replace the active tab's items
    setLoading(true); setError(null);
    fetchFeedbackQueue(status)
      .then((rows) => { if (live) setItems(rows); })
      .catch((e) => { if (!live) return; if (notOwner(e)) setOwner(false); else setError(feedbackErrorMessage(e)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [owner, status, tick]);

  if (owner === null) return <p role="status" className="p-4 text-sm text-muted-foreground" dir="rtl">בודק הרשאות…</p>;
  if (!owner) return <p role="alert" className="rounded-xl border p-4 text-sm text-muted-foreground" dir="rtl">תור הדיווחים ואישור התיקונים שמורים לעידן בלבד. {error ?? ""}</p>;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">תור דיווחים ותיקונים</h3>
          <div role="tablist" aria-label="סטטוס" className="flex gap-1">
            {FEEDBACK_STATUSES.map((s) => (
              <button key={s} type="button" role="tab" aria-selected={status === s} onClick={() => { setStatus(s); setSelected(null); }}
                className={`rounded-md px-2 py-1 text-xs ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{FEEDBACK_STATUS_LABEL[s]}</button>
            ))}
          </div>
          <button type="button" onClick={reload} disabled={loading} className={`${BTN} border`}>רענון</button>
        </div>
        {loading && <p role="status" className="text-sm text-muted-foreground">טוען…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-muted/50 text-right"><th className="p-2">סוג</th><th className="p-2">שאלה</th><th className="p-2">מדווח</th><th className="p-2">תאריך</th><th className="p-2">תקציר</th><th className="p-2"></th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={`border-b ${selected === i.id ? "bg-muted/40" : ""}`}>
                <td className="p-2">{FEEDBACK_KIND_LABEL[i.kind]}{i.target ? ` · ${FEEDBACK_TARGET_LABEL[i.target]}` : ""}{i.stale && <span className="mr-1 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-200">בסיס השתנה</span>}</td>
                <td className="p-2 font-mono" dir="ltr">{i.questionRefId ?? i.questionId ?? "—"}</td>
                <td className="p-2 font-mono" dir="ltr">{shortId(i.submittedBy)}</td>
                <td className="p-2 whitespace-nowrap">{when(i.createdAt)}</td>
                <td className="max-w-xs truncate p-2">{i.issueText}</td>
                <td className="p-2"><button type="button" onClick={() => setSelected(selected === i.id ? null : i.id)} className={`${BTN} border`}>{selected === i.id ? "סגירה" : "בדיקה"}</button></td>
              </tr>
            ))}
            {!loading && items.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">אין דיווחים בסטטוס הזה.</td></tr>}
          </tbody>
        </table>
        {selected && <ReviewPanel key={selected} id={selected} onDone={onDone} onNotOwner={deny} />}
      </div>
      <AuthorsPanel onNotOwner={deny} />
    </div>
  );
}

export default function FeedbackQueueTab({ userId }: FeedbackQueueTabProps) {
  return <Queue key={userId ?? ""} userId={userId} />;
}
