// persistOptimistic — wrap optimistic-UI Supabase writes with rollback + toast.
//
// Pattern fixes B5 findings #1–#5: toggleFavorite, saveNote, deleteNote,
// setRating, addTag/removeTag in AppContext.tsx — all of which previously
// used `supabase.from(...).then()` with no error handler. On RLS denial,
// network failure, or DB error, the local UI state diverged from the DB
// silently and the user lost data on next reload.
//
// Usage:
//   await persistOptimistic({
//     applyLocal:  () => setProgress(prev => ...),
//     dbCall:      () => supabase.from('user_favorites').insert(...),
//     rollback:    () => setProgress(prev => ...),
//     errorLabel:  'שמירת המועדף נכשלה',
//   });

import { toast } from "sonner";

type SupabaseResult = { error: { message: string } | null };

export interface PersistOptimisticArgs {
  applyLocal: () => void;
  dbCall: () => Promise<SupabaseResult> | PromiseLike<SupabaseResult>;
  rollback: () => void;
  errorLabel: string;
}

export async function persistOptimistic(args: PersistOptimisticArgs): Promise<void> {
  args.applyLocal();
  try {
    const result = await args.dbCall();
    if (result?.error) {
      console.error(`${args.errorLabel}:`, result.error);
      toast.error(args.errorLabel);
      args.rollback();
    }
  } catch (err) {
    console.error(`${args.errorLabel} (threw):`, err);
    toast.error(args.errorLabel);
    args.rollback();
  }
}
