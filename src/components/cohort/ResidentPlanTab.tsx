import { useState, useEffect, useRef } from "react";
import { Pencil, Upload, Download, ArrowUp, ArrowDown, Check, RotateCcw } from "lucide-react";
import Papa from "papaparse";
import type { PlanRotation } from "@/lib/cohortDetail";

const statusMeta = {
  completed: { cls: "bg-success/10 border-success/30", dot: "bg-success" },
  current: { cls: "bg-primary/10 border-primary/30", dot: "bg-primary" },
  upcoming: { cls: "bg-muted/20 border-border", dot: "bg-muted-foreground/50" },
} as const;

const TEMPLATE = `name,period,status,note
Neuro OR,Q1,completed,
Regional / Blocks,Q2,completed,
Cardiac & Thoracic,Q3,current,Shifted after 3-month reserve duty
Pediatric Anesthesia,Q4,upcoming,
Obstetric Anesthesia,Q5,upcoming,
ICU,Q6,upcoming,
`;

function parseStatus(s: string | undefined): PlanRotation["status"] {
  const v = (s || "").trim().toLowerCase();
  return v === "completed" || v === "current" || v === "upcoming" ? v : "upcoming";
}

const btnPrimary =
  "flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/15 text-primary border border-primary/25 hover:bg-primary/25 transition-colors";
const btnGhost =
  "flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted/30 text-muted-foreground border border-border hover:bg-muted/50 transition-colors";

/**
 * Training plan — read, edit, OR upload from a file.
 * The plan can be uploaded as CSV (columns: name, period, status, note) so a
 * coordinator or the program director can manage plans, not only the resident
 * through the app. In-app editing reorders rotations (the reserve-duty shift
 * scenario). Uploaded/edited plans persist to localStorage for this demo.
 */
export default function ResidentPlanTab({ plan, residentId }: { plan: PlanRotation[]; residentId: string }) {
  const storageKey = `cohort-plan-${residentId}`;
  const [rows, setRows] = useState<PlanRotation[]>(plan);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<"default" | "uploaded" | "edited">("default");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const p = JSON.parse(saved);
        if (Array.isArray(p) && p.length) {
          setRows(p);
          setSource(localStorage.getItem(`${storageKey}-src`) === "edited" ? "edited" : "uploaded");
          return;
        }
      } catch {
        /* fall through to default */
      }
    }
    setRows(plan);
    setSource("default");
  }, [storageKey, plan]);

  const persist = (next: PlanRotation[], src: "uploaded" | "edited") => {
    setRows(next);
    setSource(src);
    localStorage.setItem(storageKey, JSON.stringify(next));
    localStorage.setItem(`${storageKey}-src`, src);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = String(ev.target?.result || "");
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      const next: PlanRotation[] = parsed.data
        .filter((r) => (r.name ?? r.Name)?.trim())
        .map((r, i) => ({
          id: `${residentId}-up-${i}`,
          name: String(r.name ?? r.Name ?? "").trim(),
          period: String(r.period ?? r.Period ?? `Q${i + 1}`).trim(),
          status: parseStatus(r.status ?? r.Status),
          note: (r.note ?? r.Note ?? "").trim() || undefined,
        }));
      if (next.length) persist(next, "uploaded");
      else alert("Couldn't read any rotations from that file.\nExpected columns: name, period, status, note.");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "training-plan-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next, "edited");
  };

  const reset = () => {
    localStorage.removeItem(storageKey);
    localStorage.removeItem(`${storageKey}-src`);
    setRows(plan);
    setSource("default");
    setEditing(false);
  };

  return (
    <div className="glass-tile rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-foreground">Training Plan</h3>
          <p className="text-[11px] text-muted-foreground">
            Rotation schedule
            {source === "uploaded" ? " · uploaded from file" : source === "edited" ? " · edited in-app" : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onUpload} />
          <button onClick={() => fileRef.current?.click()} className={btnPrimary}>
            <Upload className="w-3 h-3" /> Upload CSV
          </button>
          <button onClick={downloadTemplate} className={btnGhost}>
            <Download className="w-3 h-3" /> Template
          </button>
          <button onClick={() => setEditing((v) => !v)} className={btnGhost}>
            {editing ? (
              <>
                <Check className="w-3 h-3" /> Done
              </>
            ) : (
              <>
                <Pencil className="w-3 h-3" /> Edit
              </>
            )}
          </button>
          {source !== "default" && (
            <button onClick={reset} className={btnGhost}>
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((rot, i) => {
          const m = statusMeta[rot.status];
          return (
            <div key={rot.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${m.cls}`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${m.dot}`} />
              <span className="text-xs font-semibold text-foreground flex-1">{rot.name}</span>
              {rot.note && <span className="text-[10px] text-warning">{rot.note}</span>}
              <span className="text-[10px] text-muted-foreground">{rot.period}</span>
              <span className="text-[10px] text-muted-foreground capitalize w-20 text-right">{rot.status}</span>
              {editing && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === rows.length - 1}
                    className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted/40 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3">
        Upload a plan as CSV (columns: name, period, status, note) — so a coordinator or the program director can manage
        plans, not only through the app. Saved locally for this demo.
      </p>
    </div>
  );
}
