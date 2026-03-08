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
  uniqueQuestions: number;
  lastEdit: string | null;
}

interface DayBar {
  label: string;
  count: number;
}

interface TopicRow {
  topic: string;
  edits: number;
  unique: number;
}

interface RecentEdit {
  editor: string;
  questionId: string;
  fields: string[];
  time: string;
}

export default function EditorActivityTab() {
  const [editors, setEditors] = useState<EditorRow[]>([]);
  const [chartData, setChartData] = useState<DayBar[]>([]);
  const [topicRows, setTopicRows] = useState<TopicRow[]>([]);
  const [fieldCounts, setFieldCounts] = useState<{ field: string; count: number }[]>([]);
  const [recentEdits, setRecentEdits] = useState<RecentEdit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setUTCHours(0, 0, 0, 0);
      const weekAgo = new Date(todayStart);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

      const [logRes, adminsRes, questionsRes] = await Promise.all([
        supabase
          .from('question_edit_log')
          .select('editor_id, edited_at, question_id, fields_changed')
          .gte('edited_at', weekAgo.toISOString())
          .order('edited_at', { ascending: false }),
        supabase.from('admin_users').select('id, email'),
        supabase.from('questions').select('id, topic'),
      ]);

      const logs: { editor_id: string; edited_at: string; question_id: string | null; fields_changed: string[] }[] =
        (logRes.data as any) || [];
      const adminMap = new Map<string, string>();
      (adminsRes.data || []).forEach((a) => adminMap.set(a.id, a.email));

      const topicMap = new Map<string, string>();
      (questionsRes.data || []).forEach((q) => topicMap.set(q.id, q.topic || 'ללא נושא'));

      // --- Editor summary with unique questions ---
      const byEditor = new Map<string, { today: number; week: number; qids: Set<string>; last: string | null }>();
      for (const row of logs) {
        const entry = byEditor.get(row.editor_id) || { today: 0, week: 0, qids: new Set<string>(), last: null };
        entry.week++;
        if (new Date(row.edited_at) >= todayStart) entry.today++;
        if (row.question_id) entry.qids.add(row.question_id);
        if (!entry.last || row.edited_at > entry.last) entry.last = row.edited_at;
        byEditor.set(row.editor_id, entry);
      }

      const rows: EditorRow[] = [];
      byEditor.forEach((v, editorId) => {
        rows.push({
          email: adminMap.get(editorId) || editorId.slice(0, 8) + '…',
          editsToday: v.today,
          editsWeek: v.week,
          uniqueQuestions: v.qids.size,
          lastEdit: v.last,
        });
      });
      rows.sort((a, b) => b.editsWeek - a.editsWeek);
      setEditors(rows);

      // --- 7-day chart ---
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

      // --- Topic breakdown ---
      const byTopic = new Map<string, { edits: number; qids: Set<string> }>();
      for (const row of logs) {
        if (!row.question_id) continue;
        const topic = topicMap.get(row.question_id) || 'ללא נושא';
        const entry = byTopic.get(topic) || { edits: 0, qids: new Set<string>() };
        entry.edits++;
        entry.qids.add(row.question_id);
        byTopic.set(topic, entry);
      }
      const tRows: TopicRow[] = [];
      byTopic.forEach((v, topic) => tRows.push({ topic, edits: v.edits, unique: v.qids.size }));
      tRows.sort((a, b) => b.edits - a.edits);
      setTopicRows(tRows);

      // --- Fields changed ---
      const fMap = new Map<string, number>();
      for (const row of logs) {
        for (const f of row.fields_changed || []) {
          fMap.set(f, (fMap.get(f) || 0) + 1);
        }
      }
      const fArr = Array.from(fMap.entries())
        .map(([field, count]) => ({ field, count }))
        .sort((a, b) => b.count - a.count);
      setFieldCounts(fArr);

      // --- Recent edits (first 20, already sorted desc) ---
      setRecentEdits(
        logs.slice(0, 20).map((row) => ({
          editor: adminMap.get(row.editor_id) || row.editor_id.slice(0, 8) + '…',
          questionId: row.question_id || '—',
          fields: row.fields_changed || [],
          time: row.edited_at,
        }))
      );

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

  const fieldLabel: Record<string, string> = {
    question: 'טקסט שאלה',
    explanation: 'הסבר',
    correct: 'תשובה נכונה',
    options: 'אפשרויות',
    a: 'אפשרות א',
    b: 'אפשרות ב',
    c: 'אפשרות ג',
    d: 'אפשרות ד',
    topic: 'נושא',
    chapter: 'פרק',
  };

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
                <TableHead className="text-right">עריכות השבוע</TableHead>
                <TableHead className="text-right">שאלות ייחודיות</TableHead>
                <TableHead className="text-right">עריכה אחרונה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editors.map((e) => (
                <TableRow key={e.email}>
                  <TableCell className="font-medium">{e.email}</TableCell>
                  <TableCell>{e.editsToday}</TableCell>
                  <TableCell>{e.editsWeek}</TableCell>
                  <TableCell>{e.uniqueQuestions}</TableCell>
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

      {/* 7-day bar chart */}
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

      {/* Edits by topic */}
      {topicRows.length > 0 && (
        <div className="glass-card p-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">עריכות לפי נושא</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">נושא</TableHead>
                <TableHead className="text-right">עריכות</TableHead>
                <TableHead className="text-right">שאלות ייחודיות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topicRows.map((t) => (
                <TableRow key={t.topic}>
                  <TableCell className="font-medium">{t.topic}</TableCell>
                  <TableCell>{t.edits}</TableCell>
                  <TableCell>{t.unique}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Fields changed breakdown */}
      {fieldCounts.length > 0 && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">שדות שנערכו</h3>
          <div className="space-y-2">
            {fieldCounts.map((f) => {
              const maxCount = fieldCounts[0]?.count || 1;
              return (
                <div key={f.field} className="flex items-center gap-3">
                  <span className="text-sm w-28 text-foreground shrink-0">{fieldLabel[f.field] || f.field}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(f.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-8 text-left">{f.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent edits */}
      {recentEdits.length > 0 && (
        <div className="glass-card p-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">עריכות אחרונות</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">עורך</TableHead>
                <TableHead className="text-right">מזהה שאלה</TableHead>
                <TableHead className="text-right">שדות</TableHead>
                <TableHead className="text-right">זמן</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEdits.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium text-sm">{r.editor}</TableCell>
                  <TableCell className="text-xs font-mono">{r.questionId.slice(0, 12)}</TableCell>
                  <TableCell className="text-xs">
                    {r.fields.map((f) => fieldLabel[f] || f).join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDistanceToNow(new Date(r.time), { addSuffix: true, locale: he })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
