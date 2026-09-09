import { useState, useEffect, useRef } from 'react';
import type { Session } from '@supabase/supabase-js';
import { updatePasswordForSession } from '@/lib/passwordRecovery';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, Lock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/animations';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [account, setAccount] = useState<{ id: string; email?: string } | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const identityEpoch = useRef(0);
  const mounted = useRef(true);
  const saving = useRef(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    let active = true;
    let authRevision = 0;
    mounted.current = true;
    identityEpoch.current++;
    const acceptSession = (session: Session | null) => {
      if (!active) return;
      if (session?.user.id !== sessionRef.current?.user.id) {
        identityEpoch.current++;
        setPassword(''); setConfirm(''); setLoading(false); saving.current = false;
      }
      sessionRef.current = session;
      setAccount(session ? { id: session.user.id, email: session.user.email } : null);
      setStatus(session ? 'ready' : 'invalid');
    };
    const invalidLink = new URLSearchParams(window.location.hash.slice(1)).has('error') || new URLSearchParams(window.location.search).has('error');
    if (invalidLink) { setStatus('invalid'); return () => { mounted.current = false; }; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authRevision++;
      acceptSession(session);
    });
    const initialRevision = authRevision;
    supabase.auth.getSession().then(({ data, error }) => {
      if (authRevision === initialRevision) acceptSession(error ? null : data.session);
    }).catch(() => { if (authRevision === initialRevision) acceptSession(null); });
    return () => { active = false; mounted.current = false; subscription.unsubscribe(); };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = sessionRef.current;
    const epoch = identityEpoch.current;
    const current = () => mounted.current && identityEpoch.current === epoch;
    if (saving.current || status !== 'ready' || !target || target.user.id !== account?.id) return;
    if (password !== confirm) {
      toast({ title: 'שגיאה', description: 'הסיסמאות אינן תואמות', variant: 'destructive' });
      return;
    }
    saving.current = true; setLoading(true);
    try {
      await updatePasswordForSession(target, password);
      if (!current()) return;
      setPassword(''); setConfirm(''); setStatus('done');
      toast({ title: 'הסיסמה עודכנה', description: 'הסיסמה החדשה נשמרה לחשבון שלכם.' });
    } catch (err) {
      if (!current()) return;
      toast({ title: 'שגיאה', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      if (current()) { saving.current = false; setLoading(false); }
    }
  };

  return (
    <motion.div
      className="min-h-screen bg-background bg-grid-pattern flex items-center justify-center p-4"
      dir="rtl"
      initial={fadeUp.initial}
      animate={fadeUp.animate}
      exit={fadeUp.exit}
      transition={fadeUp.transition}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20 glow-border">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">איפוס סיסמה</h1>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-6 shadow-lg card-accent-top">
          {status === 'checking' ? (
            <p className="text-center text-muted-foreground text-sm">מאמת קישור...</p>
          ) : status === 'invalid' ? (
            <div className="space-y-4 text-center"><p role="alert">הקישור אינו תקין או שפג תוקפו. בקשו קישור חדש דרך ״שכחתי סיסמה״.</p><Button onClick={() => navigate('/auth', { replace: true })}>חזרה להתחברות</Button></div>
          ) : status === 'done' ? (
            <div className="space-y-4 text-center"><p role="status">הסיסמה נשמרה. אפשר להמשיך לחשבון שלכם.</p><Button onClick={() => navigate('/', { replace: true })}>המשך לאפליקציה</Button></div>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm">הגדרת סיסמה לחשבון: <bdi>{account?.email}</bdi></p>
              <div className="space-y-2">
                <Label htmlFor="new-password">סיסמה חדשה</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="new-password" type="password" autoComplete="new-password" placeholder="••••••••" dir="ltr"
                    className="pr-10 bg-muted/50 border-border"
                    value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">אימות סיסמה</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="confirm-password" type="password" autoComplete="new-password" placeholder="••••••••" dir="ltr"
                    className="pr-10 bg-muted/50 border-border"
                    value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 hover-glow" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'עדכן סיסמה'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </motion.div>
  );
}
