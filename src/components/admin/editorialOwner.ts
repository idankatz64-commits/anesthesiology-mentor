import { useEffect, useState } from 'react';
import { fetchMyFeedbackRole } from '@/lib/feedbackRepository';

export const NOT_OWNER_MESSAGE = 'רק בעל התוכן המוגדר (editorial_owner) יכול לשמור, לייבא או למחוק שאלות ישירות. הצעות תיקון עוברות דרך תור המשוב.';

/**
 * Since 20260908000001 every INSERT/UPDATE/DELETE policy on `questions` accepts
 * only the editorial owner (not the broad admin/editor role). null = not resolved yet.
 */
export function useEditorialOwner(userId: string | null | undefined): boolean | null {
  // The answer is stored with the identity it was fetched for, so an identity switch clears it
  // synchronously and a late response for a previous identity can never grant the owner UI.
  const [resolved, setResolved] = useState<{ userId: string; owner: boolean } | null>(null);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchMyFeedbackRole().then((r) => { if (live) setResolved({ userId, owner: r.owner }); }).catch(() => { if (live) setResolved({ userId, owner: false }); });
    return () => { live = false; };
  }, [userId]);
  if (!userId) return false;
  return resolved?.userId === userId ? resolved.owner : null;
}

/**
 * RLS filters silently: a non-owner UPDATE/DELETE returns zero rows with error=null.
 * Callers append `.select('id')` to the write and pass the result here so a
 * zero-row write is reported as a failure instead of a success toast.
 */
export function requireWrittenRows<T>(rows: T[] | null, expected: number, error: { message: string } | null): T[] {
  if (error) throw new Error(error.message);
  if (!rows || rows.length < expected) throw new Error(NOT_OWNER_MESSAGE);
  return rows;
}
