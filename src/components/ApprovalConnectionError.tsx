import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

export default function ApprovalConnectionError({ onRetry }: { onRetry: () => void }) {
  return <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6 text-center gap-4" dir="rtl">
    <h1 className="text-2xl font-semibold">לא הצלחנו לבדוק את הרשאות החשבון</h1>
    <p role="alert" className="max-w-md text-muted-foreground">בדקו את החיבור לאינטרנט ונסו שוב. זו אינה הודעה על דחיית אישור. הגישה תיפתח רק לאחר בדיקה מוצלחת מול השרת.</p>
    <Button onClick={onRetry}>ניסיון חוזר</Button>
    <Button variant="outline" onClick={() => void supabase.auth.signOut()}>התנתקות</Button>
  </div>;
}
