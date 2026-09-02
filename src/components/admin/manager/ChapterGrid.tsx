import { useMemo, useState } from "react";
import { Panel, Empty } from "@/components/admin/academy/chartKit";
import { accuracyPct, type CohortChapterRow } from "@/lib/managerReport";
import { MONO, TONE, accTone } from "./managerTokens";

interface Props {
  rows: CohortChapterRow[];
  /** מתחת לזה אין מספיק מענים כדי לקרוא לזה תמונה */
  minSeen?: number;
}

/**
 * כל הפרקים במבט אחד, במקום רשימת שלושת החזקים ושלושת החלשים.
 * הצבע מסמן טווח, אבל **האחוז מודפס בכל תא** — כך שהמידע נגיש גם למי
 * שלא מבחין בין הירוק לכתום, וגם בהדפסה בשחור-לבן.
 */
export default function ChapterGrid({ rows, minSeen = 30 }: Props) {
  const [showThin, setShowThin] = useState(false);

  const cells = useMemo(
    () =>
      [...rows]
        .map((c) => ({ ...c, pct: accuracyPct(c.current_correct, c.seen) }))
        .filter((c) => c.pct !== null && (showThin || c.seen >= minSeen))
        .sort((a, b) => a.chapter - b.chapter),
    [rows, minSeen, showThin],
  );

  const thin = rows.filter((c) => c.seen < minSeen).length;

  return (
    <Panel
      title="מפת הפרקים של המחזור"
      hint={`דיוק קבוצתי לכל פרק. ${thin > 0 ? `${thin} פרקים עם פחות מ-${minSeen} מענים מוסתרים כברירת מחדל.` : ""}`}
    >
      {cells.length === 0 ? (
        <Empty>אין עדיין מספיק מענים פר פרק.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-2">
            {cells.map((c) => (
              <div
                key={c.chapter}
                title={`פרק ${c.chapter} — ${c.topic} · ${c.seen.toLocaleString("he-IL")} מענים`}
                className="rounded-xl p-2.5 border transition-colors"
                style={{
                  borderColor: `${accTone(c.pct)}55`,
                  background: `${accTone(c.pct)}14`,
                }}
              >
                <div className="text-[10px] text-muted-foreground leading-none mb-1" dir="ltr">
                  Ch. {c.chapter}
                </div>
                <div className="text-lg font-black leading-none" style={{ ...MONO, color: accTone(c.pct) }} dir="ltr">
                  {c.pct}%
                </div>
                <div className="text-[9px] text-muted-foreground/80 truncate mt-1" dir="ltr" title={c.topic}>
                  {c.topic}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TONE.good }} /> 75% ומעלה
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TONE.watch }} /> 60–74%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: TONE.low }} /> מתחת ל-60%
            </span>
            {thin > 0 && (
              <button
                type="button"
                onClick={() => setShowThin((v) => !v)}
                className="ms-auto underline hover:text-foreground"
              >
                {showThin ? "הסתר פרקים דלי-נתונים" : `הצג גם ${thin} פרקים דלי-נתונים`}
              </button>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
