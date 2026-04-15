interface Props {
  questionId: string;
  disabled?: boolean;
  onConfirmed?: (questionId: string) => Promise<void>;
}

export function SrsMarkKnownButton({ questionId, disabled, onConfirmed }: Props) {
  const handleClick = async () => {
    if (disabled || !onConfirmed) return;
    const ok = window.confirm('לסמן כידוע? החזרה הבאה תידחה ב-30 יום. ניתן לבטל תוך 5 שניות.');
    if (!ok) return;
    await onConfirmed(questionId);
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? 'בשלב הבא' : 'סמן כידוע'}
      className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
    >
      ✓ ידוע
    </button>
  );
}
