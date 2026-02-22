import { useState, useEffect, useCallback } from 'react';
import { motivationalQuotes } from '@/data/motivationalQuotes';

const SESSION_KEY = 'quoteShownThisSession';

export default function QuoteSplash() {
  const [visible, setVisible] = useState(false);
  const [fading, setFading] = useState(false);
  const [quote] = useState(() => {
    if (sessionStorage.getItem(SESSION_KEY)) return null;
    return motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
  });

  useEffect(() => {
    if (!quote) return;
    sessionStorage.setItem(SESSION_KEY, '1');
    // Trigger fade-in on next frame
    requestAnimationFrame(() => setVisible(true));

    const timer = setTimeout(() => dismiss(), 4000);
    return () => clearTimeout(timer);
  }, [quote]);

  const dismiss = useCallback(() => {
    setFading(true);
    setTimeout(() => setVisible(false), 500);
  }, []);

  if (!quote || (!visible && fading)) return null;

  const imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(quote.imageQuery)}`;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center cursor-pointer transition-opacity duration-500 ${
        visible && !fading ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={dismiss}
      aria-label="Motivational quote, click to dismiss"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') dismiss(); }}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${imageUrl})` }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Content */}
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

      {/* Hint */}
      <p className="absolute bottom-8 left-0 right-0 text-center text-xs text-white/50">
        Click anywhere to continue
      </p>
    </div>
  );
}
