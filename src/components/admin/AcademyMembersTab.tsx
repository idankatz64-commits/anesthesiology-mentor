import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ResidentAddForm from './ResidentAddForm';
import { isDemo, maskEmail, maskName } from "@/lib/demoMode";
import {
  parseEmailList,
  fetchMembers,
  fetchMyAdminRole,
  addMembers,
  updateMember,
  deleteMember,
  AcademyMemberRow,
} from "@/lib/academyRepository";
import {
  parseRosterCsv,
  residentErrorMessage,
  setMemberNationalAccess,
  upsertResidentRoster,
  type RosterResult,
} from "@/lib/residentRepository";

const ROSTER_REASON: Record<string, string> = {
  INVALID_EMAIL: "מייל לא תקין",
  DUPLICATE_IN_FILE: "כפול בקובץ",
  DUPLICATE_IN_BATCH: "כפול בקובץ",
  INVALID_HEADER: "כותרות הקובץ אינן תואמות",
  INVALID_COLUMN_COUNT: "מספר עמודות לא תקין",
  INVALID_RESIDENCY_YEAR: "שנת התמחות חייבת להיות 1–7",
  INVALID_EXAM_FLAG: "יש להזין כן או לא בעמודת הבחינה",
  INVALID_INPUT: "נתונים לא תקינים",
};
const rosterReason = (code: string) => ROSTER_REASON[code] ?? code;

