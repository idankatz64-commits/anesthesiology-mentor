import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Question } from '@/lib/types'
import type { Recommendation } from '@/lib/recommendations'

// ──────────────────────────────────────────────────────────────────────────
// W1.4 — RED → GREEN tests for WeakZoneCards container
// Contract: .planning/phase-1/PLAN.md §W1.4
//   (a) renders 3 cards when weakZones has 3
//   (b) 0 cards + graceful empty state when weakZones empty
//   (c) click on card N calls startSession with topic N's questions
// ──────────────────────────────────────────────────────────────────────────

type AppMock = {
  questions: Question[]
  startSession: ReturnType<typeof vi.fn>
}

const mockUseRecommendations = vi.fn<() => { weakZones: Recommendation[] }>()
const mockUseApp = vi.fn<() => AppMock>()

vi.mock('@/hooks/useRecommendations', () => ({
  useRecommendations: () => mockUseRecommendations(),
}))

vi.mock('@/contexts/AppContext', () => ({
  useApp: () => mockUseApp(),
}))

async function loadComponent() {
  const mod = await import('./WeakZoneCards')
  return mod.WeakZoneCards
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

function makeRecommendation(topic: string, weakness = 0.5): Recommendation {
  return {
    topic,
    score: 0.5,
    factors: {
      yield: 1,
      weakness,
      overdue: 0,
      recency: 0.1,
      confidenceDamp: 1,
    },
    reason: `${topic} — חולשה`,
  }
}

describe('WeakZoneCards', () => {
  beforeEach(() => {
    mockUseRecommendations.mockReset()
    mockUseApp.mockReset()
  })

  it('renders 3 cards when weakZones has 3', async () => {
    const WeakZoneCards = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      weakZones: [
        makeRecommendation('Cardiac Physiology'),
        makeRecommendation('Local Anesthetics'),
        makeRecommendation('Thoracic Surgery'),
      ],
    })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<WeakZoneCards />)

    expect(screen.getAllByRole('button')).toHaveLength(3)
    expect(screen.getByText('Cardiac Physiology')).toBeInTheDocument()
    expect(screen.getByText('Local Anesthetics')).toBeInTheDocument()
    expect(screen.getByText('Thoracic Surgery')).toBeInTheDocument()
  })

  it('renders graceful empty state in Hebrew when weakZones is empty', async () => {
    const WeakZoneCards = await loadComponent()
    mockUseRecommendations.mockReturnValue({ weakZones: [] })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<WeakZoneCards />)

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(
      screen.getByText(/אין עדיין נושאים חלשים/),
    ).toBeInTheDocument()
  })

  it('clicking card N calls startSession with topic N questions + count 15 + practice', async () => {
    const WeakZoneCards = await loadComponent()
    const user = userEvent.setup()
    const startSession = vi.fn()

    const cardiacQs = Array.from({ length: 40 }, (_, i) =>
      makeQuestion(`c${i}`, 'Cardiac Physiology'),
    )
    const localQs = Array.from({ length: 8 }, (_, i) =>
      makeQuestion(`l${i}`, 'Local Anesthetics'),
    )
    const thoracicQs = Array.from({ length: 20 }, (_, i) =>
      makeQuestion(`t${i}`, 'Thoracic Surgery'),
    )

    mockUseRecommendations.mockReturnValue({
      weakZones: [
        makeRecommendation('Cardiac Physiology'),
        makeRecommendation('Local Anesthetics'),
        makeRecommendation('Thoracic Surgery'),
      ],
    })
    mockUseApp.mockReturnValue({
      questions: [...cardiacQs, ...localQs, ...thoracicQs],
      startSession,
    })

    render(<WeakZoneCards />)

    await user.click(
      screen.getByRole('button', { name: /Local Anesthetics/ }),
    )

    expect(startSession).toHaveBeenCalledTimes(1)
    const [poolArg, countArg, modeArg] = startSession.mock.calls[0]
    expect(poolArg).toHaveLength(8)
    expect(poolArg.every((q: Question) => q.topic === 'Local Anesthetics')).toBe(
      true,
    )
    expect(countArg).toBe(8)
    expect(modeArg).toBe('practice')
  })

  it('caps session count at 15 when pool is larger than 15', async () => {
    const WeakZoneCards = await loadComponent()
    const user = userEvent.setup()
    const startSession = vi.fn()

    const pool = Array.from({ length: 40 }, (_, i) =>
      makeQuestion(`c${i}`, 'Cardiac Physiology'),
    )

    mockUseRecommendations.mockReturnValue({
      weakZones: [makeRecommendation('Cardiac Physiology')],
    })
    mockUseApp.mockReturnValue({ questions: pool, startSession })

    render(<WeakZoneCards />)
    await user.click(screen.getByRole('button', { name: /Cardiac Physiology/ }))

    expect(startSession).toHaveBeenCalledWith(expect.any(Array), 15, 'practice')
  })

  it('derives card accuracy from 1 - factors.weakness and renders as percent', async () => {
    const WeakZoneCards = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      weakZones: [makeRecommendation('Cardiac Physiology', 0.58)],
    })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    render(<WeakZoneCards />)

    expect(screen.getByText('42%')).toBeInTheDocument()
  })

  it('uses a responsive grid class (grid-cols-1 md:grid-cols-3)', async () => {
    const WeakZoneCards = await loadComponent()
    mockUseRecommendations.mockReturnValue({
      weakZones: [
        makeRecommendation('A'),
        makeRecommendation('B'),
        makeRecommendation('C'),
      ],
    })
    mockUseApp.mockReturnValue({ questions: [], startSession: vi.fn() })

    const { container } = render(<WeakZoneCards />)

    const grid = container.querySelector('[data-testid="weak-zone-cards"]')
    expect(grid).not.toBeNull()
    expect(grid?.className).toMatch(/grid-cols-1/)
    expect(grid?.className).toMatch(/md:grid-cols-3/)
  })
})
