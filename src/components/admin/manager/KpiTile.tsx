import { TrendingDown, TrendingUp } from "lucide-react";
import AnimatedNumber from "@/components/AnimatedNumber";
import { MONO } from "./managerTokens";

interface Props {
  value: number | null;
  label: string;
  suffix?: string;
  tone?: string;
  /** שינוי מול התקופה הקודמת, בנקודות */
  delta?: number | null;
  deltaSuffix?: string;
  hint?: string;
}

/**
 * אריח מדד. אותה שפה כמו מסך הסטטיסטיקה של המתמחה (deep-tile + מספר מונפש
 * בפונט מונו), כדי ששני הדשבורדים ייקראו כמוצר אחד.
 */
export default function KpiTile({ value, label, suffix, tone, delta, deltaSuffix, hint }: Props) {
  return (
    <div className="deep-tile rounded-2xl p-4 text-center">
      <div className="text-[11px] text-muted-foreground mb-1.5 leading-tight">{label}</div>
      {value === null ? (
        <div className="text-3xl font-black text-muted-foreground" style={MONO}>
          —
        </div>
      ) : (
        <AnimatedNumber
          value={value}
          suffix={suffix}
          className="text-3xl font-black"
          style={{ ...MONO, color: tone ?? "hsl(var(--foreground))" }}
        />
      )}
      {delta !== null && delta !== undefined && (
        <div
          className="flex items-center justify-center gap-1 mt-1 text-[10px] font-bold"
          style={{ color: delta >= 0 ? "#10B981" : "#E11D48" }}
        >
          {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          <span dir="ltr">
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaSuffix ?? ""}
          </span>
        </div>
      )}
      {hint && <div className="text-[10px] text-muted-foreground/70 mt-1 leading-tight">{hint}</div>}
    </div>
  );
}
