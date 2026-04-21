import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Question } from '@/lib/types'
import type { Recommendation } from '@/lib/recommendations'

// ──────────────────────────────────────────────────────────────────────────
// W1.2 — RED → GREEN tests for StatsHero
// Contract: .planning/phase-1/PLAN.md W1.2 + RESEARCH.md §Code Example 3
// ──────────────────────────────────────────────────────────────────────────

type Hero = Recommendation | null
type AppMock = {
  questions: Question[]
  startSession: ReturnType<typeof vi.fn>
}

const mockUseRecommendations = vi.fn<() => { hero: Hero }>()
const mockUseStatsData = vi.fn<() => { eri: { value: number } }>()
const mockUseApp = vi.fn<() => AppMock>()

vi.mock('@/hooks/useRecommendations', () => ({
  useRecommendations: () => mockUseRecommendations(),
}))

vi.mock('@/components/stats/useStatsData', () => ({
  useStatsData: () => mockUseStatsData(),
}))

vi.mock('@/contexts/AppContext', () => ({
  useApp: () => mockUseApp(),
}))

async function loadComponent() {
  const mod = await import('./StatsHero')
  return mod.StatsHero
}

function makeQuestion(id: string, topic: string): Question {
  return {
    id,
    ref_id: id,
    question: 'q',
    A: 'a',
    B: 'b',
    C: 'c',
    D: 'd',
    correct: 'A',
    explanation: '',
    topic,
    year: '2024',
    source: '',
    miller: '',
    chapter: 1,
    media_type: '',
    media_link: '',
    kind: 'mcq',
  }
}

function makeRecommendation(topic: string): Recommendation {
  return {
    topic,
    score: 0.5,
    factors: {
      yield: 1,
      weakness: 0.5,
      overdue: 0,
      recency: 0.1,
      confidenceDamp: 1,
    },
    reason: `${topic} — חולשה גבוהה`,
  }
}

describe('StatsHero', () => {
  beforeEach(() => {
    mockUseRecommendations.mockReset()
    mockUseStatsData.mockReset()
    mockUseApp.mockReset()
  })

  it('renders the Hebrew empty-state when hero is null', async () => {
    const StatsHero = await loadComponent()
    mockUseRecommendations.mockReturnValue({ hero: null })
    mockUseStatsData.mockReturnValue({ eri: { value: 0 } })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<StatsHero />)

    expect(
      screen.getByText(/עוד אין מספיק נתונים להמלצה/),
    ).toBeInTheDocument()
  })

  it('renders the hero topic name when hero is present', async () => {
    const StatsHero = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      hero: makeRecommendation('Cardiac Physiology'),
    })
    mockUseStatsData.mockReturnValue({ eri: { value: 72 } })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<StatsHero />)

    expect(screen.getByText(/Cardiac Physiology/)).toBeInTheDocument()
  })

  it('renders the התחל עכשיו CTA button when hero is present', async () => {
    const StatsHero = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      hero: makeRecommendation('Cardiac Physiology'),
    })
    mockUseStatsData.mockReturnValue({ eri: { value: 72 } })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<StatsHero />)

    expect(
      screen.getByRole('button', { name: /התחל עכשיו/ }),
    ).toBeInTheDocument()
  })

  it('CTA click calls startSession with the topic pool, min(pool, 15), practice', async () => {
    const StatsHero = await loadComponent()
    const user = userEvent.setup()
    const startSession = vi.fn()

    const pool = Array.from({ length: 40 }, (_, i) =>
      makeQuestion(`q${i}`, 'Cardiac Physiology'),
    )
    const other = [makeQuestion('x1', 'Thoracic Surgery')]

    mockUseRecommendations.mockReturnValue({
      hero: makeRecommendation('Cardiac Physiology'),
    })
    mockUseStatsData.mockReturnValue({ eri: { value: 72 } })
    mockUseApp.mockReturnValue({
      questions: [...pool, ...other],
      startSession,
    })

    render(<StatsHero />)
    await user.click(screen.getByRole('button', { name: /התחל עכשיו/ }))

    expect(startSession).toHaveBeenCalledTimes(1)
    const [pooledArg, countArg, modeArg] = startSession.mock.calls[0]
    expect(pooledArg).toHaveLength(40)
    expect(pooledArg.every((q: Question) => q.topic === 'Cardiac Physiology')).toBe(true)
    expect(countArg).toBe(15)
    expect(modeArg).toBe('practice')
  })

  it('CTA click passes pool.length when pool is smaller than 15', async () => {
    const StatsHero = await loadComponent()
    const user = userEvent.setup()
    const startSession = vi.fn()

    const pool = [
      makeQuestion('a', 'Local Anesthetics'),
      makeQuestion('b', 'Local Anesthetics'),
      makeQuestion('c', 'Local Anesthetics'),
    ]

    mockUseRecommendations.mockReturnValue({
      hero: makeRecommendation('Local Anesthetics'),
    })
    mockUseStatsData.mockReturnValue({ eri: { value: 55 } })
    mockUseApp.mockReturnValue({ questions: pool, startSession })

    render(<StatsHero />)
    await user.click(screen.getByRole('button', { name: /התחל עכשיו/ }))

    expect(startSession).toHaveBeenCalledWith(expect.any(Array), 3, 'practice')
  })

  it('renders the ERI ring (data-testid eri-ring)', async () => {
    const StatsHero = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      hero: makeRecommendation('Cardiac Physiology'),
    })
    mockUseStatsData.mockReturnValue({ eri: { value: 72 } })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    const { container } = render(<StatsHero />)

    expect(container.querySelector('[data-testid="eri-ring"]')).not.toBeNull()
  })

  it('passes the ERI score from useStatsData to the ring aria-label', async () => {
    const StatsHero = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      hero: makeRecommendation('Cardiac Physiology'),
    })
    mockUseStatsData.mockReturnValue({ eri: { value: 83 } })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<StatsHero />)

    const ring = screen.getByRole('img')
    expect(ring).toHaveAttribute('aria-label', expect.stringContaining('83'))
  })
})
