import { useState, type FormEvent } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { GraduationCap, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { completeMyOnboarding, residentErrorMessage, RESIDENCY_YEARS, type UnlinkedReason } from "@/lib/residentRepository";

// Shown after the approval gate to a resident whose roster link or onboarding
// is not complete. Self-reported fields only; nothing here can grant access.
// National questions stay an admin toggle enforced by RLS.

const UNLINKED: Record<UnlinkedReason, { title: string; body: string }> = {
  NOT_ON_ROSTER: { title: "החשבון לא ברשימת המתמחים", body: residentErrorMessage(new Error("NOT_ON_ROSTER")) },
  EMAIL_NOT_VERIFIED: { title: "נדרש אימות של כתובת המייל", body: residentErrorMessage(new Error("EMAIL_NOT_VERIFIED")) },
  EMAIL_ALREADY_LINKED: { title: "המייל כבר מקושר לחשבון אחר", body: residentErrorMessage(new Error("EMAIL_ALREADY_LINKED")) },
  NOT_LINKED: { title: "החשבון עדיין לא קושר", body: residentErrorMessage(new Error("NOT_LINKED")) },
};

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">{icon}</div>
        <h1 className="text-2xl font-semibold text-foreground mb-3 text-center">{title}</h1>
        {children}
      </motion.div>
    </div>
  );
}

// Unlinked notice and the fail-closed "could not verify" screen share one
// shape: explanation, a retry that re-reads resident_me, and sign-out.
function Notice({ title, body, hint, retryLabel }: { title: string; body: string; hint?: string; retryLabel: string }) {
  const { refreshResident } = useApp();
  const [checking, setChecking] = useState(false);
  return (
    <Shell icon={<ShieldAlert className="w-8 h-8 text-primary" />} title={title}>
      <p role="status" className="text-muted-foreground leading-relaxed mb-8 text-center">{body}</p>
      {hint && <p className="text-sm text-muted-foreground leading-relaxed mb-6 text-center">{hint}</p>}
      <div className="flex justify-center gap-3">
        <Button disabled={checking} onClick={async () => { setChecking(true); try { await refreshResident(); } finally { setChecking(false); } }}>{retryLabel}</Button>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>התנתקות</Button>
      </div>
    </Shell>
  );
}

function OnboardingForm() {
  const { refreshResident } = useApp();
  const [year, setYear] = useState("");
  const [examThisYear, setExamThisYear] = useState(false);
  const [examDate, setExamDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!year) { setError("יש לבחור שנת התמחות."); return; }
    setError(null); setBusy(true);
    try {
      await completeMyOnboarding({ residencyYear: Number(year), examDate: examDate || null, examThisYear });
      await refreshResident();
      toast.success("הפרטים נשמרו.");
    } catch (err) { setError(residentErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return (
    <Shell icon={<GraduationCap className="w-8 h-8 text-primary" />} title="כמה פרטים לפני שמתחילים">
      <p className="text-muted-foreground leading-relaxed mb-6 text-center">הפרטים משמשים להתאמת התרגול בלבד. גישה לשאלות ארצי נפתחת על ידי המנהל בנפרד.</p>
      <form onSubmit={submit} noValidate className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium">שנת התמחות</span>
          <select value={year} onChange={(e) => setYear(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3">
            <option value="">בחרו שנה</option>
            {RESIDENCY_YEARS.map((y) => <option key={y} value={y}>שנה {y}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={examThisYear} onChange={(e) => setExamThisYear(e.target.checked)} className="h-4 w-4" />
          אני ניגש/ת לבחינת שלב א׳ השנה
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">תאריך הבחינה (לא חובה)</span>
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3" dir="ltr" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-between items-center pt-2">
          <Button type="button" variant="ghost" onClick={() => supabase.auth.signOut()}>התנתקות</Button>
          <Button type="submit" disabled={busy}>שמירה והמשך</Button>
        </div>
      </form>
    </Shell>
  );
}

export default function ResidentOnboardingView() {
  const { resident, residentError } = useApp();
  // Lookup failed (network, server, missing RPC): nothing of the app renders
  // until a fresh resident_me succeeds. Retry re-reads it; sign-out is the exit.
  if (!resident) {
    return (
      <Notice
        title="לא הצלחנו לאמת את החשבון"
        body={residentError ?? residentErrorMessage(new Error("RESIDENT_UNAVAILABLE"))}
        hint="האפליקציה נפתחת רק אחרי אימות מול השרת. בדקו את החיבור לאינטרנט ונסו שוב; אם הבעיה נמשכת, פנו לעידן."
        retryLabel="נסה שוב"
      />
    );
  }
  if (!resident.linked) { const text = UNLINKED[resident.reason ?? "NOT_LINKED"]; return <Notice title={text.title} body={text.body} retryLabel="בדיקה מחדש" />; }
  return <OnboardingForm />;
}
