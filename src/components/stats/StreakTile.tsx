import { Flame } from 'lucide-react';

interface Props {
  streak: number;
}

export default function StreakTile({ streak }: Props) {
  return (
    <div className="bg-card dark:bg-[#141720] border border-border dark:border-white/[0.07] rounded-xl p-5 flex flex-col items-center justify-center min-h-[160px] gap-1">
      <Flame className="w-8 h-8 text-orange-500" />
      <div className="text-2xl font-black text-foreground">{streak}</div>
      <span className="text-[10px] text-muted-foreground/60">ימים רצופים 🔥</span>
    </div>
  );
}
