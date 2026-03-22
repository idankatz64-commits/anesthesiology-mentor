import { useState, useEffect } from 'react';
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
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Supabase sets the session automatically from the URL hash after redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: 'שגיאה', description: 'הסיסמאות אינן תואמות', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: 'סיסמה עודכנה!', description: 'אתה מועבר להתחברות.' });
      navigate('/auth', { replace: true });
    } catch (err: any) {
      toast({ title: 'שגיאה', description: err.message, variant: 'destructive' });
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
          {!ready ? (
            <p className="text-center text-muted-foreground text-sm">מאמת קישור...</p>
          ) : (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">סיסמה חדשה</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="new-password" type="password" placeholder="••••••••" dir="ltr"
                    className="pr-10 bg-muted/50 border-border"
                    value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">אימות סיסמה</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input id="confirm-password" type="password" placeholder="••••••••" dir="ltr"
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
