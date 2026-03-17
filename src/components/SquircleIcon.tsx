import { useEffect, useState } from 'react';
import { type LucideIcon } from 'lucide-react';

function useIsDark() {
  const [isDark, setIsDark] = useState(
    () => !document.documentElement.classList.contains('light')
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(!document.documentElement.classList.contains('light'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  return isDark;
}

const gradients: Record<string, { accent: string; glow: string }> = {
  gold:   { accent: '#fbbf24', glow: '#f97316' },
  teal:   { accent: '#2dd4bf', glow: '#059669' },
  orange: { accent: '#fb923c', glow: '#ef4444' },
  blue:   { accent: '#3b82f6', glow: '#4f46e5' },
  cyan:   { accent: '#22d3ee', glow: '#3b82f6' },
  violet: { accent: '#a78bfa', glow: '#9333ea' },
  rose:   { accent: '#fb7185', glow: '#db2777' },
  slate:  { accent: '#94a3b8', glow: '#475569' },
  green:  { accent: '#4ade80', glow: '#059669' },
};

const sizes = {
  sm:  { box: 28, icon: 14 },
  md:  { box: 36, icon: 18 },
  lg:  { box: 44, icon: 22 },
} as const;

interface SquircleIconProps {
  icon: LucideIcon;
  gradient?: keyof typeof gradients;
  size?: keyof typeof sizes;
  className?: string;
}

export default function SquircleIcon({
  icon: Icon,
  gradient = 'blue',
  size = 'md',
  className = '',
}: SquircleIconProps) {
  const { accent, glow } = gradients[gradient] ?? gradients.blue;
  const { box, icon: iconSize } = sizes[size];
  const isDark = useIsDark();

  const base = isDark ? '#1a1a2e' : '#f0f0f5';
  const end = isDark ? '#0d0d1a' : '#e2e2ea';

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 relative overflow-hidden ${className}`}
      style={{
        width: box,
        height: box,
        borderRadius: '22%',
        background: `linear-gradient(145deg, ${base}, ${end})`,
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.12),
          inset 0 -1px 2px rgba(0,0,0,0.3),
          0 2px 8px rgba(0,0,0,0.4)
        `,
      }}
    >
      {/* Colored radial glow */}
      <div
        className="absolute inset-0"
        style={{
          borderRadius: '22%',
          background: `radial-gradient(circle at 50% 60%, ${accent}22, ${glow}08, transparent 70%)`,
        }}
      />
      {/* Top glass highlight */}
      <div
        className="absolute top-0 left-[15%] right-[15%] h-[40%]"
        style={{
          borderRadius: '22% 22% 50% 50%',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, transparent 100%)',
        }}
      />
      <Icon
        size={iconSize}
        strokeWidth={2.2}
        className="relative z-10"
        style={{
          color: accent,
          filter: `drop-shadow(0 0 4px ${accent}40) drop-shadow(0 1px 1px rgba(0,0,0,0.3))`,
        }}
      />
    </div>
  );
}
