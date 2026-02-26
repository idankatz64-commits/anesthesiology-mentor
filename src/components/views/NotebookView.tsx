import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { Search, Trash2 } from 'lucide-react';

export default function NotebookView() {
  const { data, progress, deleteNote, startSession } = useApp();
  const [searchTerm, setSearchTerm] = useState('');

  const noteIds = Object.keys(progress.notes);
  const filtered = noteIds.filter(id => {
    const qData = data.find(d => d[KEYS.ID] === id);
    if (!qData) return false;
    const noteText = progress.notes[id];
    if (!searchTerm) return true;
    const lower = searchTerm.toLowerCase();
    return noteText.toLowerCase().includes(lower) || qData[KEYS.QUESTION].toLowerCase().includes(lower);
  });

  const reviewFromNote = (id: string) => {
    const q = data.find(d => d[KEYS.ID] === id);
  };

  return (
    <div className="fade-in max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-8 text-foreground flex items-center gap-3">
        📝 המחברת שלי
      </h2>

      <div className="mb-8 relative">
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="חפש בתוך ההערות..."
          className="w-full p-4 pl-12 bg-card border border-border rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground transition"
        />
        <Search className="absolute left-5 top-5 w-4 h-4 text-muted-foreground" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-7xl mb-6 text-muted-foreground/30">😊</div>
          <p className="text-muted-foreground text-lg font-light">
            {noteIds.length === 0 ? 'המחברת ריקה.\nבזמן תרגול, לחץ על סמל הפתקית כדי לשמור סיכומים.' : 'לא נמצאו תוצאות.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map(id => {
            const qData = data.find(d => d[KEYS.ID] === id);
            if (!qData) return null;
            return (
              <div key={id} className="soft-card bg-card border border-border p-6 relative hover:shadow-lg hover-glow transition group card-accent-top">
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <button
                    onClick={() => { if (confirm('למחוק את ההערה?')) deleteNote(id); }}
                    className="text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs font-bold text-primary mb-2 matrix-text">#{id} | {qData[KEYS.TOPIC]}</div>
                <div
                  onClick={() => reviewFromNote(id)}
                  className="text-foreground font-medium mb-3 line-clamp-2 group-hover:text-primary transition cursor-pointer bidi-text"
                >
                  {qData[KEYS.QUESTION]}
                </div>
                <div className="bg-muted/50 p-4 rounded-xl border border-border text-sm text-foreground whitespace-pre-wrap font-light bidi-text">
                  {progress.notes[id]}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
