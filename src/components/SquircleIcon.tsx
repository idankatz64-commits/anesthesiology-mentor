import { type LucideIcon } from 'lucide-react';

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

  return (
    <div
      className={`inline-flex items-center justify-center shrink-0 ${className}`}
      style={{
        width: box,
        height: box,
        borderRadius: '22%',
        background: `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 6px rgba(0,0,0,0.3)',
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
