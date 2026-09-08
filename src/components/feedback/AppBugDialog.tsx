import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { feedbackErrorMessage, submitFeedback } from "@/lib/feedbackRepository";

export interface AppBugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current auth user id; null = signed out. */
  userId: string | null;
  /** Where the bug happened (e.g. the current view name); sent as page_context. */
  pageContext?: string | null;
}

// Resident-facing: an app problem unrelated to a specific question.
export default function AppBugDialog({ open, onOpenChange, userId, pageContext }: AppBugDialogProps) {
  const [issueText, setIssueText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Generation of the (open, user, page) context; see ReportQuestionDialog. A submission applies its
  // outcome only if its context is still the one on screen; close/reopen, sign-out or a page change drop it.
  const gen = useRef(0);

  useEffect(() => {
    gen.current += 1;
    if (!open) return;
    setIssueText(""); setError(null); setSent(false); setBusy(false);
    return () => { gen.current += 1; };
  }, [open, userId, pageContext]);

  const canSend = !!userId && !busy && !sent && issueText.trim().length > 0;
  const send = async () => {
    if (!canSend) return;
    const g = gen.current;
    setBusy(true); setError(null);
    try {
      await submitFeedback({ kind: "app_bug", questionId: null, issueText, pageContext: pageContext ?? null });
      if (g === gen.current) setSent(true);
    } catch (e) {
      if (g === gen.current) setError(feedbackErrorMessage(e));
    } finally { if (g === gen.current) setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="text-right sm:max-w-lg" aria-busy={busy}>
        <DialogHeader className="text-right sm:text-right">
          <DialogTitle>דיווח על תקלה באפליקציה</DialogTitle>
          <DialogDescription>מה קרה, איפה, ומה ציפיתם שיקרה. אין צורך בפרטים טכניים.</DialogDescription>
        </DialogHeader>
        {!userId && <p role="alert" className="text-sm text-destructive">יש להתחבר כדי לדווח.</p>}
        <label className="block space-y-1 text-sm">
          <span>תיאור התקלה</span>
          <textarea className="w-full rounded-lg border border-input bg-background p-2 text-sm text-foreground" rows={5} value={issueText}
            onChange={(e) => setIssueText(e.target.value)} maxLength={4000} disabled={!userId || busy || sent} required />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {sent && <p role="status" className="text-sm text-green-700 dark:text-green-400">הדיווח נשלח. תודה!</p>}
        <DialogFooter className="gap-2 sm:justify-start">
          {sent ? (
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
