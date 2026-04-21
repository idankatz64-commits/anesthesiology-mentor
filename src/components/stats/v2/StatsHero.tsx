import { Button } from '@/components/ui/button'
import { useStatsData } from '@/components/stats/useStatsData'
import { useApp } from '@/contexts/AppContext'
import { useRecommendations } from '@/hooks/useRecommendations'

import { ERIRing } from './ERIRing'

const SESSION_TARGET = 15

export function StatsHero(): JSX.Element {
  const { hero } = useRecommendations()
  const { eri } = useStatsData()
  const { questions, startSession } = useApp()

  if (!hero) {
    return (
      <section
        className="rounded-xl border p-4 md:p-6 flex flex-col md:flex-row items-center gap-4"
        dir="rtl"
      >
        <ERIRing score={eri.value} />
        <p className="text-muted-foreground text-sm md:text-base">
          עוד אין מספיק נתונים להמלצה. התחל בתרגול.
        </p>
      </section>
    )
  }

  const pool = questions.filter((q) => q.topic === hero.topic)
  const handleStart = () => {
    startSession(pool, Math.min(pool.length, SESSION_TARGET), 'practice')
  }

  return (
    <section
      className="rounded-xl border p-4 md:p-6 flex flex-col md:flex-row items-center gap-4"
      dir="rtl"
    >
      <ERIRing score={eri.value} />
      <div className="flex-1 text-center md:text-right">
        <p className="text-sm text-muted-foreground">הפעולה הכי חשובה עכשיו:</p>
        <h2 className="text-lg md:text-xl font-semibold mt-1 leading-tight">
          לתרגל {hero.topic}
        </h2>
      </div>
      <Button
        size="lg"
        className="w-full md:w-auto h-11"
        onClick={handleStart}
        disabled={pool.length === 0}
      >
        התחל עכשיו
      </Button>
    </section>
  )
}
