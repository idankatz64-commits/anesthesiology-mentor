interface Props {
  coverage: number;
}

export default function CoverageTile({ coverage }: Props) {
  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-5 flex flex-col justify-between min-h-[160px]">
      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">כיסוי מאגר</span>
      <div className="text-2xl font-black text-foreground">{coverage}%</div>
      <div className="w-full bg-muted/30 rounded-full h-2 mt-2">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-700"
          style={{ width: `${coverage}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground/50 mt-1">מתוך כל השאלות במאגר</span>
    </div>
  );
}
