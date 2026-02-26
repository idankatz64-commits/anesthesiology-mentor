import AnimatedStatsTile from './AnimatedStatsTile';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import type { DailyData } from './useStatsData';

interface Props {
  accuracy: number;
  trend: 'up' | 'down' | 'neutral';
  sparkData: DailyData[];
  fullData: { date: string; rate: number; trend?: number }[];
}

const formatDate = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

export default function AccuracyTile({ accuracy, trend, sparkData, fullData }: Props) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <AnimatedStatsTile
      collapsed={
        <div className="p-5 flex flex-col justify-between min-h-[160px]">
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
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-4">דיוק כללי — 30 ימים</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={fullData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }} labelFormatter={formatDate} />
                <Line type="monotone" dataKey="rate" stroke="#F97316" strokeWidth={2} dot={{ r: 3, fill: '#F97316' }} name="הצלחה" />
                <Line type="monotone" dataKey="trend" stroke="#60A5FA" strokeWidth={2} strokeDasharray="6 3" dot={false} name="מגמה" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      }
    />
  );
}
