import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';
import { buildCurriculumPlan, type CurriculumChapter, type CurriculumConfig, type ResidentContext } from '@/lib/curriculumPlan';
import {
  curriculumErrorMessage, fetchCurriculumConfig, parseCurriculumImport, publishCurriculumVersion, saveCurriculumDraft, sha256Hex,
  type CurriculumConfigState, type CurriculumSource, type HashedConfig,
} from '@/lib/curriculumRepository';
import { PlanView } from '@/components/learning/CurriculumPlanPanel';

const isFull = (d: CurriculumConfigState['draft']): d is HashedConfig => !!d && 'chapters' in d;

/** Versioned core-config: draft/import/preview for content admins; publish only for the editorial owner (curriculum_publish → NOT_OWNER otherwise). */
export default function CurriculumConfigTab() {
  const { userId } = useApp();
  // Every request and result is keyed to the identity that issued it: a response for a
  // previous identity is never shown and never toasts (synchronous clear on switch/signout).
  const identityRef = useRef(userId);
  identityRef.current = userId;
  const [loaded, setLoaded] = useState<{ uid: string | null; state: CurriculumConfigState } | null>(null);
  const state = loaded && loaded.uid === userId ? loaded.state : null;
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState('');
  const [chapters, setChapters] = useState<CurriculumChapter[] | null>(null);
  const [source, setSource] = useState<CurriculumSource | null>(null);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmVersion, setConfirmVersion] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ResidentContext>({ residencyYear: 1, examThisYear: false, examDate: null });

  const load = (uid: string | null) => fetchCurriculumConfig().then((s) => {
    if (uid !== identityRef.current) return;
    setLoaded({ uid, state: s }); setError(null);
    if (isFull(s.draft)) { setVersion(s.draft.version); setChapters([...s.draft.chapters]); setSource(s.draft.source ?? null); }
  }).catch((e) => { if (uid === identityRef.current) setError(curriculumErrorMessage(e)); });
  useEffect(() => {
    setLoaded(null); setError(null); setVersion(''); setChapters(null); setSource(null); setConfirmVersion('');
    if (userId) load(userId);
  }, [userId]);

  const applyImport = async (text: string, path?: string) => {
    const parsed = parseCurriculumImport(text);
    if ('error' in parsed) { setImportError(parsed.error); return; }
    setImportError(null);
    setChapters(parsed.chapters);
    setSource({ path, sha256: await sha256Hex(text), description: parsed.description });
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    const uid = identityRef.current;
    setBusy(true);
    try { await fn(); if (uid !== identityRef.current) return; toast.success(label); await load(uid); }
    catch (e) { if (uid === identityRef.current) toast.error(curriculumErrorMessage(e)); }
    finally { setBusy(false); }
  };

  const draftConfig: CurriculumConfig | null = chapters && version.trim() ? { version: version.trim(), status: 'draft', chapters, source: source ?? undefined } : null;
  const previewPlan = draftConfig ? buildCurriculumPlan({ config: draftConfig, resident: preview, evidence: [], audience: 'admin', nowMs: Date.now() }) : null;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h2 className="text-xl font-bold mb-1">תוכנית ליבה</h2>
        <p className="text-sm text-muted-foreground">גרסאות של רשימת פרקי הליבה. טיוטה אינה משפיעה על מתמחים; רק אישור בעל התוכן של גרסה מדויקת מפרסם.</p>
      </div>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {state && (
        <>
          <section aria-label="גרסאות" className="rounded-xl border border-border p-4">
            <p className="text-sm mb-2">פעילה: <strong>{state.approved ? `${state.approved.version} (${state.approved.chapters.length} פרקים)` : 'אין גרסה מאושרת'}</strong></p>
            <table className="w-full text-sm">
              <thead><tr className="text-muted-foreground text-right"><th>גרסה</th><th>סטטוס</th><th>פרקים</th><th>נוצר</th><th>אושר</th></tr></thead>
              <tbody>{state.versions.map((v) => (
                <tr key={v.version} className="border-t border-border"><td>{v.version}</td><td>{v.status}</td><td>{v.chapterCount}</td><td>{v.createdAt.slice(0, 10)}</td><td>{v.approvedAt?.slice(0, 10) ?? '—'}</td></tr>
              ))}</tbody>
            </table>
          </section>

          {state.canEdit && (
            <section aria-label="טיוטה" className="rounded-xl border border-border p-4 space-y-3">
              <h3 className="font-bold">טיוטה</h3>
              <label className="block text-sm">גרסה
                <input aria-label="גרסת טיוטה" value={version} onChange={(e) => setVersion(e.target.value)} className="mt-1 w-full rounded border border-border bg-background px-2 py-1" />
              </label>
              <label className="block text-sm">ייבוא JSON (CORE-CANDIDATE או {'{chapters:[{id,title}]}'})
                <textarea aria-label="JSON לייבוא" value={importText} onChange={(e) => setImportText(e.target.value)} rows={4} className="mt-1 w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs" />
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" disabled={!importText.trim()} onClick={() => applyImport(importText)} className="rounded-lg border border-border px-3 py-1.5 text-sm">טען מהטקסט</button>
                <input type="file" accept=".json" aria-label="קובץ JSON" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then((t) => applyImport(t, f.name)); }} className="text-sm" />
              </div>
              {importError && <p role="alert" className="text-destructive text-sm">{importError}</p>}
              {chapters && (
                <p className="text-sm">{chapters.length} פרקים{source?.sha256 && <> · sha256 <code className="text-xs">{source.sha256.slice(0, 16)}…</code></>}{source?.path && ` · ${source.path}`}</p>
              )}
              <button type="button" disabled={busy || !draftConfig} onClick={() => run('הטיוטה נשמרה', () => saveCurriculumDraft(version, chapters!, source))} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-bold">שמור טיוטה</button>
            </section>
          )}

          {previewPlan && (
            <section aria-label="תצוגה מקדימה" className="rounded-xl border border-border p-4 space-y-3">
              <h3 className="font-bold">תצוגה מקדימה (ללא עדות אמיתית)</h3>
              <div className="flex flex-wrap gap-3 text-sm">
                <label>שנת התמחות
                  <select aria-label="שנת התמחות לתצוגה" value={preview.residencyYear ?? ''} onChange={(e) => setPreview((p) => ({ ...p, residencyYear: e.target.value ? Number(e.target.value) : null }))} className="mr-2 rounded border border-border bg-background px-2 py-1">
                    <option value="">לא ידוע</option>{[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label><input type="checkbox" checked={preview.examThisYear} onChange={(e) => setPreview((p) => ({ ...p, examThisYear: e.target.checked }))} /> בחינה השנה</label>
                <label>תאריך בחינה <input type="date" value={preview.examDate ?? ''} onChange={(e) => setPreview((p) => ({ ...p, examDate: e.target.value || null }))} className="mr-2 rounded border border-border bg-background px-2 py-1" /></label>
              </div>
              <PlanView plan={previewPlan} />
            </section>
          )}

          {state.canPublish && state.draft && (
            <section aria-label="פרסום" className="rounded-xl border border-amber-500/40 p-4 space-y-2">
              <h3 className="font-bold">אישור ופרסום (בעל התוכן בלבד)</h3>
              <p className="text-sm text-muted-foreground">הקלד את מספר הגרסה המדויק של הטיוטה ({state.draft.version}) כדי לאשר אותה. הפרסום מחליף את הגרסה הפעילה ({state.approved?.version ?? 'אין'}) רק אם היא ושתוכן הטיוטה לא השתנו מאז הטעינה; אחרת הוא נדחה ויש לרענן.</p>
              {isFull(state.draft) && state.draft.contentHash && <p className="text-xs text-muted-foreground">חתימת תוכן: <code>{state.draft.contentHash.slice(0, 16)}…</code></p>}
              <input aria-label="אישור גרסה" value={confirmVersion} onChange={(e) => setConfirmVersion(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1 text-sm" />
              <button type="button" disabled={busy || confirmVersion.trim() !== state.draft.version} onClick={() => { const draft = state.draft; run('הגרסה אושרה ופורסמה', () => publishCurriculumVersion(confirmVersion.trim(), state.approved?.version ?? null, isFull(draft) ? draft.contentHash : null)); }} className="rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-bold disabled:opacity-50">אשר ופרסם</button>
            </section>
          )}
          {!state.canPublish && state.canEdit && <p className="text-xs text-muted-foreground">פרסום זמין רק לבעל התוכן המוגדר (editorial_owner); הרשאת אדמין רגילה אינה מספיקה.</p>}
        </>
      )}
    </div>
  );
}
