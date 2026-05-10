import { useState } from "react";
import DOMPurify from "dompurify";
import { useApp } from "@/contexts/AppContext";
import { KEYS } from "@/lib/types";
import { Search, Trash2, Star, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TabKey = "notes" | "favorites";

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;
const OPTION_KEYS: Record<(typeof OPTION_LETTERS)[number], string> = {
  A: KEYS.A,
  B: KEYS.B,
  C: KEYS.C,
  D: KEYS.D,
};

export default function NotebookView() {
  const { data, progress, deleteNote, toggleFavorite, startSession } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("notes");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);

  const noteIds = Object.keys(progress.notes);
  const favoriteIds = progress.favorites;
  const lowerSearch = searchTerm.toLowerCase();

  const filteredNotes = noteIds.filter((id) => {
    const qData = data.find((d) => d[KEYS.ID] === id);
    if (!qData) return false;
    const noteText = progress.notes[id];
    if (!searchTerm) return true;
    return noteText.toLowerCase().includes(lowerSearch) || qData[KEYS.QUESTION].toLowerCase().includes(lowerSearch);
  });

  const filteredFavorites = favoriteIds.filter((id) => {
    const qData = data.find((d) => d[KEYS.ID] === id);
    if (!qData) return false;
    if (!searchTerm) return true;
    return (
      qData[KEYS.QUESTION].toLowerCase().includes(lowerSearch) ||
      (qData[KEYS.TOPIC] || "").toLowerCase().includes(lowerSearch)
    );
  });

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "notes", label: "📝 הערות", count: noteIds.length },
    { key: "favorites", label: "⭐ שאלות מסומנות", count: favoriteIds.length },
  ];

  const selectedQuestion = selectedQuestionId ? data.find((d) => d[KEYS.ID] === selectedQuestionId) : null;
  const correctAns = selectedQuestion ? selectedQuestion[KEYS.CORRECT] : "";
  const selectedNote = selectedQuestionId ? progress.notes[selectedQuestionId] : "";
  const selectedExplanation = selectedQuestion ? selectedQuestion[KEYS.EXPLANATION] : "";

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6 text-foreground flex items-center gap-3">📝 המחברת שלי</h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
              activeTab === t.key
                ? "bg-primary/10 text-primary border-primary/30"
                : "bg-card text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div className="mb-8 relative">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={activeTab === "notes" ? "חפש בתוך ההערות..." : "חפש בתוך השאלות המסומנות..."}
          className="w-full p-4 pl-12 bg-card border border-border rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground transition"
        />
        <Search className="absolute left-5 top-5 w-4 h-4 text-muted-foreground" />
      </div>

      {activeTab === "notes" &&
        (filteredNotes.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-7xl mb-6 text-muted-foreground/30">😊</div>
            <p className="text-muted-foreground text-lg font-light">
              {noteIds.length === 0
                ? "המחברת ריקה.\nבזמן תרגול, לחץ על סמל הפתקית כדי לשמור סיכומים."
                : "לא נמצאו תוצאות."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredNotes.map((id) => {
              const qData = data.find((d) => d[KEYS.ID] === id);
              if (!qData) return null;
              return (
                <div key={id} className="deep-tile p-6 relative group card-accent-top">
                  <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("למחוק את ההערה?")) deleteNote(id);
                      }}
                      className="text-muted-foreground hover:text-destructive transition"
                      aria-label="מחק הערה"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs font-bold text-primary mb-2 matrix-text">
                    #{id} | {qData[KEYS.TOPIC]}
                  </div>
                  <div
                    onClick={() => setSelectedQuestionId(id)}
                    className="text-foreground font-medium mb-3 line-clamp-2 group-hover:text-primary transition cursor-pointer bidi-text"
                  >
                    {qData[KEYS.QUESTION]}
                  </div>
                  <div
                    onClick={() => setSelectedQuestionId(id)}
                    className="rich-content bg-muted/50 p-4 rounded-xl border border-border text-sm text-foreground whitespace-pre-wrap font-light bidi-text cursor-pointer hover:border-primary/40 transition"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(progress.notes[id]) }}
                  />
                </div>
              );
            })}
          </div>
        ))}

      {activeTab === "favorites" &&
        (filteredFavorites.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-7xl mb-6 text-muted-foreground/30">⭐</div>
            <p className="text-muted-foreground text-lg font-light">
              {favoriteIds.length === 0
                ? "אין שאלות מסומנות.\nבזמן תרגול, לחץ על סמל הכוכב כדי לסמן שאלה לחזרה."
                : "לא נמצאו תוצאות."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredFavorites.map((id) => {
              const qData = data.find((d) => d[KEYS.ID] === id);
              if (!qData) return null;
              const millerLabel = qData[KEYS.MILLER] ? ` | ${qData[KEYS.MILLER]}` : "";
              return (
                <div
                  key={id}
                  onClick={() => setSelectedQuestionId(id)}
                  className="deep-tile p-6 relative group card-accent-top cursor-pointer hover:border-primary/40 transition"
                >
                  <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm("להסיר את הסימון מהשאלה?")) toggleFavorite(id);
                      }}
                      className="text-warning hover:text-destructive transition"
                      title="הסר סימון"
                      aria-label="הסר סימון"
                    >
                      <Star className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                  <div className="text-xs font-bold text-primary mb-2 matrix-text">
                    #{id} | {qData[KEYS.TOPIC]}
                    {millerLabel}
                  </div>
                  <div className="text-foreground font-medium bidi-text whitespace-pre-wrap group-hover:text-primary transition">
                    {qData[KEYS.QUESTION]}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      <Dialog open={!!selectedQuestionId} onOpenChange={(open) => !open && setSelectedQuestionId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedQuestion && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-primary matrix-text text-right">
                  #{selectedQuestion[KEYS.ID]} | {selectedQuestion[KEYS.TOPIC]}
                  {selectedQuestion[KEYS.MILLER] ? ` | ${selectedQuestion[KEYS.MILLER]}` : ""}
                </DialogTitle>
              </DialogHeader>

              <div className="text-foreground text-base font-medium mt-2 mb-2 bidi-text whitespace-pre-wrap leading-relaxed">
                {selectedQuestion[KEYS.QUESTION]}
              </div>

              <div className="space-y-2 mt-4">
                {OPTION_LETTERS.map((letter) => {
                  const text = selectedQuestion[OPTION_KEYS[letter]];
                  if (!text) return null;
                  const isCorrect = correctAns === letter;
                  return (
                    <div
                      key={letter}
                      className={`p-3 rounded-xl border-2 flex items-start gap-3 ${
                        isCorrect
                          ? "border-success/60 bg-success/8 text-foreground"
                          : "border-border/40 bg-transparent opacity-80"
                      }`}
                    >
                      <span
                        className={`w-7 h-7 rounded-lg border font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                          isCorrect ? "border-success/60 text-success" : "border-border/60 text-muted-foreground"
                        }`}
                      >
                        {letter}
                      </span>
                      <span className="flex-grow text-foreground text-sm leading-relaxed bidi-text">{text}</span>
                      {isCorrect && <span className="text-success text-xl shrink-0">✓</span>}
                    </div>
                  );
                })}
              </div>

              {selectedExplanation && selectedExplanation.trim().length > 0 && (
                <div className="mt-6">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">הסבר</h4>
                  <div
                    className="rich-content bg-muted/30 p-4 rounded-xl border border-border text-sm text-foreground whitespace-pre-wrap font-light bidi-text leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(selectedExplanation),
                    }}
                  />
                </div>
              )}

              {selectedNote && selectedNote.trim().length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
                    📝 הערה אישית
                  </h4>
                  <div
                    className="rich-content bg-primary/5 p-4 rounded-xl border border-primary/20 text-sm text-foreground whitespace-pre-wrap font-light bidi-text"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedNote) }}
                  />
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
