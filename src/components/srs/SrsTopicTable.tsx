import type { TopicRow } from './useSrsDashboard';

interface Props {
  topics: TopicRow[];
  onTopicClick?: (topic: string) => void;
}

export function SrsTopicTable({ topics, onTopicClick }: Props) {
  if (topics.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" dir="rtl">
        אין נושאים במעקב SRS עדיין.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card p-4 overflow-x-auto" dir="rtl">
      <div className="text-sm font-semibold mb-3">Top 10 נושאים קריטיים</div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="text-right p-2">נושא</th>
            <th className="text-right p-2">באיחור</th>
            <th className="text-right p-2">דיוק</th>
            <th className="text-right p-2">ציון קריטיות</th>
          </tr>
        </thead>
        <tbody>
          {topics.map(t => (
            <tr
              key={t.topic}
              className={`border-t ${t.isCritical ? 'bg-red-50 dark:bg-red-950/20' : ''} ${onTopicClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
              onClick={() => onTopicClick?.(t.topic)}
            >
              <td className="p-2">{t.topic}</td>
              <td className="p-2">{t.overdue}</td>
              <td className="p-2">{Math.round(t.accuracy * 100)}%</td>
              <td className="p-2 font-semibold">{t.criticalScore.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