// Roster import (the distributed name,email,exam-this-year CSV) and the
// national-access toggle. Real admin only — admin_users.role === 'admin' — not
// the broader is_admin RPC that also lets editors into this dashboard.
function RosterImport({ onImported }: { onImported: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RosterResult | null>(null);
  const parsed = useMemo(() => parseRosterCsv(text), [text]);

  const importRows = async () => {
    if (parsed.rejected.length > 0) return;
    setBusy(true); setResult(null);
    try {
      const r = await upsertResidentRoster(parsed.rows);
      setResult(r);
      if (r.applied) { setText(""); await onImported(); }
    } catch (e) {
      toast.error(residentErrorMessage(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">ייבוא רשימת המתמחים (CSV)</h3>
      <p className="text-sm text-muted-foreground">
        ארבע עמודות מהגיליון: שם מלא, אימייל, שנת התמחות (1–7), ניגש השנה (כן/לא). גם הפורמט האנגלי הישן בן שלוש העמודות נתמך. התצוגה המקדימה מראה מה ייקלט לפני השליחה. שדה שהקובץ לא מציין נשאר כפי שהוא רשום היום ולא נדרס. הייבוא לא יוצר חשבונות ולא שולח מיילים.
      </p>
      <label className="block space-y-1">
        <span className="text-sm">קובץ הרשימה (הדבקה)</span>
        <textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={5} dir="ltr"
          className="w-full border border-input bg-background text-foreground rounded-lg p-2 text-sm font-mono"
          placeholder="שם מלא,אימייל,שלב בהתמחות ( מספיק שנה),מתכננים לגשת לשלב א׳ השנה?&#10;דנה כהן,dana@gmail.com,3,כן" />
      </label>
      {parsed.rows.length > 0 && (
        <table aria-label="תצוגה מקדימה של הרשימה" className="w-full text-sm border rounded-lg">
          <thead><tr className="bg-muted/50 text-right"><th className="p-1">שם</th><th className="p-1">מייל</th><th className="p-1">שנה</th><th className="p-1">ניגש השנה</th></tr></thead>
          <tbody>{parsed.rows.map((r) => (
            <tr key={r.email} className="border-t"><td className="p-1">{r.name || "—"}</td><td className="p-1 font-mono" dir="ltr">{r.email}</td><td className="p-1">{r.residencyYear ?? "—"}</td><td className="p-1">{r.examThisYear === null ? "לא צוין — לא ישתנה (מתמחה חדש: לא)" : r.examThisYear ? "כן" : "לא"}</td></tr>
          ))}</tbody>
        </table>
      )}
      {parsed.rejected.length > 0 && (
        <ul aria-label="שורות שנדחו" className="text-sm text-destructive list-disc pr-5">
          {parsed.rejected.map((r) => <li key={r.line}>שורה {r.line}: {rosterReason(r.reason)}</li>)}
        </ul>
      )}
      {result?.applied && <p role="status" className="text-sm text-green-700 dark:text-green-400">הרשימה יובאה: נוספו {result.inserted} · עודכנו {result.updated}.</p>}
      {result && !result.applied && (
        <div role="alert" className="text-sm text-destructive">
          <p>השרת דחה את הרשימה — שום דבר לא יובא. תקנו ונסו שוב:</p>
          <ul className="list-disc pr-5">{result.rejected.map((r) => <li key={r.row}>שורה {r.row}: {rosterReason(r.reason)}</li>)}</ul>
        </div>
      )}
      <button onClick={() => void importRows()} disabled={busy || parsed.rows.length === 0 || parsed.rejected.length > 0}
        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
        ייבוא הרשימה ({parsed.rows.length})
      </button>
    </div>
  );
}

export default function AcademyMembersTab() {
  const [members, setMembers] = useState<AcademyMemberRow[]>([]);
  const [emailsText, setEmailsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [realAdmin, setRealAdmin] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMembers(await fetchMembers());
    } catch (e) {
      console.error("fetchMembers failed:", e);
      toast.error("טעינת רשימת המחזור נכשלה");
    }
  }, []);

  useEffect(() => {
    void reload();
    fetchMyAdminRole().then((role) => setRealAdmin(role === "admin")).catch((e) => console.error("fetchMyAdminRole failed:", e));
  }, [reload]);

  // Grants immediately through the server RPC; unrelated to exam intent or date.
  const toggleNational = async (m: AcademyMemberRow) => {
    setToggling(m.id);
    try {
      await setMemberNationalAccess(m.id, !m.national_access);
      await reload();
    } catch (e) {
      toast.error(residentErrorMessage(e));
    } finally { setToggling(null); }
  };

  const handleAdd = async () => {
    const { valid, invalid } = parseEmailList(emailsText);
    if (invalid.length > 0) {
      toast.error(`כתובות לא תקינות: ${invalid.join(", ")}`);
      return;
    }
    if (valid.length === 0) return;
    setBusy(true);
    try {
      await addMembers(valid);
      toast.success(`${valid.length} מיילים נוספו למחזור`);
      setEmailsText("");
      await reload();
    } catch (e) {
      console.error("addMembers failed:", e);
      toast.error("הוספת המיילים נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (id: string, p: Parameters<typeof updateMember>[1]) => {
    try {
      await updateMember(id, p);
      await reload();
    } catch (e) {
      console.error("updateMember failed:", e);
      toast.error("עדכון החבר נכשל");
    }
  };

  const remove = async (m: AcademyMemberRow) => {
    if (!window.confirm(`להסיר את ${maskEmail(m.email)} מהמחזור?`)) return;
    try {
      await deleteMember(m.id);
      await reload();
    } catch (e) {
      console.error("deleteMember failed:", e);
      toast.error("הסרת החבר נכשלה");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {realAdmin ? <><ResidentAddForm onSaved={reload} /><RosterImport onImported={reload} /></> : (
        <p className="text-sm text-muted-foreground border rounded-xl p-4">ייבוא רשימת המתמחים ופתיחת שאלות ארצי זמינים למנהל בלבד.</p>
      )}
      <div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">הוספת מתמחים למחזור</h3>
        <p className="text-sm text-muted-foreground">
          הדבק מיילים (שורה לכל מייל או מופרדים בפסיק). מי שיירשם עם מייל מהרשימה ישויך אוטומטית.
        </p>
        <textarea
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          rows={4}
          dir="ltr"
          className="w-full border border-input bg-background text-foreground rounded-lg p-2 text-sm font-mono"
          placeholder="resident1@gmail.com&#10;resident2@gmail.com"
        />
        <button
          onClick={handleAdd}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          הוסף למחזור
        </button>
      </div>

      <div className="border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-right">
              <th className="p-2">מייל</th>
              <th className="p-2">שם</th>
              <th className="p-2">שנת התמחות</th>
              <th className="p-2">נרשם?</th>
              <th className="p-2">רמת גישה</th>
              <th className="p-2">סטטוס</th>
              <th className="p-2">ניגש השנה</th>
              <th className="p-2">שאלות ארצי</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-2 font-mono" dir="ltr">
                  {maskEmail(m.email)}
                </td>
                <td className="p-2">
                  <input
                    defaultValue={isDemo() ? maskName(m.full_name || m.email) : (m.full_name ?? "")}
                    placeholder="—"
                    disabled={isDemo()}
                    className="border border-input bg-background text-foreground rounded p-1 w-32"
                    onBlur={(e) => {
                      if (isDemo()) return;
                      const v = e.target.value.trim();
                      if (v !== (m.full_name ?? "")) void patch(m.id, { full_name: v || null });
                    }}
                  />
                </td>
                <td className="p-2">
                  <select
                    value={m.residency_year ?? ""}
                    onChange={(e) =>
                      void patch(m.id, {
                        residency_year: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    className="border border-input bg-background text-foreground rounded p-1"
                  >
                    <option value="">—</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                      <option key={y} value={y}>
                        שנה {y}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">{m.user_id ? "✅" : "טרם"}</td>
                <td className="p-2">
                  <select
                    value={m.access_level}
                    onChange={(e) => void patch(m.id, { access_level: e.target.value })}
                    className="border border-input bg-background text-foreground rounded p-1"
                  >
                    <option value="academy">אקדמיה בלבד</option>
                    <option value="full">גישה מלאה (שלב א')</option>
                  </select>
                </td>
                <td className="p-2">
                  <button
                    onClick={() =>
                      void patch(m.id, {
                        status: m.status === "active" ? "suspended" : "active",
                      })
                    }
                    className={m.status === "active" ? "text-green-600" : "text-amber-600"}
                  >
                    {m.status === "active" ? "פעיל" : "מושהה"}
                  </button>
                </td>
                <td className="p-2 text-xs">
                  {m.exam_this_year ? "ניגש" : "לא ניגש"}
                  {m.exam_date && <span className="text-muted-foreground" dir="ltr"> · {m.exam_date}</span>}
                  {!m.onboarding_completed_at && <span className="text-muted-foreground"> · טרם מילא פרטים</span>}
                </td>
                <td className="p-2">
                  {realAdmin ? (
                    <button type="button" role="switch" aria-checked={!!m.national_access} aria-label={`שאלות ארצי עבור ${maskEmail(m.email)}`}
                      disabled={toggling === m.id || isDemo()} onClick={() => void toggleNational(m)}
                      className={`px-2 py-1 rounded-md border text-xs ${m.national_access ? "bg-green-600 text-white border-green-700" : "bg-muted text-muted-foreground"}`}>
                      {m.national_access ? "פתוח" : "סגור"}
                    </button>
                  ) : (
                    <span className="text-xs">{m.national_access ? "פתוח" : "סגור"}</span>
                  )}
                </td>
                <td className="p-2">
                  <button onClick={() => void remove(m)} className="text-destructive">
                    הסר
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-muted-foreground">
                  המחזור ריק — הוסף מיילים למעלה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
