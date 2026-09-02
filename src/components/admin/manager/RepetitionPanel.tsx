import { useMemo } from "react";
import { Bar, BarChart, Cell, CartesianGrid, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Panel, Empty } from "@/components/admin/academy/chartKit";
import { axisTick, gridStroke } from "@/components/admin/academy/chartTokens";
import { accuracyPct, repetitionLift, type RepetitionRow } from "@/lib/managerReport";
import { MONO, accTone } from "./managerTokens";

interface Props {
  rows: RepetitionRow[];
  scope: "cohort" | "resident";
}

/**
 * עקומת החזרה: דיוק לפי מספר הפעמים שנענתה השאלה.
 * זה הגרף שמראה שהחזרה עובדת — הדלי הראשון הוא חשיפה ראשונה, האחרון הוא
 * שאלות שחזרו עליהן חמש פעמים ומעלה. הערך מודפס על כל עמודה, כך שהצבע
 * אף פעם לא נושא את המידע לבדו.
 */
export default function RepetitionPanel({ rows, scope }: Props) {
  const data = useMemo(
    () =>
      [...rows]
        .sort((a, b) => a.times_answered - b.times_answered)
        // דלי ריק אינו "0% הצלחה" אלא "אין נתון" — מסננים אותו במקום לצייר עמודה אדומה
        .filter((r) => r.questions > 0)
        .map((r) => ({
          bucket: r.times_answered >= 5 ? "5+" : String(r.times_answered),
          accuracy: accuracyPct(r.correct, r.questions) as number,
          questions: r.questions,
        })),
    [rows],
  );
  const lift = useMemo(() => repetitionLift(rows), [rows]);

  const subject = scope === "cohort" ? "המחזור" : "המתמחה";

  return (
    <Panel
      title="מה החזרה מוסיפה"
      hint={`דיוק על המצב העדכני, לפי מספר הפעמים ש${subject} נענה לאותה שאלה. המספר בסוגריים = כמה שאלות בכל דלי.`}
    >
      {data.length === 0 ? (
        <Empty>אין עדיין מספיק חזרות כדי לצייר את העקומה.</Empty>
      ) : (
        <>
          {lift.lift !== null && (
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-4xl font-black" style={{ ...MONO, color: accTone(lift.last) }}>
                {lift.lift > 0 ? "+" : ""}
                {lift.lift}
              </span>
              <span className="text-sm text-muted-foreground">
                נקודות בין חשיפה ראשונה ({lift.first}%) לשאלות שחזרו עליהן ({lift.last}%)
              </span>
            </div>
          )}
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke={gridStroke} vertical={false} />
              <XAxis dataKey="bucket" tick={axisTick} tickLine={false} axisLine={false} reversed />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} domain={[0, 100]} unit="%" />
              <Bar dataKey="accuracy" radius={[4, 4, 0, 0]} maxBarSize={54}>
                {data.map((d) => (
                  <Cell key={d.bucket} fill={accTone(d.accuracy)} />
                ))}
                <LabelList
                  dataKey="accuracy"
                  position="top"
                  formatter={(v: number) => `${v}%`}
                  style={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 700 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1" dir="rtl">
            {data.map((d) => (
              <span key={d.bucket} style={MONO}>
                ({d.questions.toLocaleString("he-IL")})
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
            ציר ה-X = מספר החזרות על השאלה, לא ציר זמן.
          </p>
        </>
      )}
    </Panel>
  );
}
