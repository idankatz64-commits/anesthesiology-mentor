import { useState } from 'react';
import type { SessionFilter, TopicRow } from './useSrsDashboard';

interface Props {
  topics: TopicRow[];
  disabled?: boolean;
  onStart?: (filter: SessionFilter, count: number | 'all', smart: boolean) => void;
}

const PRESETS: Array<number | 'all'> = [10, 30, 50, 'all'];

export function SrsActionPanel({ topics, disabled, onStart }: Props) {
  const [topic, setTopic] = useState<string>('');
  const [smart, setSmart] = useState<boolean>(false);

  const tooltip = disabled ? 'בשלב הבא' : undefined;

  const build = (): SessionFilter =>
    topic ? { kind: 'topic', topic } : { kind: 'all' };

  return (
    <div className="rounded-xl border bg-card p-4 flex flex-wrap items-center gap-3" dir="rtl">
      <span className="text-sm font-semibold">התחל סשן:</span>
      {PRESETS.map((c) => (
        <button
          key={String(c)}
          disabled={disabled}
          title={tooltip}
          onClick={() => onStart?.(build(), c, smart)}
          className="rounded-lg border px-3 py-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
        >
          {c === 'all' ? 'כל הממתינות' : `${c} שאלות`}
        </button>
      ))}
      <label className="flex items-center gap-2 text-sm mr-2" title="ממיין לפי דחיפות (איחור גדול יותר קודם)">
        <input
          type="checkbox"
          disabled={disabled}
          checked={smart}
          onChange={(e) => setSmart(e.target.checked)}
        />
        אלגוריתם חכם
      </label>
      <select
        disabled={disabled}
        className="rounded-lg border px-2 py-1 text-sm"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      >
        <option value="">כל הנושאים</option>
        {topics.map((t) => (
          <option key={t.topic} value={t.topic}>
            {t.topic}
          </option>
        ))}
      </select>
    </div>
  );
}
