import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  fetchFsrsShadowSummary, fsrsShadowErrorMessage, processFsrsShadow, retryFailedFsrsEvents,
  type FsrsShadowSummary,
} from '@/lib/fsrsShadowRepository';

export interface FsrsShadowTabProps {
  /** Current auth id. A changed id synchronously hides the previous aggregate. */
  userId: string | null;
}

const Metric = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-bold">{value}</div></div>
);

function FsrsShadowPanel({ userId }: { userId: string }) {
  const identity = useRef(userId); identity.current = userId;
  const active = useRef(true);
  const [loaded, setLoaded] = useState<{ uid: string; value: FsrsShadowSummary } | null>(null);
  const summary = loaded?.uid === userId ? loaded.value : null;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const uid = userId;
    try {
      const value = await fetchFsrsShadowSummary();
      if (active.current && identity.current === uid) { setLoaded({ uid, value }); setError(null); }
    } catch (e) {
      if (active.current && identity.current === uid) { setLoaded(null); setError(fsrsShadowErrorMessage(e)); }
    }
  }, [userId]);
  useEffect(() => {
    active.current = true; setLoaded(null); setError(null); void load();
    return () => { active.current = false; };
  }, [load]);

  const run = async (retry: boolean) => {
    const uid = userId; setBusy(true);
    try {
      const restored = retry ? await retryFailedFsrsEvents() : 0;
      if (!active.current || identity.current !== uid) return;
      const batch = await processFsrsShadow();
      if (!active.current || identity.current !== uid) return;
      toast.success(retry
        ? `${restored} אירועים הוחזרו לתור; ${batch.applied + batch.excluded} עובדו כעת`
        : `${batch.applied} חושבו, ${batch.excluded} תועדו כמוחרגים`);
      if (!active.current || identity.current !== uid) return;
      await load();
    } catch (e) {
      if (active.current && identity.current === uid) setError(fsrsShadowErrorMessage(e));
    } finally { if (active.current && identity.current === uid) setBusy(false); }
  };

  if (!summary) return <p role={error ? 'alert' : 'status'} className="rounded-xl border p-4 text-sm text-muted-foreground" dir="rtl">{error ?? 'טוען את השוואת האלגוריתמים…'}</p>;
  const c = summary.comparison; const p = summary.processing; const e = summary.events;
  return (
    <div className="space-y-5" dir="rtl">
      <section className="space-y-3 rounded-xl border border-border p-4" aria-labelledby="fsrs-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="fsrs-heading" className="text-xl font-bold">השוואת FSRS</h2>
            <p className="text-sm text-muted-foreground">SM2 ממשיך לקבוע בפועל אילו שאלות מגיעות לחזרה. {summary.shadowAlgorithm} מחשב במקביל תחזית ניסיונית בלבד ({summary.parameterVersion}).</p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void run(false)} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">עבד עד 25 אירועים</button>
            {p.failed > 0 && <button type="button" disabled={busy} onClick={() => void run(true)} className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50">החזר כשלים לתור</button>}
          </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2 sm:grid-cols-4">
          <Metric label="אירועים שנקלטו" value={e.total} /><Metric label="כשירים לחישוב" value={e.eligible} />
          <Metric label="עובדו" value={p.processed} /><Metric label="ממתינים / בעבודה / כשלו" value={`${p.pending} / ${p.processing} / ${p.failed}`} />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border p-4" aria-label="השוואת מועדי חזרה">
        <h3 className="font-bold">FSRS מול תאריך ה־SM2 הפעיל</h3>
        <div className="grid gap-2 sm:grid-cols-5">
          <Metric label="כרטיסי FSRS" value={c.fsrsCards} /><Metric label="עם תאריך SM2" value={c.cardsWithSm2} />
          <Metric label="FSRS מוקדם יותר" value={c.fsrsEarlier} /><Metric label="אותו יום" value={c.sameDate} /><Metric label="FSRS מאוחר יותר" value={c.fsrsLater} />
        </div>
        <p className="text-sm">הפרש ממוצע: <strong>{c.meanDeltaDays == null ? 'אין מספיק נתונים' : `${c.meanDeltaDays} ימים`}</strong></p>
      </section>

      <section className="space-y-2 rounded-xl border border-border p-4" aria-label="איכות הנתונים והמגבלות">
        <h3 className="font-bold">איכות הנתונים</h3>
        <p className="text-sm">מוחרגים: {e.excluded} · ישנים או מחוץ לסדר שהוסגרו: {e.lateOutOfOrder} · ללא ציון: {e.unscored} · ללא ביטחון: {e.missingConfidence} · ביטחון משוער: {e.estimatedConfidence} · אחרי חשיפה קודמת למשוב: {e.afterPriorFeedback} · מקור ארצי: {e.national}</p>
        <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">{summary.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
      </section>
    </div>
  );
}

export default function FsrsShadowTab({ userId }: FsrsShadowTabProps) {
  if (!userId) return <p role="alert" className="rounded-xl border p-4 text-sm text-muted-foreground" dir="rtl">יש להתחבר כדי לצפות בהשוואה.</p>;
  return <FsrsShadowPanel key={userId} userId={userId} />;
}
