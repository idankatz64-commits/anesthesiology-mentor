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
  totalEdits: number;
  topicsToday: string;
}

interface DayBar {
  label: string;
  date: string;
  count: number;
  topics: string;
}

export default function EditorActivityTab() {
  const [editors, setEditors] = useState<EditorRow[]>([]);
  const [chartData, setChartData] = useState<DayBar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const weekAgo = new Date(todayStart);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

      const [allLogsRes, adminsRes, questionsRes] = await Promise.all([
        supabase
          .from('question_edit_log')
          .select('editor_id, edited_at, question_id')
          .order('edited_at', { ascending: false }),
        supabase.from('admin_users').select('id, email'),
        supabase.from('questions').select('id, topic'),
      ]);

      const allLogs: { editor_id: string; edited_at: string; question_id: string | null }[] =
        (allLogsRes.data as any) || [];
      const adminMap = new Map<string, string>();
      (adminsRes.data || []).forEach((a) => adminMap.set(a.id, a.email));

      const topicMap = new Map<string, string>();
      (questionsRes.data || []).forEach((q) => topicMap.set(q.id, q.topic || 'ללא נושא'));

      // --- Editor summary ---
      const byEditor = new Map<string, { total: number; today: number; topicsToday: Set<string> }>();
      for (const row of allLogs) {
        const entry = byEditor.get(row.editor_id) || { total: 0, today: 0, topicsToday: new Set<string>() };
        entry.total++;
        if (new Date(row.edited_at) >= todayStart) {
          entry.today++;
          if (row.question_id) {
            const topic = topicMap.get(row.question_id);
            if (topic) entry.topicsToday.add(topic);
          }
        }
        byEditor.set(row.editor_id, entry);
      }

      const rows: EditorRow[] = [];
      byEditor.forEach((v, editorId) => {
        rows.push({
          email: adminMap.get(editorId) || editorId.slice(0, 8) + '…',
          editsToday: v.today,
          totalEdits: v.total,
          topicsToday: v.topicsToday.size > 0 ? Array.from(v.topicsToday).join(', ') : '—',
        });
      });
      rows.sort((a, b) => b.totalEdits - a.totalEdits);
      setEditors(rows);

      // --- 7-day chart with topic tooltips ---
      const recentLogs = allLogs.filter((r) => new Date(r.edited_at) >= weekAgo);
      const dayData = new Map<string, { count: number; topics: Set<string> }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(todayStart);
        d.setUTCDate(d.getUTCDate() - i);
        dayData.set(d.toISOString().split('T')[0], { count: 0, topics: new Set() });
      }
      for (const row of recentLogs) {
        const key = row.edited_at.split('T')[0];
        const entry = dayData.get(key);
        if (entry) {
          entry.count++;
          if (row.question_id) {
            const topic = topicMap.get(row.question_id);
            if (topic) entry.topics.add(topic);
          }
        }
      }
      const bars: DayBar[] = [];
      dayData.forEach(({ count, topics }, date) => {
        const [, m, d] = date.split('-');
        bars.push({ label: `${d}/${m}`, date, count, topics: topics.size > 0 ? Array.from(topics).join(', ') : '—' });
      });
      setChartData(bars);

      setLoading(false);
    };
    load();
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

      {/* Editor summary table */}
      {editors.length === 0 ? (
        <div className="glass-card p-8 text-center text-muted-foreground">אין נתונים עדיין</div>
      ) : (
        <div className="glass-card p-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">עורך</TableHead>
                <TableHead className="text-right">עריכות היום</TableHead>
                <TableHead className="text-right">סה"כ עריכות</TableHead>
                <TableHead className="text-right">נושאים שנערכו היום</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editors.map((e) => (
                <TableRow key={e.email}>
                  <TableCell className="font-medium">{e.email}</TableCell>
                  <TableCell>{e.editsToday}</TableCell>
                  <TableCell>{e.totalEdits}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{e.topicsToday}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 7-day bar chart */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">עריכות ב-7 ימים אחרונים</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ direction: 'rtl', textAlign: 'right' }}
              labelFormatter={(l) => `תאריך: ${l}`}
              formatter={(v: number, _name: string, props: any) => [
                `${v} עריכות`,
                `נושאים: ${props.payload.topics}`,
              ]}
            />
            <Bar dataKey="count" className="fill-primary" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
