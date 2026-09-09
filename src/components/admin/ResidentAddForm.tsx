import { useState } from 'react';
import { RESIDENCY_YEARS, residentErrorMessage, upsertResidentRoster } from '@/lib/residentRepository';

export default function ResidentAddForm({ onSaved }: { onSaved: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [year, setYear] = useState('');
  const [exam, setExam] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const field = 'w-full rounded-lg border border-input bg-background p-2';
  return <form aria-label="פרטי מתמחה" className="rounded-xl border p-4 space-y-3" onSubmit={async e => {
    e.preventDefault();
    if (busy || !name.trim() || !email.trim() || !year || !exam) return;
    setBusy(true); setMessage('');
    try {
      const result = await upsertResidentRoster([{ name: name.trim(), email: email.trim().toLowerCase(), residencyYear: Number(year), examThisYear: exam === 'yes' }]);
      if (!result.applied) { setMessage('הפרטים לא נשמרו. בדקו את השדות ונסו שוב.'); return; }
      setName(''); setEmail(''); setYear(''); setExam('');
      setMessage('פרטי המתמחה נשמרו ברשימה. לא נשלחה הזמנה.');
      await onSaved();
    } catch (error) { setMessage(residentErrorMessage(error)); }
    finally { setBusy(false); }
  }}>
    <h3 className="font-semibold">הוספה או עדכון של מתמחה</h3>
    <p className="text-sm text-muted-foreground">כתובת המייל מזהה את המתמחה. אם הוא כבר ברשימה, הפרטים יעודכנו. שמירה אינה יוצרת חשבון כניסה ואינה מעניקה גישה לארצי.</p>
    <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-2">
      <label>שם מלא<input required maxLength={200} className={field} value={name} onChange={e => setName(e.target.value)} /></label>
      <label>אימייל<input required type="email" dir="ltr" className={field} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>שנת התמחות<select required className={field} value={year} onChange={e => setYear(e.target.value)}><option value="">בחרו שנה</option>{RESIDENCY_YEARS.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
      <label>ניגש לשלב א׳ השנה<select required className={field} value={exam} onChange={e => setExam(e.target.value)}><option value="">בחרו תשובה</option><option value="yes">כן</option><option value="no">לא</option></select></label>
    </fieldset>
    {message && <p role="status">{message}</p>}
    <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? 'שומר…' : 'שמירת מתמחה'}</button>
  </form>;
}
