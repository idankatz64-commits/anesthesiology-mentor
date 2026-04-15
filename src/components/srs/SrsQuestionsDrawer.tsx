import type { PendingQuestion } from './useSrsDashboard';
import { SrsMarkKnownButton } from './SrsMarkKnownButton';

interface Props {
  open: boolean;
  title: string;
  questions: PendingQuestion[];
  onClose: () => void;
  markKnownDisabled?: boolean;
  onMarkKnown?: (id: string) => Promise<void>;
  onStart?: () => void;
  startDisabled?: boolean;
}

export function SrsQuestionsDrawer({
  open,
  title,
  questions,
  onClose,
  markKnownDisabled,
  onMarkKnown,
  onStart,
  startDisabled,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-full max-w-md bg-card border-l overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {onStart && (
          <button
            onClick={onStart}
            disabled={startDisabled || questions.length === 0}
            className="w-full mb-3 rounded-lg border bg-primary/10 hover:bg-primary/20 px-3 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ▶ התחל סשן ({questions.length} שאלות)
          </button>
        )}

        {questions.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין שאלות להצגה.</p>
        ) : (
          <ul className="space-y-2">
            {questions.map((q) => (
              <li key={q.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{q.questionShort || q.refId}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {q.topic} · פרק {q.chapter || '—'}
                      {q.daysOverdue > 0 && <span className="text-red-600"> · באיחור {q.daysOverdue} ימים</span>}
                    </div>
                  </div>
                  <SrsMarkKnownButton
                    questionId={q.id}
                    disabled={markKnownDisabled}
                    onConfirmed={onMarkKnown}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
