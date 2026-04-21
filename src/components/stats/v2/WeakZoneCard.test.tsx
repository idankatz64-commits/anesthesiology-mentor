import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { WeakZoneCard } from './WeakZoneCard'

// ──────────────────────────────────────────────────────────────────────────
// W1.3 — RED → GREEN tests for WeakZoneCard
// Contract: .planning/phase-1/PLAN.md §W1.3 + RESEARCH.md §Code Example 4
//   Props: { topic, accuracy (0..1), reason, onStart }
//   (a) onClick → onStart(topic)
//   (b) Enter key on focused card → onStart(topic)
//   (c) Long topic names get title="" attr (truncation tooltip)
//   (d) min-h-[96px] class present (WCAG 2.5.5 tap target)
// ──────────────────────────────────────────────────────────────────────────

describe('WeakZoneCard', () => {
  it('renders the topic name, accuracy %, and reason', () => {
    render(
      <WeakZoneCard
        topic="Cardiac Physiology"
        accuracy={0.42}
        reason="חולשה גבוהה, באיחור לחזרה"
        onStart={vi.fn()}
      />,
    )

    expect(screen.getByText('Cardiac Physiology')).toBeInTheDocument()
    expect(screen.getByText('42%')).toBeInTheDocument()
    expect(screen.getByText(/חולשה גבוהה/)).toBeInTheDocument()
  })

  it('rounds accuracy to nearest percent', () => {
    render(
      <WeakZoneCard
        topic="Local Anesthetics"
        accuracy={0.666}
        reason="reason"
        onStart={vi.fn()}
      />,
    )

    expect(screen.getByText('67%')).toBeInTheDocument()
  })

  it('calls onStart with the topic when clicked', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()

    render(
      <WeakZoneCard
        topic="Respiratory Physiology"
        accuracy={0.5}
        reason="reason"
        onStart={onStart}
      />,
    )

    await user.click(screen.getByRole('button', { name: /Respiratory Physiology/ }))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledWith('Respiratory Physiology')
  })

  it('calls onStart when Enter is pressed on the focused card', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()

    render(
      <WeakZoneCard
        topic="Thoracic Surgery"
        accuracy={0.3}
        reason="reason"
        onStart={onStart}
      />,
    )

    const card = screen.getByRole('button', { name: /Thoracic Surgery/ })
    card.focus()
    await user.keyboard('{Enter}')

    expect(onStart).toHaveBeenCalledWith('Thoracic Surgery')
  })

  it('does NOT call onStart on unrelated key presses', async () => {
    const onStart = vi.fn()
    const user = userEvent.setup()

    render(
      <WeakZoneCard
        topic="Pain Management"
        accuracy={0.4}
        reason="reason"
        onStart={onStart}
      />,
    )

    const card = screen.getByRole('button', { name: /Pain Management/ })
    card.focus()
    await user.keyboard('{Escape}')
    await user.keyboard('a')

    expect(onStart).not.toHaveBeenCalled()
  })

  it('sets title="<topic>" on the heading for long-name truncation tooltip', () => {
    const longTopic = 'Advanced Cardiac Electrophysiology and Arrhythmia Management'
    render(
      <WeakZoneCard
        topic={longTopic}
        accuracy={0.2}
        reason="reason"
        onStart={vi.fn()}
      />,
    )

    const heading = screen.getByText(longTopic)
    expect(heading).toHaveAttribute('title', longTopic)
  })

  it('has min-h-[96px] class for WCAG tap target compliance', () => {
    const { container } = render(
      <WeakZoneCard
        topic="Neuromuscular Blockade"
        accuracy={0.55}
        reason="reason"
        onStart={vi.fn()}
      />,
    )

    const card = container.querySelector('[role="button"]')
    expect(card).not.toBeNull()
    expect(card?.className).toMatch(/min-h-\[96px\]/)
  })

  it('exposes role="button" and tabIndex=0 for keyboard accessibility', () => {
    render(
      <WeakZoneCard
        topic="General Anesthesia"
        accuracy={0.6}
        reason="reason"
        onStart={vi.fn()}
      />,
    )

    const card = screen.getByRole('button', { name: /General Anesthesia/ })
    expect(card).toHaveAttribute('tabIndex', '0')
  })
})
