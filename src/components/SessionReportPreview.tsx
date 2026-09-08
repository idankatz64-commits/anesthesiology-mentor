import { useRef, useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export default function SessionReportPreview({ html, onClose }: { html: string; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [printError, setPrintError] = useState(false);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-5xl h-[90dvh] flex flex-col p-4 sm:p-6" dir="rtl">
      <DialogTitle className="pr-7">ייצוא דוח הלמידה המלא</DialogTitle>
      <DialogDescription>הדוח כולל את הניתוח, ההמלצות וכל השאלות וההסברים. בחלון ההדפסה בחרו ״שמירה כ־PDF״.</DialogDescription>
      <div className="flex flex-wrap gap-3">
        <button type="button" disabled={!ready} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 font-bold disabled:opacity-50" onClick={() => {
          try { frame.current?.contentWindow?.print(); setPrintError(false); }
          catch { setPrintError(true); }
        }}>הדפסה / שמירה כ־PDF</button>
        <DialogClose className="rounded-lg border border-border px-4 py-2">חזרה לסיכום</DialogClose>
      </div>
      {printError && <p role="alert">הדפדפן לא הצליח לפתוח הדפסה. אפשר לנסות שוב מתוך הדפדפן הרגיל.</p>}
      <iframe ref={frame} title="דוח הלמידה להדפסה" srcDoc={html} sandbox="allow-same-origin allow-modals" onLoad={() => setReady(true)} className="w-full flex-1 min-h-0 rounded-lg border bg-white" />
    </DialogContent>
  </Dialog>;
}
