import StatsTile from './StatsTile';
import { Flame } from 'lucide-react';
import type { DailyData } from './useStatsData';

interface Props {
  streak: number;
  dailyData: DailyData[];
}

export default function StreakTile({ streak, dailyData }: Props) {
  return (
    <StatsTile
      collapsed={
        <div className="p-5 flex flex-col items-center justify-center min-h-[160px] gap-1">
          <Flame className="w-8 h-8 text-orange-500" />
          <div className="text-2xl font-black text-white">{streak}</div>
          <span className="text-[10px] text-muted-foreground/60">ימים רצופים 🔥</span>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-white mb-4">רצף למידה — 30 ימים אחרונים</h3>
          <div className="grid grid-cols-7 gap-2">
            {dailyData.map(d => {
              const active = d.count > 0;
              const day = new Date(d.date + 'T00:00:00');
              const dayName = day.toLocaleDateString('he-IL', { weekday: 'short' });
              return (
                <div
                  key={d.date}
                  className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[9px] ${
                    active ? 'bg-orange-500/30 text-orange-300' : 'bg-white/5 text-muted-foreground/40'
                  }`}
                  title={`${d.date}: ${d.count} שאלות`}
                >
                  <span className="font-bold text-[10px]">{day.getDate()}</span>
                  <span>{dayName}</span>
                  {active && <span className="text-[8px]">{d.count}q</span>}
                </div>
              );
            })}
          </div>
        </div>
      }
    />
  );
}
