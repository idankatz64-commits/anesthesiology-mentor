import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ──────────────────────────────────────────────────────────────────────────
// W1.6 — RED → GREEN tests for WhyAccordion
// Contract: .planning/phase-1/PLAN.md §W1.6
//   (a) collapsed by default (aria-expanded="false")
//   (b) click opens, revealing ERIWhyPanel + sparkline + 14-day streak calendar
//   (c) Suspense fallback visible while lazy ERIWhyPanel is loading
// ──────────────────────────────────────────────────────────────────────────

let suspendForever = false

vi.mock('./ERIWhyPanel', () => ({
  ERIWhyPanel: () => {
    if (suspendForever) {
      throw new Promise(() => {})
    }
    return <div data-testid="eri-why-panel">ERI Why Panel</div>
  },
}))

type StatsMock = {
  stats: { topicData: Array<{ topic: string; totalAnswered: number; accuracy: number }> }
  eri: {
    value: number
    accuracy: number
    coverage: number
    criticalAvg: number
    consistency: number
  }
  streak: number
  trendData14: Array<{
    date: string
    count: number
    correct: number
    rate: number
    trend?: number
  }>
  dailyData14: Array<{ date: string; count: number; correct: number; rate: number }>
}

const mockUseStatsData = vi.fn<() => StatsMock>()

vi.mock('@/components/stats/useStatsData', () => ({
  useStatsData: () => mockUseStatsData(),
}))

async function loadComponent() {
  const mod = await import('./WhyAccordion')
  return mod.WhyAccordion
}

function baseStats(): StatsMock {
  const dailyData14 = Array.from({ length: 14 }, (_, i) => ({
    date: `2026-04-${String(i + 1).padStart(2, '0')}`,
    count: i % 2,
    correct: Math.floor(i / 2),
    rate: 50 + i,
  }))
  return {
    stats: { topicData: [] },
    eri: { value: 72, accuracy: 80, coverage: 60, criticalAvg: 55, consistency: 40 },
    streak: 5,
    trendData14: dailyData14.map((d) => ({ ...d, trend: 60 })),
    dailyData14,
  }
}

describe('WhyAccordion', () => {
  beforeEach(() => {
    mockUseStatsData.mockReset()
    mockUseStatsData.mockReturnValue(baseStats())
    suspendForever = false
  })

  it('is collapsed by default (aria-expanded="false")', async () => {
    const WhyAccordion = await loadComponent()
    render(<WhyAccordion />)
    const trigger = screen.getByRole('button', { name: /למה/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens on click and reveals panel + sparkline + streak calendar', async () => {
    const WhyAccordion = await loadComponent()
    const user = userEvent.setup()
    render(<WhyAccordion />)
    const trigger = screen.getByRole('button', { name: /למה/ })
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(await screen.findByTestId('eri-why-panel')).toBeInTheDocument()
    expect(screen.getByTestId('eri-sparkline')).toBeInTheDocument()
    expect(screen.getByTestId('eri-streak-calendar')).toBeInTheDocument()
  })

  it('streak calendar renders exactly 14 day cells', async () => {
    const WhyAccordion = await loadComponent()
    const user = userEvent.setup()
    render(<WhyAccordion />)
    await user.click(screen.getByRole('button', { name: /למה/ }))
    const calendar = await screen.findByTestId('eri-streak-calendar')
    expect(calendar.children.length).toBe(14)
  })

  it('shows Suspense fallback while lazy ERIWhyPanel is loading', async () => {
    suspendForever = true
    const WhyAccordion = await loadComponent()
    const user = userEvent.setup()
    render(<WhyAccordion />)
    await user.click(screen.getByRole('button', { name: /למה/ }))
    expect(await screen.findByTestId('eri-why-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('eri-why-panel')).toBeNull()
  })

  it('shows Hebrew trigger label', async () => {
    const WhyAccordion = await loadComponent()
    render(<WhyAccordion />)
    expect(screen.getByRole('button', { name: /למה/ })).toBeInTheDocument()
  })
})
