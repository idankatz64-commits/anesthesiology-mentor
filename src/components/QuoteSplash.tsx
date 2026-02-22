import { useState, useEffect, useCallback, useRef } from 'react';
import { motivationalQuotes } from '@/data/motivationalQuotes';

const SESSION_KEY = 'quoteShownThisSession';

export default function QuoteSplash() {
  const [phase, setPhase] = useState<'hidden' | 'entering' | 'visible' | 'glitching' | 'gone'>('hidden');
  const [barStarted, setBarStarted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [quote] = useState(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return null;
    return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  });

  useEffect(() => {
    if (!quote) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    requestAnimationFrame(() => {
      setPhase('entering');
      // After a frame at opacity 0, transition to visible (opacity 1)
      requestAnimationFrame(() => setPhase('visible'));
      setTimeout(() => setBarStarted(true), 50);
    });
    timerRef.current = setTimeout(() => dismiss(), 10000);
    return () => clearTimeout(timerRef.current);
  }, [quote]);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setPhase('glitching');
    setTimeout(() => setPhase('gone'), 800);
  }, []);

  if (!quote || phase === 'hidden' || phase === 'gone') return null;

  return (
    <>
      <style>{`
        @keyframes glitchExit {
          0%   { transform: translateX(0); opacity: 1; filter: none; }
          10%  { transform: translateX(-8px); filter: hue-rotate(90deg); }
          20%  { transform: translateX(8px); filter: hue-rotate(-90deg); }
          30%  { transform: translateX(-5px); opacity: 0.8; }
          40%  { transform: translateX(5px); filter: brightness(2); }
          50%  { transform: translateX(-3px); filter: contrast(3); }
          70%  { transform: translateX(3px); opacity: 0.5; filter: hue-rotate(180deg); }
          85%  { transform: translateX(0); filter: brightness(0); }
          100% { opacity: 0; transform: translateX(0); }
        }
      `}</style>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
        style={{
          opacity: phase === 'entering' ? 0 : phase === 'visible' ? 1 : undefined,
          transition: phase === 'entering' || phase === 'visible' ? 'opacity 0.5s ease-out' : undefined,
          animation: phase === 'glitching' ? 'glitchExit 0.8s ease-out forwards' : undefined,
        }}
        onClick={dismiss}
        aria-label="Motivational quote, click to dismiss"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') dismiss(); }}
      >
        <div className="absolute inset-0" style={{ background: quote.gradient }} />

        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <p
            className="text-2xl md:text-4xl font-bold text-white leading-snug mb-6"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.7)' }}
          >
            "{quote.quote}"
          </p>
          <p
            className="text-sm md:text-base text-white/80 italic"
            style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
          >
            — {quote.character}
          </p>
        </div>

        <p className="absolute bottom-12 left-0 right-0 text-center text-xs text-white/50">
          Click anywhere to continue
        </p>

        {/* Countdown bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1">
          <div
            className="h-full bg-white/40"
            style={{
              width: barStarted ? '0%' : '100%',
              transition: barStarted ? 'width 10s linear' : 'none',
            }}
          />
        </div>
      </div>
    </>
  );
}
