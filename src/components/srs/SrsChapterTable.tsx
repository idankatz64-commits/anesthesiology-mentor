import { useState } from 'react';
import type { ChapterRow } from './useSrsDashboard';

type SortKey = 'chapter' | 'totalInSrs' | 'due' | 'accuracy';

interface Props {
  chapters: ChapterRow[];
  onChapterClick?: (chapter: number) => void;
}

export function SrsChapterTable({ chapters, onChapterClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('chapter');
  const [asc, setAsc] = useState(true);

  const sorted = [...chapters].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    return asc ? (av - bv) : (bv - av);
  });

  const header = (key: SortKey, label: string) => (
    <th
      className="text-right p-2 cursor-pointer select-none"
      onClick={() => { if (sortKey === key) setAsc(!asc); else { setSortKey(key); setAsc(true); } }}
    >
      {label} {sortKey === key ? (asc ? '▲' : '▼') : ''}
    </th>
  );

  if (chapters.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground" dir="rtl">
        אין פרקים במעקב SRS.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 overflow-x-auto" dir="rtl">
      <div className="text-sm font-semibold mb-3">לפי פרק Miller</div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            {header('chapter', 'פרק')}
            {header('totalInSrs', 'סה״כ ב-SRS')}
            {header('due', 'ממתינות')}
            {header('accuracy', 'דיוק')}
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => (
            <tr
              key={c.chapter}
              className={`border-t ${onChapterClick ? 'cursor-pointer hover:bg-muted/50' : ''}`}
              onClick={() => onChapterClick?.(c.chapter)}
            >
              <td className="p-2">{c.chapter || '—'}</td>
              <td className="p-2">{c.totalInSrs}</td>
              <td className="p-2">{c.due}</td>
              <td className="p-2">{Math.round(c.accuracy * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
