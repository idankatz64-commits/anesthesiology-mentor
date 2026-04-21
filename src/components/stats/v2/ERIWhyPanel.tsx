import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'

import { Progress } from '@/components/ui/progress'
import { useStatsData } from '@/components/stats/useStatsData'

const MIN_CONFIDENCE_SAMPLES = 3

type ComponentScore = {
  label: string
  value: number
  weight: string
}

export function ERIWhyPanel(): JSX.Element {
  const { eri, stats } = useStatsData()

  const scores: ComponentScore[] = [
    { label: 'דיוק', value: eri.accuracy, weight: '25%' },
    { label: 'כיסוי', value: eri.coverage, weight: '25%' },
    { label: 'נושאים קריטיים', value: eri.criticalAvg, weight: '30%' },
    { label: 'עקביות', value: eri.consistency, weight: '20%' },
  ]

  const radarData = scores.map((s) => ({
    subject: `${s.label} (${s.weight})`,
    val: s.value,
    fullMark: 100,
  }))

  const confident = (stats?.topicData ?? []).filter(
    (t) => t.totalAnswered >= MIN_CONFIDENCE_SAMPLES,
  )
  const sortedDesc = [...confident].sort((a, b) => b.accuracy - a.accuracy)
  const top2 = sortedDesc.slice(0, 2)
  const bottom2 =
    sortedDesc.length >= 4 ? sortedDesc.slice(-2).reverse() : []

  return (
    <div className="flex flex-col gap-6" dir="rtl">
      <div className="flex flex-col md:flex-row items-center gap-6">
        <div data-testid="eri-radar" className="w-full md:flex-1 h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData}>
              <PolarGrid stroke="rgba(148, 163, 184, 0.25)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: 'currentColor', fontSize: 11 }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tick={{ fill: 'currentColor', fontSize: 10, opacity: 0.6 }}
              />
              <Radar
                dataKey="val"
                stroke="#F97316"
                fill="#F97316"
                fillOpacity={0.25}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-3 w-full md:w-auto md:max-w-sm">
          {scores.map((s) => (
            <div
              key={s.label}
              className="bg-muted/30 rounded-lg p-3 text-center"
            >
              <div className="text-xl font-bold text-foreground">
                {s.value}%
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {s.label} ({s.weight})
              </div>
            </div>
          ))}
        </div>
      </div>

      {top2.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            data-testid="eri-strengths"
            className="bg-green-500/5 border border-green-500/20 rounded-xl p-3"
          >
            <h4 className="text-[11px] font-bold text-green-500 uppercase tracking-wider mb-2">
              ביצועים חזקים
            </h4>
            <div className="space-y-2">
              {top2.map((t) => (
                <div key={t.topic}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-foreground truncate max-w-[70%]">
                      {t.topic}
                    </span>
                    <span className="text-green-500 font-bold">
                      {t.accuracy}%
                    </span>
                  </div>
                  <Progress
                    value={t.accuracy}
                    className="h-1.5 bg-muted/30 [&>div]:bg-green-500"
                  />
                </div>
              ))}
            </div>
          </div>
          <div
            data-testid="eri-weaknesses"
            className="bg-destructive/5 border border-destructive/20 rounded-xl p-3"
          >
            <h4 className="text-[11px] font-bold text-destructive uppercase tracking-wider mb-2">
              דורש חיזוק
            </h4>
            <div className="space-y-2">
              {bottom2.map((t) => (
                <div key={t.topic}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-foreground truncate max-w-[70%]">
                      {t.topic}
                    </span>
                    <span className="text-destructive font-bold">
                      {t.accuracy}%
                    </span>
                  </div>
                  <Progress
                    value={t.accuracy}
                    className="h-1.5 bg-muted/30 [&>div]:bg-destructive"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
