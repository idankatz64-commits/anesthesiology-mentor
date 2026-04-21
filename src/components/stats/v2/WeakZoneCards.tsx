import { useApp } from '@/contexts/AppContext'
import { useRecommendations } from '@/hooks/useRecommendations'

import { WeakZoneCard } from './WeakZoneCard'

const SESSION_TARGET = 15

export function WeakZoneCards(): JSX.Element {
  const { weakZones } = useRecommendations()
  const { questions, startSession } = useApp()

  const handleStart = (topic: string) => {
    const pool = questions.filter((q) => q.topic === topic)
    if (pool.length === 0) return
    startSession(pool, Math.min(pool.length, SESSION_TARGET), 'practice')
  }

  if (weakZones.length === 0) {
    return (
      <section
        className="rounded-xl border p-4 text-sm text-muted-foreground"
        dir="rtl"
      >
        אין עדיין נושאים חלשים להצגה. המשך לתרגל ונאסוף נתונים.
      </section>
    )
  }

  return (
    <div
      data-testid="weak-zone-cards"
      className="grid grid-cols-1 gap-3 md:grid-cols-3"
      dir="rtl"
    >
      {weakZones.map((rec) => (
        <WeakZoneCard
          key={rec.topic}
          topic={rec.topic}
          accuracy={1 - rec.factors.weakness}
          reason={rec.reason}
          onStart={handleStart}
        />
      ))}
    </div>
  )
}
