interface Props {
  questionId: string;
  disabled?: boolean;
  onConfirmed?: (questionId: string) => Promise<void>;
}

export function SrsMarkKnownButton({ questionId, disabled, onConfirmed }: Props) {
  const handleClick = () => {
    if (disabled || !onConfirmed) return;
    void onConfirmed(questionId);
  };
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? 'בשלב הבא' : 'סמן כידוע — נדחה ב-30 יום, ניתן לבטל'}
      className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed hover:bg-muted"
    >
      ✓ ידוע
    </button>
  );
}
