import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function EmailOtpNotice() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return <aside className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" aria-label="עדכון שיטת ההתחברות" dir="rtl">
    <p className="font-semibold">עברנו לכניסה עם קוד חד־פעמי במייל</p>
    <p className="mt-1">בכניסה הבאה מזינים את כתובת המייל של החשבון ומקבלים קוד. אין צורך בסיסמה או באיפוס סיסמה. החשבון, ההתקדמות וההרשאות נשמרים, ואם הגישה שלכם כבר פעילה אפשר להמשיך ללמוד כרגיל בלי להתנתק עכשיו.</p>
    <Button variant="ghost" size="sm" className="mt-2" onClick={() => setVisible(false)}>הבנתי</Button>
  </aside>;
}
