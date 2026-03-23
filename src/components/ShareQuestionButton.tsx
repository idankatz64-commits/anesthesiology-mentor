import { useState } from 'react';
import { Share2, MessageCircle, Copy, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareQuestionButtonProps {
  questionText: string;
  answers: { A: string; B: string; C: string; D: string };
  topic?: string;
  serialNumber?: string;
}

export default function ShareQuestionButton({
  questionText,
  answers,
  topic,
  serialNumber,
}: ShareQuestionButtonProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const buildText = () => {
    const header = '📋 שאלה מסימולטור הרדמה (YouShellNotPass)';
    const divider = '━━━━━━━━━━━━━━━━━━';
    const topicLine = topic ? `📚 נושא: ${topic}` : '';
    const snLine = serialNumber ? `🔢 שאלה ${serialNumber}` : '';
    const meta = [topicLine, snLine].filter(Boolean).join(' | ');

    const answerLines = [
      answers.A ? `א. ${answers.A}` : '',
      answers.B ? `ב. ${answers.B}` : '',
      answers.C ? `ג. ${answers.C}` : '',
      answers.D ? `ד. ${answers.D}` : '',
    ].filter(Boolean).join('\n');

    return [header, divider, meta, '', questionText, '', answerLines, '', '🔗 anesthesiology-mentor.vercel.app']
      .filter(l => l !== undefined)
      .join('\n');
  };

  const handleWhatsApp = () => {
    const text = encodeURIComponent(buildText());
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildText());
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = buildText();
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1500);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title="שתף שאלה"
        className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
      >
        <Share2 className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: -6 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="absolute left-0 top-full mt-2 w-48 rounded-xl bg-card border border-border shadow-xl z-50 overflow-hidden"
              dir="rtl"
            >
              <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">שתף שאלה</span>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
              <button
                onClick={handleWhatsApp}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-green-500" />
                WhatsApp
              </button>
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-t border-border/30"
              >
                {copied
                  ? <Check className="w-4 h-4 text-success" />
                  : <Copy className="w-4 h-4 text-muted-foreground" />}
                {copied ? 'הועתק!' : 'העתק טקסט'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
