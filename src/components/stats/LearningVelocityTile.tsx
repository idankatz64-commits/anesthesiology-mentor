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
  // Filter to only active days
  const active = raw.filter(d => d.count > 0);
  
  return active.map((d, idx) => {
    const window7 = active.slice(Math.max(0, idx - 6), idx + 1);
    const window14 = active.slice(Math.max(0, idx - 13), idx + 1);

    const ma7 = window7.length >= 2 ? Math.round(window7.reduce((s, v) => s + v.rate, 0) / window7.length) : null;
    const ma14 = window14.length >= 4 ? Math.round(window14.reduce((s, v) => s + v.rate, 0) / window14.length) : null;

    return {
      date: d.date,
      count: d.count,
      rate: d.rate,
      ma7,
      ma14,
    };
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-card dark:bg-[#1a1d28] border border-border dark:border-white/[0.1] rounded-lg px-3 py-2 text-xs shadow-xl" dir="rtl">
      <div className="font-bold text-foreground mb-1">{formatDate(d?.date || label)}</div>
      {d?.rate != null && <div className="text-muted-foreground">דיוק יומי: <span className="font-bold text-orange-400">{d.rate}%</span></div>}
      {d?.ma7 != null && <div className="text-muted-foreground">ממוצע 7י: <span className="font-bold text-foreground">{d.ma7}%</span></div>}
      {d?.ma14 != null && <div className="text-muted-foreground">ממוצע 14י: <span className="font-bold text-blue-400">{d.ma14}%</span></div>}
      {d?.count != null && <div className="text-muted-foreground">שאלות: <span className="font-bold text-foreground">{d.count}</span></div>}
    </div>
  );
};

function VelocityChart({ data, height }: { data: DayPoint[]; height: number }) {
  const chartData = useMemo(() => computeMovingAverages(data), [data]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6B7280', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={70} stroke="#6B7280" strokeDasharray="8 4" strokeWidth={1} label={{ value: 'יעד מבחן', position: 'insideTopRight', fill: '#6B7280', fontSize: 11 }} />
        <Line type="monotone" dataKey="rate" stroke="#FB923C" strokeWidth={1} dot={{ r: 2, fill: '#FB923C' }} name="דיוק יומי" connectNulls={false} />
        <Line type="monotone" dataKey="ma7" stroke="#F97316" strokeWidth={2.5} dot={false} name="ממוצע 7 יום" connectNulls />
        <Line type="monotone" dataKey="ma14" stroke="#60A5FA" strokeWidth={2} strokeDasharray="6 3" dot={false} name="ממוצע 14 יום" connectNulls />
        <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={{ fontSize: 13, paddingBottom: 8 }} />
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
          <p className="text-[10px] text-muted-foreground/50 mb-2">ממוצעים נעים — ימים פעילים בלבד</p>
          <div style={{ minHeight: 300 }}>
            <VelocityChart data={data} height={300} />
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
