import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GraduationCap, Mail, Lock, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { fadeUp } from '@/lib/animations';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast({ title: 'הבקשה התקבלה', description: 'אם קיים חשבון מתאים לכתובת, יישלח אליו קישור להגדרת סיסמה. בדקו גם בדואר הזבל.' });
      setIsForgot(false);
    } catch (err) {
      toast({ title: 'שגיאה', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) navigate('/', { replace: true });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast({ title: 'הבקשה התקבלה', description: data.session ? 'הגישה לחומר תלויה באישור החשבון ובשיוך לרשימת המתמחים.' : 'בדקו את תיבת המייל להשלמת האימות. אם כבר נרשמתם, השתמשו בהתחברות או באיפוס סיסמה.' });
      }
    } catch (err) {
      toast({ title: 'שגיאה', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
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
      {/* Radial glow behind the card */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md space-y-8 relative z-10">
        <div className="text-center space-y-3">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20 glow-border">
            <GraduationCap className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">סימולטור הרדמה</h1>
          <p className="text-muted-foreground text-sm">איכילוב – הכנה למבחני בורד</p>
        </div>

        <div className="glass-card rounded-2xl p-6 space-y-6 shadow-lg card-accent-top">
          {isForgot ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center space-y-1">
                <p className="font-semibold text-foreground">איפוס סיסמה</p>
                <p className="text-xs text-muted-foreground">נשלח לך קישור לאיפוס למייל</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-forgot">אימייל</Label>
                <div className="relative">
                  <Mail className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="email-forgot" autoComplete="email" type="email" placeholder="you@example.com" dir="ltr" className="pr-10 bg-muted/50 border-border"
                    value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
              <Button type="submit" className="w-full h-11 hover-glow" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'שלח קישור לאיפוס'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                <button type="button" disabled={loading} onClick={() => setIsForgot(false)} className="text-primary font-medium hover:underline">
                  חזור להתחברות
                </button>
              </p>
            </form>
          ) : (
            <>
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">אימייל</Label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="email" autoComplete="email" type="email" placeholder="you@example.com" dir="ltr" className="pr-10 bg-muted/50 border-border"
                      value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">סיסמה</Label>
                    {isLogin && (
                      <button type="button" disabled={loading} onClick={() => { setIsForgot(true); setPassword(''); }} className="text-xs text-muted-foreground hover:text-primary hover:underline">
                        שכחתי סיסמה
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="password" autoComplete={isLogin ? 'current-password' : 'new-password'} type="password" placeholder="••••••••" dir="ltr" className="pr-10 bg-muted/50 border-border"
                      value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 hover-glow" disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isLogin ? 'התחבר' : 'הרשם'}
                </Button>
              </form>

              <p className="text-sm text-muted-foreground">הכניסה מתבצעת באמצעות אימייל וסיסמה. אם נכנסתם בעבר דרך Google, בחרו ״שכחתי סיסמה״ עם אותה כתובת אימייל כדי להגדיר סיסמה לחשבון הקיים.</p>

              <p className="text-center text-sm text-muted-foreground">
                {isLogin ? 'אין לך חשבון?' : 'כבר יש לך חשבון?'}{' '}
                <button type="button" disabled={loading} onClick={() => { setIsLogin(!isLogin); setPassword(''); }} className="text-primary font-medium hover:underline">
                  {isLogin ? 'הרשם כאן' : 'התחבר כאן'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
