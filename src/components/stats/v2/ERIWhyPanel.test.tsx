import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ──────────────────────────────────────────────────────────────────────────
// W1.5 — RED → GREEN tests for ERIWhyPanel
// Contract: .planning/phase-1/PLAN.md §W1.5
//   (a) renders radar
//   (b) shows all 4 component scores with labels
//   (c) does NOT render a modal wrapper
// ──────────────────────────────────────────────────────────────────────────

type EriShape = {
  value: number
  accuracy: number
  coverage: number
  criticalAvg: number
  consistency: number
}

type TopicStatLike = {
  topic: string
  totalAnswered: number
  accuracy: number
}

type StatsShape = {
  topicData: TopicStatLike[]
}

const mockUseStatsData = vi.fn<() => { eri: EriShape; stats: StatsShape }>()

vi.mock('@/components/stats/useStatsData', () => ({
  useStatsData: () => mockUseStatsData(),
}))

async function loadComponent() {
  const mod = await import('./ERIWhyPanel')
  return mod.ERIWhyPanel
}

function baseEri(overrides: Partial<EriShape> = {}): EriShape {
  return {
    value: 72,
    accuracy: 80,
    coverage: 60,
    criticalAvg: 55,
    consistency: 40,
    ...overrides,
  }
}

describe('ERIWhyPanel', () => {
  beforeEach(() => {
    mockUseStatsData.mockReset()
  })

  it('renders all 4 component scores with Hebrew labels and weights', async () => {
    const ERIWhyPanel = await loadComponent()
    mockUseStatsData.mockReturnValue({
      eri: baseEri({ accuracy: 80, coverage: 60, criticalAvg: 55, consistency: 40 }),
      stats: { topicData: [] },
    })

    render(<ERIWhyPanel />)

    // All 4 Hebrew labels must be present
    expect(screen.getByText(/דיוק/)).toBeInTheDocument()
    expect(screen.getByText(/כיסוי/)).toBeInTheDocument()
    expect(screen.getByText(/נושאים קריטיים/)).toBeInTheDocument()
    expect(screen.getByText(/עקביות/)).toBeInTheDocument()

    // All 4 weight percentages present (25%/25%/30%/20%)
    // Note: 25% appears twice (דיוק + כיסוי both weighted 25%).
    expect(screen.getAllByText(/25%/).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/30%/)).toBeInTheDocument()
    expect(screen.getByText(/20%/)).toBeInTheDocument()

    // All 4 value percentages present
    expect(screen.getByText(/80%/)).toBeInTheDocument()
    expect(screen.getByText(/60%/)).toBeInTheDocument()
    expect(screen.getByText(/55%/)).toBeInTheDocument()
    expect(screen.getByText(/40%/)).toBeInTheDocument()
  })

  it('renders a radar chart container', async () => {
    const ERIWhyPanel = await loadComponent()
    mockUseStatsData.mockReturnValue({
      eri: baseEri(),
      stats: { topicData: [] },
    })

    const { container } = render(<ERIWhyPanel />)

    // Radar wrapper must be identifiable
    expect(
      container.querySelector('[data-testid="eri-radar"]'),
    ).not.toBeNull()
  })

  it('does NOT render a modal wrapper (no role=dialog, no fixed overlay)', async () => {
    const ERIWhyPanel = await loadComponent()
    mockUseStatsData.mockReturnValue({
      eri: baseEri(),
      stats: { topicData: [] },
    })

    const { container } = render(<ERIWhyPanel />)

    // No ARIA dialog
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    // No fixed-position overlay (prior modal used `fixed inset-0 z-[9999]`)
    expect(container.querySelector('.fixed.inset-0')).toBeNull()
    // No backdrop-blur overlay from the old modal
    expect(container.querySelector('.backdrop-blur-md')).toBeNull()
  })

  it('renders top-2 strengths from topicData (filtered by totalAnswered >= 3)', async () => {
    const ERIWhyPanel = await loadComponent()
    mockUseStatsData.mockReturnValue({
      eri: baseEri(),
      stats: {
        topicData: [
          { topic: 'Cardiac Physiology', totalAnswered: 50, accuracy: 90 },
          { topic: 'Respiratory', totalAnswered: 20, accuracy: 85 },
          { topic: 'Pain Management', totalAnswered: 10, accuracy: 70 },
          { topic: 'Pharmacology', totalAnswered: 15, accuracy: 45 },
          { topic: 'Thoracic Surgery', totalAnswered: 8, accuracy: 30 },
        ],
      },
    })

    const { container } = render(<ERIWhyPanel />)

    const strengths = container.querySelector('[data-testid="eri-strengths"]')
    expect(strengths).not.toBeNull()

    const strengthsEl = strengths as HTMLElement
    expect(within(strengthsEl).getByText('Cardiac Physiology')).toBeInTheDocument()
    expect(within(strengthsEl).getByText('Respiratory')).toBeInTheDocument()
    expect(within(strengthsEl).queryByText('Pharmacology')).toBeNull()
    expect(within(strengthsEl).queryByText('Thoracic Surgery')).toBeNull()
  })

  it('renders bottom-2 weaknesses from topicData (filtered by totalAnswered >= 3)', async () => {
    const ERIWhyPanel = await loadComponent()
    mockUseStatsData.mockReturnValue({
      eri: baseEri(),
      stats: {
        topicData: [
          { topic: 'Cardiac Physiology', totalAnswered: 50, accuracy: 90 },
          { topic: 'Respiratory', totalAnswered: 20, accuracy: 85 },
          { topic: 'Pain Management', totalAnswered: 10, accuracy: 70 },
          { topic: 'Pharmacology', totalAnswered: 15, accuracy: 45 },
          { topic: 'Thoracic Surgery', totalAnswered: 8, accuracy: 30 },
        ],
      },
    })

    const { container } = render(<ERIWhyPanel />)

    const weaknesses = container.querySelector('[data-testid="eri-weaknesses"]')
    expect(weaknesses).not.toBeNull()

    const weaknessesEl = weaknesses as HTMLElement
    expect(within(weaknessesEl).getByText('Thoracic Surgery')).toBeInTheDocument()
    expect(within(weaknessesEl).getByText('Pharmacology')).toBeInTheDocument()
    expect(within(weaknessesEl).queryByText('Cardiac Physiology')).toBeNull()
  })

  it('excludes topics with totalAnswered < 3 from strengths/weaknesses', async () => {
    const ERIWhyPanel = await loadComponent()
    mockUseStatsData.mockReturnValue({
      eri: baseEri(),
      stats: {
        topicData: [
          { topic: 'LowSampleHigh', totalAnswered: 2, accuracy: 100 },
          { topic: 'LowSampleLow', totalAnswered: 1, accuracy: 5 },
          { topic: 'Valid1', totalAnswered: 20, accuracy: 80 },
          { topic: 'Valid2', totalAnswered: 15, accuracy: 40 },
        ],
      },
    })

    render(<ERIWhyPanel />)

    expect(screen.queryByText('LowSampleHigh')).toBeNull()
    expect(screen.queryByText('LowSampleLow')).toBeNull()
    expect(screen.getByText('Valid1')).toBeInTheDocument()
    expect(screen.getByText('Valid2')).toBeInTheDocument()
  })
})
