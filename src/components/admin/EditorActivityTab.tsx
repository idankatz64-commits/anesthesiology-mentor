import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { he } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface EditorRow {
  email: string;
  editsToday: number;
  editsWeek: number;
  lastEdit: string | null;
}

interface DayBar {
  label: string;
  count: number;
}

export default function EditorActivityTab() {
  const [editors, setEditors] = useState<EditorRow[]>([]);
  const [chartData, setChartData] = useState<DayBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const weekAgo = new Date(todayStart);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

      const [logRes, adminsRes] = await Promise.all([
        supabase
          .from('question_edit_log' as any)
          .select('editor_id, edited_at')
          .gte('edited_at', weekAgo.toISOString()),
        supabase.from('admin_users').select('id, email'),
      ]);

      const logs: { editor_id: string; edited_at: string }[] = (logRes.data as any) || [];
      const adminMap = new Map<string, string>();
      (adminsRes.data || []).forEach((a) => adminMap.set(a.id, a.email));

      // Group by editor
      const byEditor = new Map<string, { today: number; week: number; last: string | null }>();
      for (const row of logs) {
        const entry = byEditor.get(row.editor_id) || { today: 0, week: 0, last: null };
        entry.week++;
        if (new Date(row.edited_at) >= todayStart) entry.today++;
        if (!entry.last || row.edited_at > entry.last) entry.last = row.edited_at;
        byEditor.set(row.editor_id, entry);
      }

      const rows: EditorRow[] = [];
      byEditor.forEach((v, editorId) => {
        rows.push({
          email: adminMap.get(editorId) || editorId.slice(0, 8) + '…',
          editsToday: v.today,
          editsWeek: v.week,
          lastEdit: v.last,
        });
      });
      rows.sort((a, b) => b.editsWeek - a.editsWeek);
      setEditors(rows);

      // Chart: last 7 days
      const dayCounts = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setUTCDate(d.getUTCDate() - i);
        dayCounts.set(d.toISOString().split('T')[0], 0);
      }
      for (const row of logs) {
        const key = row.edited_at.split('T')[0];
        if (dayCounts.has(key)) dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
      }
      const bars: DayBar[] = [];
      dayCounts.forEach((count, date) => {
        const [, m, d] = date.split('-');
        bars.push({ label: `${d}/${m}`, count });
      });
      setChartData(bars);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <h2 className="text-xl font-bold text-foreground">דוח עורכים</h2>

      {editors.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">אין נתונים עדיין</div>
      ) : (
        <div className="glass-card p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">עורך</TableHead>
                <TableHead className="text-right">עריכות היום</TableHead>
                <TableHead className="text-right">עריכות השבוע</TableHead>
                <TableHead className="text-right">עריכה אחרונה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editors.map((e) => (
                <TableRow key={e.email}>
                  <TableCell className="font-medium">{e.email}</TableCell>
                  <TableCell>{e.editsToday}</TableCell>
                  <TableCell>{e.editsWeek}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {e.lastEdit
                      ? formatDistanceToNow(new Date(e.lastEdit), { addSuffix: true, locale: he })
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Bar chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">עריכות ב-7 ימים אחרונים</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ direction: 'rtl' }}
              labelFormatter={(l) => `תאריך: ${l}`}
              formatter={(v: number) => [`${v} עריכות`, '']}
            />
            <Bar dataKey="count" className="fill-primary" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
