import { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useEditorialOwner } from '@/components/admin/editorialOwner';
import { fetchManagementAggregate, managementAggregateCsv, managementErrorMessage, type ManagementAggregate } from '@/lib/learningRepository';
import { pct } from '@/lib/learningReportText';

const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * Owner-only cohort coverage/success report (management_aggregate_read). The server is the
 * authority (NOT_OWNER otherwise); the owner flag here only decides whether to ask.
 * Deliberately separate from the internal ManagerDashboardTab, which is not an export path.
 */
export default function ManagementAggregateTab() {
  const { userId } = useApp();
  const owner = useEditorialOwner(userId);
  const [data, setData] = useState<{ uid: string | null; aggregate: ManagementAggregate } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aggregate = data && data.uid === userId ? data.aggregate : null;

  useEffect(() => {
    setData(null); setError(null);
    if (!owner || !userId) return;
    let live = true;
    fetchManagementAggregate().then((a) => { if (live) setData({ uid: userId, aggregate: a }); }).catch((e) => { if (live) setError(managementErrorMessage(e)); });
    return () => { live = false; };
  }, [owner, userId]);

  const stamp = aggregate ? aggregate.generatedAt.slice(0, 10) : '';
  return (
    <div className="space-y-4" dir="rtl">
      <div>
        <h2 className="text-xl font-bold mb-1">דוח כיסוי מחזור (בעלים)</h2>
        <p className="text-sm text-muted-foreground">כיסוי ליבה והצלחה בבחינה לכל מתמחה פעיל לפי גרסת הליבה המאושרת. ללא תשובות בודדות, ללא שאלות, ללא מכסות פנימיות.</p>
      </div>
      {owner === false && <p role="note" className="text-sm text-muted-foreground">הדוח שמור לבעלים העריכתי (editorial_owner) בלבד.</p>}
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {owner && !aggregate && !error && <p className="text-sm text-muted-foreground">טוען…</p>}
      {aggregate && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>גרסה: <strong>{aggregate.curriculumVersion}</strong> · נוצר: {stamp} · {aggregate.residents.length} מתמחים</span>
            <button type="button" onClick={() => download(`cohort-coverage-${aggregate.curriculumVersion}-${stamp}.csv`, managementAggregateCsv(aggregate), 'text/csv;charset=utf-8')} className="rounded-lg border border-border px-3 py-1.5">ייצוא CSV</button>
            <button type="button" onClick={() => download(`cohort-coverage-${aggregate.curriculumVersion}-${stamp}.json`, JSON.stringify(aggregate, null, 2), 'application/json')} className="rounded-lg border border-border px-3 py-1.5">ייצוא JSON</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground text-right"><th>מתמחה</th><th>שנה</th><th>כיסוי ליבה</th><th>הצלחה בבחינה</th><th>פרקים ירוקים-כיסוי (≥50%)</th></tr></thead>
            <tbody>{aggregate.residents.map((r) => (
              <tr key={r.memberId} className="border-t border-border">
                <td>{r.fullName}</td><td>{r.residencyYear ?? '—'}</td><td>{pct(r.overall.coveragePercent)}</td><td>{pct(r.overall.successPercent)}</td>
                <td>{r.chapters.filter((c) => (c.coveragePercent ?? 0) >= 50).length} מתוך {r.chapters.length}</td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
    </div>
  );
}
