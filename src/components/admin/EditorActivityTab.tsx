import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';

function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

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

interface Props {
  isActive?: boolean;
}

export default function EditorActivityTab({ isActive = true }: Props) {
  const [editors, setEditors] = useState<EditorRow[]>([]);
  const [chartData, setChartData] = useState<DayBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const todayStr = toIsraelDateStr(new Date());

    const [allLogsRes, adminsRes, questionsRes] = await Promise.all([
      supabase
        .from('question_edit_log')
        .select('editor_id, edited_at, question_id')
        .order('edited_at', { ascending: false })
        .limit(5000),
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
      const rowDateStr = toIsraelDateStr(new Date(row.edited_at));
      if (rowDateStr === todayStr) {
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

    // --- 7-day chart ---
    const dayData = new Map<string, { count: number; topics: Set<string> }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dayData.set(toIsraelDateStr(d), { count: 0, topics: new Set() });
    }
    for (const row of allLogs) {
      const key = toIsraelDateStr(new Date(row.edited_at));
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
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (isActive) {
      load();
    }
  }, [isActive, load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">דוח עורכים</h2>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          רענן
        </Button>
      </div>

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
