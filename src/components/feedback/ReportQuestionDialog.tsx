import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FEEDBACK_TARGETS, FEEDBACK_TARGET_LABEL, feedbackErrorMessage, submitFeedback, validateFeedbackInput, type FeedbackTarget,
} from "@/lib/feedbackRepository";

export interface ReportQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The question currently on screen (KEYS.ID). null = no question selected; the dialog then refuses to send. */
  questionId: string | null;
  /** Current auth user id; null = signed out. */
  userId: string | null;
  /** Optional label shown next to the id (e.g. ref_id) so the resident sees what they are reporting on. */
  questionLabel?: string | null;
}

type Mode = "report" | "correction";
const FIELD = "w-full rounded-lg border border-input bg-background p-2 text-sm text-foreground";

// Resident-facing: a plain report (no replacement needed) or a structured
// correction (target + replacement + reference). Nothing here publishes; the
// server files the proposal and only the owner can approve it.
export default function ReportQuestionDialog({ open, onOpenChange, questionId, userId, questionLabel }: ReportQuestionDialogProps) {
  const [mode, setMode] = useState<Mode>("report");
  const [target, setTarget] = useState<FeedbackTarget>("explanation");
  const [issueText, setIssueText] = useState("");
  const [proposedText, setProposedText] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  // Generation of the (open, question, user) context. A submission captures it and applies its
  // outcome only if it is still current, so a slow Q1/user-1 answer can never show up on Q2/user-2.
  // The server may still file that earlier request; it just belongs to a context no longer on screen.
  const gen = useRef(0);

  useEffect(() => {
    gen.current += 1;
    if (!open) return;
    setMode("report"); setTarget("explanation"); setIssueText(""); setProposedText(""); setReference(""); setError(null); setSentId(null); setBusy(false);
    return () => { gen.current += 1; };
  }, [open, questionId, userId]);

  const blocked = !userId ? "יש להתחבר כדי לדווח." : !questionId ? "לא נבחרה שאלה. סגרו וחזרו מהמסך של השאלה." : null;
  const input = {
    kind: mode === "report" ? ("question_report" as const) : ("correction" as const), questionId, issueText,
    target: mode === "correction" ? target : null, proposedText: mode === "correction" ? proposedText : null, reference,
  };
  const canSend = !blocked && !busy && !sentId && validateFeedbackInput(input) === null;

  const send = async () => {
    if (!canSend) return;
    const g = gen.current;
    setBusy(true); setError(null);
    try {
      const r = await submitFeedback(input);
      if (g === gen.current) setSentId(r.id);
    } catch (e) {
      if (g === gen.current) setError(feedbackErrorMessage(e));
    } finally { if (g === gen.current) setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="text-right sm:max-w-lg" aria-busy={busy}>
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>דיווח על שאלה</DialogTitle>
          <DialogDescription>
            שאלה <span className="font-mono" dir="ltr">{questionLabel ?? questionId ?? "—"}</span>. הדיווח נשמר לבדיקה של עידן; שום דבר לא משתנה בשאלה עד לאישורו.
          </DialogDescription>
        </DialogHeader>

        {blocked && <p role="alert" className="text-sm text-destructive">{blocked}</p>}

        <fieldset className="space-y-2" disabled={!!blocked || busy || !!sentId}>
          <legend className="text-sm font-medium">מה תרצו לעשות?</legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1"><input type="radio" name="mode" value="report" checked={mode === "report"} onChange={() => setMode("report")} />דיווח על בעיה</label>
            <label className="flex items-center gap-1"><input type="radio" name="mode" value="correction" checked={mode === "correction"} onChange={() => setMode("correction")} />הצעת תיקון</label>
          </div>

          <label className="block space-y-1 text-sm">
            <span>{mode === "report" ? "מה הבעיה?" : "למה צריך תיקון?"}</span>
            <textarea className={FIELD} rows={3} value={issueText} onChange={(e) => setIssueText(e.target.value)} maxLength={4000} required />
          </label>

          {mode === "correction" && (
            <>
              <label className="block space-y-1 text-sm">
                <span>מה לתקן?</span>
                <select className={FIELD} value={target} onChange={(e) => setTarget(e.target.value as FeedbackTarget)}>
                  {FEEDBACK_TARGETS.map((t) => <option key={t} value={t}>{FEEDBACK_TARGET_LABEL[t]}</option>)}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                <span>{target === "correct" ? "התשובה הנכונה המוצעת (A/B/C/D)" : "הנוסח המוצע במקום הקיים"}</span>
                <textarea className={FIELD} rows={target === "correct" ? 1 : 5} value={proposedText} onChange={(e) => setProposedText(e.target.value)} maxLength={20000} required />
              </label>
            </>
          )}

          <label className="block space-y-1 text-sm">
            <span>מקור / הפניה{mode === "correction" ? " (חובה בתיקון: פרק ועמוד במילר)" : " (לא חובה)"}</span>
            <input className={FIELD} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={1000} required={mode === "correction"} />
          </label>
        </fieldset>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sentId && <p role="status" className="text-sm text-green-700 dark:text-green-400">הדיווח נשלח ונמצא בתור לבדיקה. תודה!</p>}

        <DialogFooter className="gap-2 sm:justify-start">
          {sentId ? (
            <button type="button" onClick={() => onOpenChange(false)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">סגירה</button>
          ) : (
            <>
              <button type="button" onClick={() => void send()} disabled={!canSend} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy ? "שולח…" : "שליחה"}
              </button>
              <button type="button" onClick={() => onOpenChange(false)} disabled={busy} className="rounded-lg border px-4 py-2 text-sm">ביטול</button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
