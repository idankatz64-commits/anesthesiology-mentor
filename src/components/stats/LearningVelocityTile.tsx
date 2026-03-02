import { useMemo } from 'react';
import AnimatedStatsTile from './AnimatedStatsTile';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, BarChart, Bar, Cell,
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
  const active = raw.filter(d => d.count > 0);

  return active.map((d, idx) => {
    const window7 = active.slice(Math.max(0, idx - 6), idx + 1);
    const window14 = active.slice(Math.max(0, idx - 13), idx + 1);

    const ma7 = window7.length >= 2 ? Math.round(window7.reduce((s, v) => s + v.rate, 0) / window7.length) : null;
    const ma14 = window14.length >= 4 ? Math.round(window14.reduce((s, v) => s + v.rate, 0) / window14.length) : null;
    const volumeMA14 = window14.length >= 2 ? Math.round(window14.reduce((s, v) => s + v.count, 0) / window14.length) : null;

    return {
      date: d.date,
      count: d.count,
      rate: d.rate,
      ma7,
      ma14,
      volumeMA14,
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

function computeDailyReport(chartData: ReturnType<typeof computeMovingAverages>) {
  if (!chartData.length) return null;
  const last = chartData[chartData.length - 1];
  const today = new Date().toISOString().slice(0, 10);
  const isToday = last.date === today;

  const todayRate = isToday ? last.rate : null;
  const todayCount = isToday ? last.count : 0;

  const last7 = chartData.slice(-7);
  const last14 = chartData.slice(-14);

  const avg7Rate = last7.length ? Math.round(last7.reduce((s, v) => s + v.rate, 0) / last7.length) : null;
  const avg14Rate = last14.length ? Math.round(last14.reduce((s, v) => s + v.rate, 0) / last14.length) : null;
  const avg14Volume = last14.length ? Math.round(last14.reduce((s, v) => s + v.count, 0) / last14.length) : null;

  return { todayRate, todayCount, avg7Rate, avg14Rate, avg14Volume };
}

function DailyReport({ chartData, condensed = false }: { chartData: ReturnType<typeof computeMovingAverages>; condensed?: boolean }) {
  const report = useMemo(() => computeDailyReport(chartData), [chartData]);
  if (!report) return null;

  const { todayRate, todayCount, avg7Rate, avg14Rate, avg14Volume } = report;

  let summaryText: string;
  let summaryClass: string;
  if (todayCount === 0 || todayRate === null) {
    summaryText = 'עדיין לא תרגלת היום';
    summaryClass = 'text-muted-foreground';
  } else if (avg14Rate !== null && todayRate > avg14Rate) {
    summaryText = 'ביצועים מעל הממוצע היום 📈';
    summaryClass = 'text-green-500';
  } else {
    summaryText = 'ביצועים מתחת לממוצע — המשך לתרגל 💪';
    summaryClass = 'text-orange-400';
  }

  if (condensed) {
    return (
      <div className="mt-3 pt-3 border-t border-border/40 text-xs text-center" dir="rtl">
        <span className={`font-semibold ${summaryClass}`}>{summaryText}</span>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-border/40 space-y-2" dir="rtl">
      <h4 className="text-sm font-bold text-foreground">דוח יומי</h4>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>היום: <span className="font-bold text-foreground">{todayRate !== null ? `${todayRate}%` : '—'}</span></span>
        <span>ממוצע 7 ימים: <span className="font-bold text-foreground">{avg7Rate !== null ? `${avg7Rate}%` : '—'}</span></span>
        <span>ממוצע 14 ימים: <span className="font-bold text-foreground">{avg14Rate !== null ? `${avg14Rate}%` : '—'}</span></span>
      </div>
      <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        <span>שאלות היום: <span className="font-bold text-foreground">{todayCount}</span></span>
        <span>ממוצע 14 יום: <span className="font-bold text-foreground">{avg14Volume ?? '—'}</span></span>
      </div>
      <p className={`text-sm font-semibold ${summaryClass}`}>{summaryText}</p>
    </div>
  );
}

function VelocityChart({ data, height }: { data: DayPoint[]; height: number }) {
  const chartData = useMemo(() => computeMovingAverages(data), [data]);

  const lastVolumeMA14 = useMemo(() => {
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (chartData[i].volumeMA14 != null) return chartData[i].volumeMA14;
    }
    return null;
  }, [chartData]);

  const lineHeight = height - 110;
  const barHeight = 100;

  return (
    <div className="flex flex-col">
      <ResponsiveContainer width="100%" height={lineHeight}>
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="date" tick={false} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6B7280', fontSize: 13 }} axisLine={false} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={70} stroke="#6B7280" strokeDasharray="8 4" strokeWidth={1} label={{ value: 'יעד מבחן', position: 'insideTopRight', fill: '#6B7280', fontSize: 11 }} />
          <Line type="monotone" dataKey="rate" stroke="#FB923C" strokeWidth={1} dot={{ r: 2, fill: '#FB923C' }} name="דיוק יומי" connectNulls={false} />
          <Line type="monotone" dataKey="ma7" stroke="#F97316" strokeWidth={2.5} dot={false} name="ממוצע 7 יום" connectNulls />
          <Line type="monotone" dataKey="ma14" stroke="#60A5FA" strokeWidth={2} strokeDasharray="6 3" dot={false} name="ממוצע 14 יום" connectNulls />
          <Legend verticalAlign="top" align="right" iconType="line" wrapperStyle={{ fontSize: 14, paddingBottom: 8 }} />
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={barHeight}>
        <BarChart data={chartData} margin={{ top: 0, right: 10, left: -15, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
          {lastVolumeMA14 != null && (
            <ReferenceLine y={lastVolumeMA14} stroke="#6B7280" strokeDasharray="6 3" strokeWidth={1} />
          )}
          <Bar dataKey="count" radius={[2, 2, 0, 0]} maxBarSize={12}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.volumeMA14 != null && entry.count >= entry.volumeMA14 ? '#22C55E' : '#EF4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <DailyReport chartData={chartData} />
    </div>
  );
}

export default function LearningVelocityTile({ data, fullData }: Props) {
  return (
    <AnimatedStatsTile
      collapsed={
        <div className="p-5">
          <span className="text-xs text-muted-foreground font-medium">מגמת דיוק לאורך זמן</span>
          <p className="text-[10px] text-muted-foreground/50 mb-2">ממוצעים נעים — ימים פעילים בלבד</p>
          <div style={{ minHeight: 430 }}>
            <VelocityChart data={data} height={430} />
          </div>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-1">מגמת דיוק לאורך זמן — ממוצעים נעים</h3>
          <p className="text-xs text-muted-foreground mb-4">{fullData ? '30' : '14'} ימים אחרונים • קו כתום = ממוצע 7 יום, קו כחול מקווקו = ממוצע 14 יום</p>
          <div style={{ height: 510 }}>
            <VelocityChart data={fullData || data} height={510} />
          </div>
        </div>
      }
    />
  );
}
