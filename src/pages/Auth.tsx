import { useState, useEffect, useRef, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function errorMessage(error: unknown, verifying: boolean) {
  const code = (error as { code?: string; status?: number })?.code;
  if ((error as { status?: number })?.status === 429 || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'נשלחו יותר מדי בקשות. המתינו דקה ונסו שוב.';
  if (verifying && (code === 'otp_expired' || code === 'validation_failed')) return 'הקוד שגוי או שפג תוקפו. בדקו את הקוד במייל האחרון או בקשו קוד חדש.';
  return verifying ? 'לא הצלחנו לאמת את הקוד. בדקו את החיבור ונסו שוב.' : 'לא הצלחנו לשלוח קוד. בדקו את כתובת המייל ואת החיבור ונסו שוב. אם הבעיה נמשכת, פנו לעידן.';
}

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inFlight = useRef(false);
  const navigate = useNavigate();
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (!resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [resendAt]);

  const sendCode = async (e?: FormEvent) => {
    e?.preventDefault();
    if (inFlight.current || (sentEmail && Date.now() < resendAt)) return;
    const address = (sentEmail ?? email).trim().toLowerCase();
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
      if (error) throw error;
      setSentEmail(address); setToken('');
      const time = Date.now(); setNow(time); setResendAt(time + 60_000);
    } catch (error) { setError(errorMessage(error, false)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const verifyCode = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !sentEmail) return;
    if (!/^\d{6,8}$/.test(token)) { setError('הזינו את הקוד המלא מהמייל.'); return; }
    inFlight.current = true; setBusy(true); setError('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: sentEmail, token, type: 'email' });
      if (error) throw error;
      if (!data.session) throw new Error('Missing session');
      navigate('/', { replace: true });
    } catch (error) { setError(errorMessage(error, true)); }
    finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background bg-grid-pattern flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <GraduationCap className="mx-auto h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold">כניסה ל־YouShellNotPass</h1>
          <p className="text-muted-foreground">קוד חד־פעמי למייל — בלי לזכור סיסמה</p>
        </div>
        <div className="glass-card rounded-2xl p-6 space-y-5 shadow-lg">
          <form onSubmit={sentEmail ? verifyCode : sendCode} className="space-y-4">
            {sentEmail ? <>
              <p role="status" className="text-sm">בדקו את תיבת המייל של <bdi>{sentEmail}</bdi> והזינו את הקוד מההודעה האחרונה. בדקו גם בדואר הזבל.</p>
              <Label htmlFor="otp">קוד האימות</Label>
              <Input id="otp" autoFocus autoComplete="one-time-code" inputMode="numeric" type="text" dir="ltr" className="text-center text-xl tracking-widest" value={token} onChange={e => setToken(e.target.value.replace(/\s/g, ''))} maxLength={8} required disabled={busy} />
            </> : <>
              <Label htmlFor="email">כתובת המייל</Label>
              <Input id="email" autoComplete="email" inputMode="email" type="email" dir="ltr" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required disabled={busy} />
            </>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-11" disabled={busy}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />{sentEmail ? 'מאמתים…' : 'שולחים…'}</> : sentEmail ? 'אימות וכניסה' : 'שלחו לי קוד'}
            </Button>
          </form>
          {sentEmail && <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" disabled={busy || remaining > 0} onClick={() => void sendCode()}>שליחה חוזרת{remaining > 0 ? ` בעוד ${remaining} שניות` : ''}</Button>
            <Button variant="ghost" disabled={busy} onClick={() => { setSentEmail(null); setToken(''); setError(''); }}>שינוי כתובת המייל</Button>
          </div>}
          <div className="border-t pt-4 text-sm text-muted-foreground space-y-2">
            <p><strong>כבר השתמשתם במערכת?</strong> הזינו את אותה כתובת שבה נרשמתם, גם אם נכנסתם בעבר דרך Google. ההתקדמות והחשבון הקיים נשמרים.</p>
            <p><strong>זו הכניסה הראשונה?</strong> השתמשו בכתובת שמסרתם ברשימת המתמחים. אין צורך בהרשמה נפרדת או בהגדרת סיסמה. הגישה לחומר ניתנת לפי הרשאות החשבון לאחר אימות הקוד.</p>
            <p>אם כתובתכם ברשימה שונה מהכתובת שבה השתמשתם בעבר, פנו לעידן לתיקון השיוך לפני יצירת חשבון נוסף.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
