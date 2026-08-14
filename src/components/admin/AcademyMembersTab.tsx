import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  parseEmailList,
  fetchMembers,
  addMembers,
  updateMember,
  deleteMember,
  AcademyMemberRow,
} from "@/lib/academyRepository";

export default function AcademyMembersTab() {
  const [members, setMembers] = useState<AcademyMemberRow[]>([]);
  const [emailsText, setEmailsText] = useState("");
  const [busy, setBusy] = useState(false);

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
  }, [reload]);

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
    if (!window.confirm(`להסיר את ${m.email} מהמחזור?`)) return;
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
      <div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">הוספת מתמחים למחזור</h3>
        <p className="text-sm text-muted-foreground">
          הדבק מיילים (שורה לכל מייל או מופרדים בפסיק). מי שיירשם עם מייל
          מהרשימה ישויך אוטומטית.
        </p>
        <textarea
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          rows={4}
          dir="ltr"
          className="w-full border rounded-lg p-2 text-sm font-mono"
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
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b">
                <td className="p-2 font-mono" dir="ltr">
                  {m.email}
                </td>
                <td className="p-2">
                  <input
                    defaultValue={m.full_name ?? ""}
                    placeholder="—"
                    className="border rounded p-1 w-32"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v !== (m.full_name ?? ""))
                        void patch(m.id, { full_name: v || null });
                    }}
                  />
                </td>
                <td className="p-2">
                  <select
                    value={m.residency_year ?? ""}
                    onChange={(e) =>
                      void patch(m.id, {
                        residency_year: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                    className="border rounded p-1"
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
                    onChange={(e) =>
                      void patch(m.id, { access_level: e.target.value })
                    }
                    className="border rounded p-1"
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
                    className={
                      m.status === "active"
                        ? "text-green-600"
                        : "text-amber-600"
                    }
                  >
                    {m.status === "active" ? "פעיל" : "מושהה"}
                  </button>
                </td>
                <td className="p-2">
                  <button
                    onClick={() => void remove(m)}
                    className="text-destructive"
                  >
                    הסר
                  </button>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-4 text-center text-muted-foreground"
                >
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
