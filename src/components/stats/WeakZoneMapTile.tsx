import AnimatedStatsTile from './AnimatedStatsTile';
import type { WeakZone } from './useStatsData';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';

interface Props {
  zones: WeakZone;
}

export default function WeakZoneMapTile({ zones }: Props) {
  const { data, startSession } = useApp();

  const startZoneSession = (ids: string[]) => {
    const questions = data.filter(q => ids.includes(q[KEYS.ID]));
    if (questions.length > 0) {
      startSession(questions, Math.min(questions.length, 20), 'practice');
    }
  };

  const zoneConfig = [
    { key: 'deadZone' as const, label: 'אזור מת', emoji: '🔴', color: 'bg-red-500/20 border-red-500/30 text-red-400', ids: zones.deadZone },
    { key: 'studiedNotLearned' as const, label: 'נלמד לא נרכש', emoji: '🟡', color: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400', ids: zones.studiedNotLearned },
    { key: 'mastered' as const, label: 'נרכש', emoji: '🟢', color: 'bg-green-500/20 border-green-500/30 text-green-400', ids: zones.mastered },
  ];

  return (
    <AnimatedStatsTile
      collapsed={
        <div className="p-5">
          <span className="text-xs text-muted-foreground font-medium">מפת חולשות</span>
          <div className="mt-3 space-y-2">
            {zoneConfig.map(z => (
              <div key={z.key} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${z.color}`}>
                <span className="text-xs font-medium">{z.emoji} {z.label}</span>
                <span className="text-sm font-bold">{z.ids.length}</span>
              </div>
            ))}
          </div>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-foreground mb-4">מפת חולשות — פירוט מלא</h3>
          {zoneConfig.map(z => (
            <div key={z.key} className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-sm text-foreground">{z.emoji} {z.label} ({z.ids.length})</h4>
                {z.ids.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); startZoneSession(z.ids); }}
                    className="text-xs bg-orange-500/20 text-orange-400 px-3 py-1 rounded-lg hover:bg-orange-500/30 transition font-medium"
                  >
                    התחל תרגול
                  </button>
                )}
              </div>
              {z.ids.length === 0 ? (
                <p className="text-xs text-muted-foreground">אין שאלות באזור זה</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                  {z.ids.slice(0, 20).map(id => {
                    const q = data.find(x => x[KEYS.ID] === id);
                    return (
                      <div key={id} className="text-[11px] text-muted-foreground truncate bg-muted/30 px-2 py-1 rounded">
                        {q ? q[KEYS.QUESTION].slice(0, 80) : id}
                      </div>
                    );
                  })}
                  {z.ids.length > 20 && <p className="text-[10px] text-muted-foreground/50 col-span-2">ועוד {z.ids.length - 20} שאלות...</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      }
    />
  );
}
