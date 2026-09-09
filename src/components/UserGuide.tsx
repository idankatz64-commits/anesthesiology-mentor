import { BookOpen, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import guide from '@/content/userGuide.he.json';

export function GuideHelp({ sectionId, label }: { sectionId: string; label: string }) {
  const section = guide.sections.find(s => s.id === sectionId);
  if (!section) return null;
  return <details className="text-sm rounded-lg border border-border p-3">
    <summary className="cursor-pointer font-medium">{label}</summary>
    <ul className="mt-3 space-y-2 list-disc ps-5 text-muted-foreground">{section.steps.map(step => <li key={step}>{step}</li>)}</ul>
  </details>;
}

export default function UserGuide() {
  return <Dialog>
    <DialogTrigger asChild><button type="button" aria-label="מדריך שימוש" title="מדריך שימוש" className="shrink-0 p-2 rounded-lg border border-border/50 hover:bg-primary/10 flex items-center gap-2">
      <BookOpen className="w-4 h-4" /><span className="hidden lg:inline text-xs">מדריך שימוש</span>
    </button></DialogTrigger>
    <DialogContent dir="rtl" className="sm:max-w-2xl p-5 sm:p-7">
      <DialogTitle className="px-5">{guide.title}</DialogTitle>
      <DialogDescription>{guide.intro}</DialogDescription>
      <a href="/guides/ysnp-user-guide-he.pdf" download="YSNP-מדריך-שימוש.pdf" className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2">
        <Download className="w-4 h-4" />הורדת המדריך כ־PDF
      </a>
      <p className="text-xs text-muted-foreground">גרסת מדריך: {guide.version}</p>
      {guide.sections.map((section, index) => <details key={section.id} open={index === 0} className="rounded-xl border p-3 sm:p-4">
        <summary className="font-semibold cursor-pointer">{section.title}</summary>
        <ol className="list-decimal ps-5 space-y-3 mt-3 text-sm leading-relaxed">{section.steps.map(step => <li key={step}>{step}</li>)}</ol>
      </details>)}
    </DialogContent>
  </Dialog>;
}
