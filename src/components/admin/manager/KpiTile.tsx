import AnimatedNumber from "@/components/AnimatedNumber";
import { MONO } from "./managerTokens";

interface Props {
  value: number | null;
  label: string;
  suffix?: string;
  tone?: string;
  hint?: string;
  /** ערך שסימנו הוא המידע (מגמה, רווח) — מוצג עם +/- מפורש ובכיוון LTR */
  signed?: boolean;
}

/**
 * אריח מדד. אותה שפה כמו מסך הסטטיסטיקה של המתמחה (deep-tile + מספר מונפש
 * בפונט מונו), כדי ששני הדשבורדים ייקראו כמוצר אחד.
 */
export default function KpiTile({ value, label, suffix, tone, hint, signed }: Props) {
  return (
    <div className="deep-tile rounded-2xl p-4 text-center">
      <div className="text-[11px] text-muted-foreground mb-1.5 leading-tight">{label}</div>
      {value === null ? (
        <div className="text-3xl font-black text-muted-foreground" style={MONO}>
          —
        </div>
      ) : (
        <span dir="ltr" className="inline-flex items-baseline justify-center">
          {signed && value > 0 && (
            <span className="text-3xl font-black" style={{ ...MONO, color: tone ?? "hsl(var(--foreground))" }}>
              +
            </span>
          )}
          <AnimatedNumber
            value={value}
            suffix={suffix}
            className="text-3xl font-black"
            style={{ ...MONO, color: tone ?? "hsl(var(--foreground))" }}
          />
        </span>
      )}
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-1 leading-tight">{hint}</div>}
    </div>
  );
}
