import { Fragment, useMemo, useState } from "react";
import { ArrowUpDown, ChevronDown, Search } from "lucide-react";
import { accuracyPct, type MemberChapterRow } from "@/lib/managerReport";
import { MONO, TONE, accTone } from "./managerTokens";

type SortKey = "chapter" | "seen" | "answered_total" | "first" | "current" | "lift";
type Lang = "he" | "en";

const L: Record<Lang, Record<string, string>> = {
  he: {
    title: "ביצועים לפי פרק (מילר)",
    search: "חיפוש פרק…",
    chapter: "פרק",
    seen: "כוסו",
    answers: "מענים",
    first: "חשיפה ראשונה",
    current: "מצב עדכני",
    lift: "מה החזרה הוסיפה",
    none: "לא נמצאו פרקים תואמים.",
    repeats: "חזרות בממוצע לשאלה",
    ofChapter: "מהפרק",
    hint: "לחיצה על שורה פותחת פירוט. מיון בלחיצה על כותרת עמודה.",
  },
  en: {
    title: "Performance by chapter (Miller)",
    search: "Search chapter…",
    chapter: "Chapter",
    seen: "Covered",
    answers: "Answers",
    first: "First exposure",
    current: "Current state",
    lift: "Gain from repetition",
    none: "No matching chapters.",
    repeats: "average repeats per question",
    ofChapter: "of chapter",
    hint: "Click a row for detail. Click a column header to sort.",
  },
};

interface Row extends MemberChapterRow {
  first: number | null;
  current: number | null;
  lift: number | null;
}

interface Props {
  chapters: MemberChapterRow[];
  lang: Lang;
}

/** פס עדין מאחורי המספר — מייצר סריקה אנכית מהירה בלי גריד כבד */
function Bar({ pct, tone }: { pct: number | null; tone: string }) {
  return (
    <div className="flex items-center gap-2" dir="ltr">
      <div className="h-1.5 w-14 rounded-full bg-muted/60 overflow-hidden shrink-0">
        <div className="h-full rounded-full" style={{ width: `${pct ?? 0}%`, background: tone }} />
      </div>
      <span className="tabular-nums font-bold text-xs w-9" style={{ ...MONO, color: tone }}>
        {pct === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

/**
 * טבלת הפרקים של הדוח האישי. נבנתה בשפה של TopicPerformanceTable מהאפליקציה
 * (חיפוש, מיון, פסי צבע, שורות נפתחות) אבל על נתוני הדוח, ולא ע"י נגיעה
 * בטבלה החיה של המתמחים — היא קשורה לנתוני המשתמש המחובר, ושינוי בה היה
 * מסכן מסך שכבר עובד.
 */
export default function ChapterTable({ chapters, lang }: Props) {
  const t = L[lang];
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [asc, setAsc] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      chapters.map((c) => {
        const first = accuracyPct(c.first_correct, c.first_seen);
        const current = accuracyPct(c.current_correct, c.seen);
        return { ...c, first, current, lift: first !== null && current !== null ? current - first : null };
      }),
    [chapters],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => r.topic.toLowerCase().includes(needle) || String(r.chapter).includes(needle))
      : rows;
    const val = (r: Row) => {
      const v = r[sortKey];
      return v === null || v === undefined ? -Infinity : (v as number);
    };
    return [...filtered].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)));
  }, [rows, q, sortKey, asc]);

  const head = (key: SortKey, label: string) => (
    <th className="p-3 font-medium">
      <button
        type="button"
        onClick={() => {
          if (sortKey === key) setAsc((v) => !v);
          else {
            setSortKey(key);
            setAsc(true);
          }
        }}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          sortKey === key ? "text-foreground font-semibold" : ""
        }`}
      >
        {label}
        <ArrowUpDown className="w-3 h-3 opacity-60" />
      </button>
    </th>
  );

  return (
    <section className="deep-tile rounded-2xl">
      <div className="p-5 pb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold">{t.title}</h3>
        <div className="relative no-print">
          <Search className="w-3.5 h-3.5 absolute top-1/2 -translate-y-1/2 start-2.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.search}
            className="text-xs rounded-full ps-8 pe-3 py-1.5 border border-border bg-background text-foreground w-44 focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr
              className={`border-b border-border text-xs text-muted-foreground ${lang === "he" ? "text-right" : "text-left"}`}
            >
              {head("chapter", t.chapter)}
              {head("seen", t.seen)}
              {head("answered_total", t.answers)}
              {head("first", t.first)}
              {head("current", t.current)}
              {head("lift", t.lift)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.chapter}>
                <tr
                  onClick={() => setOpen(open === r.chapter ? null : r.chapter)}
                  className="border-b border-border/40 hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <ChevronDown
                        className={`w-3 h-3 text-muted-foreground transition-transform no-print ${
                          open === r.chapter ? "rotate-180" : ""
                        }`}
                      />
                      <span dir="ltr" className="truncate max-w-[22rem] inline-block align-middle">
                        Ch. {r.chapter} — {r.topic}
                      </span>
                    </div>
                  </td>
                  <td className="p-3 tabular-nums" style={MONO} dir="ltr">
                    {r.seen}
                  </td>
                  <td className="p-3 tabular-nums text-muted-foreground" style={MONO} dir="ltr">
                    {r.answered_total}
                  </td>
                  <td className="p-3">
                    <Bar pct={r.first} tone={accTone(r.first)} />
                  </td>
                  <td className="p-3">
                    <Bar pct={r.current} tone={accTone(r.current)} />
                  </td>
                  <td className="p-3 tabular-nums font-bold" style={MONO} dir="ltr">
                    <span style={{ color: r.lift !== null && r.lift > 0 ? TONE.good : "hsl(var(--muted-foreground))" }}>
                      {r.lift === null ? "—" : `${r.lift > 0 ? "+" : ""}${r.lift}`}
                    </span>
                  </td>
                </tr>
                {open === r.chapter && (
                  <tr className="border-b border-border/40 bg-muted/20 no-print">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t.repeats}:{" "}
                          <b className="text-foreground" style={MONO} dir="ltr">
                            {r.seen ? (r.answered_total / r.seen).toFixed(1) : "—"}
                          </b>
                        </span>
                        <span dir="ltr">
                          {r.first_correct}/{r.first_seen} {t.first}
                        </span>
                        <span dir="ltr">
                          {r.current_correct}/{r.seen} {t.current}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="text-sm text-muted-foreground p-6 text-center">{t.none}</p>}
      </div>
      <p className="text-[11px] text-muted-foreground px-5 pb-4 pt-2 no-print">{t.hint}</p>
    </section>
  );
}
