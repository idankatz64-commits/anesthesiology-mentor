import { useState, useEffect } from "react";
import { Save, Check } from "lucide-react";

/** Editable manager notes — persisted to localStorage for the demo (no backend). */
export default function ResidentNotesCard({ residentId }: { residentId: string }) {
  const storageKey = `cohort-notes-${residentId}`;
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(localStorage.getItem(storageKey) || "");
    setSaved(false);
  }, [storageKey]);

  const save = () => {
    localStorage.setItem(storageKey, text);
    setSaved(true);
  };

  return (
    <div className="glass-tile rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-foreground">Manager Notes</h3>
        <button
          onClick={save}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-primary/15 text-primary hover:bg-primary/25 transition-colors"
        >
          {saved ? (
            <>
              <Check className="w-3 h-3" /> Saved
            </>
          ) : (
            <>
              <Save className="w-3 h-3" /> Save
            </>
          )}
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSaved(false);
        }}
        placeholder="Add a private note about this resident…"
        className="w-full h-24 rounded-lg bg-background/50 border border-border/60 p-2.5 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-primary/40"
      />
      <p className="text-[10px] text-muted-foreground mt-1.5">Saved locally for this demo.</p>
    </div>
  );
}
