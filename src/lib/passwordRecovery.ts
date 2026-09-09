import type { Session } from '@supabase/supabase-js';

/** Bind the password update to the displayed account's token, even if another
 * tab replaces the shared SDK session during the request. No tokens are stored. */
export async function updatePasswordForSession(session: Session, password: string): Promise<void> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error('לא ניתן לשמור את הסיסמה. בדקו את דרישות הסיסמה או בקשו קישור חדש.');
  const user: { id?: string } = await response.json();
  if (user.id !== session.user.id) throw new Error('החשבון השתנה. התחברו מחדש לפני המשך הפעולה.');
}
