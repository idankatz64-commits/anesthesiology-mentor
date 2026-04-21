import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export interface WeakZoneCardProps {
  topic: string
  /** Accuracy in [0, 1] (e.g. 0.42 = 42%). */
  accuracy: number
  reason: string
  onStart: (topic: string) => void
}

export function WeakZoneCard({
  topic,
  accuracy,
  reason,
  onStart,
}: WeakZoneCardProps): JSX.Element {
  const percent = Math.round(accuracy * 100)

  const handleStart = () => {
    onStart(topic)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleStart()
    }
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleStart}
      onKeyDown={handleKeyDown}
      className="p-4 cursor-pointer hover:shadow-md transition min-h-[96px] focus:outline-none focus:ring-2 focus:ring-ring"
      dir="rtl"
      aria-label={topic}
    >
      <div className="flex justify-between items-start gap-2">
        <h3 className="font-semibold truncate" title={topic}>
          {topic}
        </h3>
        <span className="text-xs text-muted-foreground shrink-0">{percent}%</span>
      </div>
      <Progress value={percent} className="mt-2 h-1.5" />
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{reason}</p>
    </Card>
  )
}
