import { useMemo } from 'react';
import AnimatedStatsTile from './AnimatedStatsTile';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts';

interface DayPoint {
  date: string;
  rate: number;
  count: number;
  trend?: number;
}

interface Props {
  data: DayPoint[];
  fullData?: DayPoint[];
}

const formatDate = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

function computeMovingAverages(raw: DayPoint[]) {
  // Collect only active days' rates in order
  const result: {
    date: string;
    rate: number | null;
    count: number;
    ma7: number | null;
    ma14: number | null;
  }[] = [];

  // We need a running window of active-day rates
  const activeRates: number[] = [];
  let activeIndex = 0;

  for (const d of raw) {
    const active = d.count > 0;
    if (active) {
      activeRates.push(d.rate);
      activeIndex++;
    }

    const ma7 = activeIndex >= 7
      ? Math.round(activeRates.slice(-7).reduce((s, v) => s + v, 0) / 7)
      : activeIndex >= 2
        ? Math.round(activeRates.slice(-Math.min(7, activeRates.length)).reduce((s, v) => s + v, 0) / Math.min(7, activeRates.length))
        : null;

    const ma14 = activeIndex >= 14
      ? Math.round(activeRates.slice(-14).reduce((s, v) => s + v, 0) / 14)
      : activeIndex >= 4
        ? Math.round(activeRates.slice(-Math.min(14, activeRates.length)).reduce((s, v) => s + v, 0) / Math.min(14, activeRates.length))
        : null;

    result.push({
      date: d.date,
      count: d.count,
      rate: active ? d.rate : null,
      ma7: active ? ma7 : null,
      ma14: active ? ma14 : null,
    });
  }

  return result;
}

function VelocityChart({ data, height }: { data: DayPoint[]; height: number }) {
  const chartData = useMemo(() => computeMovingAverages(data), [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
          labelFormatter={formatDate}
        />
        <ReferenceLine y={70} stroke="#6B7280" strokeDasharray="8 4" strokeWidth={1} label={{ value: 'יעד מבחן', position: 'insideTopRight', fill: '#6B7280', fontSize: 10 }} />
        <Line type="monotone" dataKey="rate" stroke="#FB923C" strokeWidth={1} dot={{ r: 2, fill: '#FB923C' }} name="דיוק יומי" connectNulls={false} />
        <Line type="monotone" dataKey="ma7" stroke="#F97316" strokeWidth={2.5} dot={false} name="ממוצע 7 יום" connectNulls />
        <Line type="monotone" dataKey="ma14" stroke="#60A5FA" strokeWidth={2} strokeDasharray="6 3" dot={false} name="ממוצע 14 יום" connectNulls />
        <Legend
          verticalAlign="top"
          align="right"
          iconType="line"
          wrapperStyle={{ fontSize: 10, paddingBottom: 8 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function LearningVelocityTile({ data, fullData }: Props) {
  return (
    <AnimatedStatsTile
      collapsed={
        <div className="p-5">
          <span className="text-xs text-muted-foreground font-medium">מגמת דיוק לאורך זמן</span>
          <p className="text-[10px] text-muted-foreground/50 mb-2">ממוצעים נעים — 14 ימים</p>
          <div style={{ minHeight: 280 }}>
            <VelocityChart data={data} height={280} />
          </div>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1">מגמת דיוק לאורך זמן — ממוצעים נעים</h3>
          <p className="text-xs text-muted-foreground mb-4">{fullData ? '30' : '14'} ימים אחרונים • קו כתום = ממוצע 7 יום, קו כחול מקווקו = ממוצע 14 יום</p>
          <div style={{ height: 400 }}>
            <VelocityChart data={fullData || data} height={400} />
          </div>
        </div>
      }
    />
  );
}
