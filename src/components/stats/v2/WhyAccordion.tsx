import { lazy, Suspense } from 'react'
import { Line, LineChart, ResponsiveContainer } from 'recharts'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { useStatsData } from '@/components/stats/useStatsData'

const ERIWhyPanel = lazy(() =>
  import('./ERIWhyPanel').then((m) => ({ default: m.ERIWhyPanel })),
)

export function WhyAccordion(): JSX.Element {
  const { streak, trendData14, dailyData14 } = useStatsData()

  const sparkData = trendData14.map((d, i) => ({ i, rate: d.rate }))

  return (
    <Accordion type="single" collapsible dir="rtl" className="w-full">
      <AccordionItem value="eri-why" className="border-b-0">
        <AccordionTrigger className="text-base font-semibold">
          למה קיבלתי את הציון הזה?
        </AccordionTrigger>
        <AccordionContent className="space-y-4 pt-2">
          <Suspense
            fallback={
              <div
                data-testid="eri-why-loading"
                className="text-sm text-muted-foreground p-4 text-center"
              >
                טוען ניתוח ERI…
              </div>
            }
          >
            <ERIWhyPanel />
          </Suspense>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              מגמת דיוק (14 ימים)
            </div>
            <div
              data-testid="eri-sparkline"
              className="h-16 w-full"
              aria-hidden="true"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkData}>
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="#F97316"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              רצף לימוד (14 ימים) — רצף נוכחי: {streak}
            </div>
            <div
              data-testid="eri-streak-calendar"
              className="grid gap-1"
              style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}
            >
              {dailyData14.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count} שאלות`}
                  className={`h-3 rounded-sm ${
                    d.count > 0 ? 'bg-green-500' : 'bg-muted/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
