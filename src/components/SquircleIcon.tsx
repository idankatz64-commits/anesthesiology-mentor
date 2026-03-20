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

const gradients: Record<string, [string, string]> = {
  gold:   ['#fbbf24', '#f97316'],
  teal:   ['#2dd4bf', '#059669'],
  orange: ['#fb923c', '#ef4444'],
  blue:   ['#3b82f6', '#4f46e5'],
  cyan:   ['#22d3ee', '#3b82f6'],
  violet: ['#a78bfa', '#9333ea'],
  rose:   ['#fb7185', '#db2777'],
  slate:  ['#94a3b8', '#475569'],
  green:  ['#4ade80', '#059669'],
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
  const [from, to] = gradients[gradient] ?? gradients.blue;
  const { box, icon: iconSize } = sizes[size];
  const isDark = useIsDark();

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: box,
        height: box,
        borderRadius: '22%',
        background: `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow: isDark
          ? 'inset 0 1px 0 rgba(255,255,255,0.3), 0 3px 10px rgba(0,0,0,0.5)'
          : 'inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 6px rgba(0,0,0,0.15)',
        filter: isDark ? 'brightness(1.08)' : 'brightness(1)',
      }}
    >
      <Icon
        size={iconSize}
        strokeWidth={2.2}
        className="text-white"
        style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))' }}
      />
    </div>
  );
}
