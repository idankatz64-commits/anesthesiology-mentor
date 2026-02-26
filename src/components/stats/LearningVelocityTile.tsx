import StatsTile from './StatsTile';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface Props {
  data: { date: string; rate: number; count: number; trend?: number }[];
}

const formatDate = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

function VelocityChart({ data, height }: { data: Props['data']; height: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} unit="%" tick={{ fill: '#6B7280', fontSize: 9 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={{ background: '#141720', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, fontSize: 12 }} labelFormatter={formatDate} />
        <Line type="monotone" dataKey="rate" stroke="#F97316" strokeWidth={2} dot={{ r: 2, fill: '#F97316' }} name="הצלחה" />
        <Line type="monotone" dataKey="trend" stroke="#60A5FA" strokeWidth={2} strokeDasharray="6 3" dot={false} name="מגמה" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function LearningVelocityTile({ data }: Props) {
  return (
    <StatsTile
      collapsed={
        <div className="p-5">
          <span className="text-xs text-muted-foreground font-medium">מהירות למידה</span>
          <p className="text-[10px] text-muted-foreground/50 mb-2">14 ימים אחרונים</p>
          <div style={{ height: 120 }}>
            <VelocityChart data={data} height={120} />
          </div>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-white mb-4">מהירות למידה — 14 ימים</h3>
          <div style={{ height: 350 }}>
            <VelocityChart data={data} height={350} />
          </div>
        </div>
      }
    />
  );
}
