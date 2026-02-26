import StatsTile from './StatsTile';

interface ChapterData {
  chapter: number;
  total: number;
  answered: number;
  pct: number;
}

interface Props {
  coverage: number;
  chapters: ChapterData[];
}

function getHeatColor(pct: number) {
  if (pct === 0) return 'bg-white/5';
  if (pct < 25) return 'bg-red-500/30';
  if (pct < 50) return 'bg-yellow-500/30';
  if (pct < 75) return 'bg-orange-500/40';
  return 'bg-green-500/40';
}

export default function CoverageTile({ coverage, chapters }: Props) {
  return (
    <StatsTile
      collapsed={
        <div className="p-5 flex flex-col justify-between min-h-[160px]">
          <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">כיסוי מאגר</span>
          <div className="text-2xl font-black text-white">{coverage}%</div>
          <div className="w-full bg-white/5 rounded-full h-2 mt-2">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
              style={{ width: `${coverage}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground/50 mt-1">מתוך כל השאלות במאגר</span>
        </div>
      }
      expanded={
        <div>
          <h3 className="text-lg font-bold text-white mb-2">כיסוי לפי פרק</h3>
          <p className="text-xs text-muted-foreground mb-4">כל ריבוע = פרק. צבע לפי אחוז השלמה.</p>
          <div className="grid grid-cols-10 gap-1.5">
            {chapters.map(ch => (
              <div
                key={ch.chapter}
                className={`aspect-square rounded-md flex items-center justify-center text-[9px] font-bold text-white/70 ${getHeatColor(ch.pct)}`}
                title={`פרק ${ch.chapter}: ${ch.pct}% (${ch.answered}/${ch.total})`}
              >
                {ch.chapter || '?'}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white/5 inline-block" /> 0%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500/30 inline-block" /> &lt;25%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-500/30 inline-block" /> &lt;50%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-500/40 inline-block" /> &lt;75%</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500/40 inline-block" /> 75%+</span>
          </div>
        </div>
      }
    />
  );
}
