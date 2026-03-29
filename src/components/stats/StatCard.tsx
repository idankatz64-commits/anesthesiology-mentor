import type { ElementType, ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ElementType;
  color?: string;
  iconColor?: string;
  labelColor?: string;
  variant?: 'glass' | 'deep';
  onClick?: () => void;
  className?: string;
}

/**
 * Unified stat tile used across HomeView, StatsView, ResultsView.
 * variant="glass" → glass-tile (StatsView default)
 * variant="deep"  → deep-tile  (HomeView mini-stats)
 */
export function StatCard({
  label, value, sub,
  icon: Icon,
  color = 'text-foreground',
  iconColor = 'text-muted-foreground',
  labelColor = 'text-muted-foreground',
  variant = 'glass',
  onClick,
  className = '',
}: StatCardProps) {
  const base = variant === 'deep' ? 'deep-tile' : 'glass-tile';
  const interactive = onClick ? 'cursor-pointer hover:border-primary/30 transition-colors' : '';

  return (
    <div
      className={`${base} rounded-xl p-3 text-center ${interactive} ${className}`}
      onClick={onClick}
    >
      {Icon && (
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <Icon className={`w-3 h-3 ${iconColor}`} />
        </div>
      )}
      <div className={`text-[9px] font-medium mb-0.5 ${labelColor}`}>{label}</div>
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      {sub && <div className={`text-[9px] mt-0.5 ${labelColor}`}>{sub}</div>}
    </div>
  );
}
