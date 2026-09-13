import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

// Old reset links remain understandable, but no longer ask for a password.
export default function ResetPassword() {
  return <main className="min-h-screen flex items-center justify-center p-6 bg-background" dir="rtl">
    <section className="max-w-md space-y-4 text-center">
      <h1 className="text-2xl font-bold">כבר אין צורך לאפס סיסמה</h1>
      <p>עברנו לכניסה באמצעות קוד חד־פעמי למייל. הזינו את כתובת המייל של החשבון הקיים כדי להמשיך עם אותה היסטוריית למידה.</p>
      <Button asChild><Link to="/auth">כניסה עם קוד במייל</Link></Button>
    </section>
  </main>;
}
