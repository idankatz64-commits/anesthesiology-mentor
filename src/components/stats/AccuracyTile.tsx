import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import type { DailyData } from './useStatsData';

interface Props {
  accuracy: number;
  trend: 'up' | 'down' | 'neutral';
  sparkData: DailyData[];
}

export default function AccuracyTile({ accuracy, trend, sparkData }: Props) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-5 flex flex-col justify-between min-h-[160px]">
      <div className="flex items-start justify-between">
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">דיוק כללי</span>
        <TrendIcon className={`w-4 h-4 ${trendColor}`} />
      </div>
      <div className="text-2xl font-black text-foreground">{accuracy}%</div>
      <div className="h-8 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData.slice(-7)}>
            <defs>
              <linearGradient id="sparkAcc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F97316" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="rate" stroke="#F97316" strokeWidth={1.5} fill="url(#sparkAcc)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
