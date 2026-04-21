import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ERIRing } from './ERIRing'

const DEFAULT_SIZE = 120
const STROKE_WIDTH = 10
const RADIUS = (DEFAULT_SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const GREEN = '#22C55E'
const AMBER = '#f59e0b'
const RED = '#EF4444'

function getProgressCircle(container: HTMLElement): SVGCircleElement {
  const circles = container.querySelectorAll('circle')
  expect(circles.length).toBeGreaterThanOrEqual(2)
  return circles[1] as SVGCircleElement
}

describe('ERIRing', () => {
  describe('strokeDashoffset math', () => {
    it('at score=0 the progress ring is empty (offset equals full circumference)', () => {
      const { container } = render(<ERIRing score={0} />)
      const progress = getProgressCircle(container)

      const offset = Number(progress.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(CIRCUMFERENCE, 3)
    })

    it('at score=50 the offset equals half of the circumference', () => {
      const { container } = render(<ERIRing score={50} />)
      const progress = getProgressCircle(container)

      const offset = Number(progress.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(CIRCUMFERENCE / 2, 3)
    })

    it('at score=100 the progress ring is fully filled (offset is 0)', () => {
      const { container } = render(<ERIRing score={100} />)
      const progress = getProgressCircle(container)

      const offset = Number(progress.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(0, 3)
    })

    it('clamps scores above 100 to a filled ring (offset=0)', () => {
      const { container } = render(<ERIRing score={150} />)
      const progress = getProgressCircle(container)

      const offset = Number(progress.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(0, 3)
    })

    it('clamps negative scores to an empty ring (offset equals full circumference)', () => {
      const { container } = render(<ERIRing score={-10} />)
      const progress = getProgressCircle(container)

      const offset = Number(progress.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(CIRCUMFERENCE, 3)
    })
  })

  describe('color thresholds', () => {
    it('uses green (#22C55E) when score >= 70', () => {
      const { container } = render(<ERIRing score={70} />)
      const progress = getProgressCircle(container)
      expect(progress.getAttribute('stroke')).toBe(GREEN)
    })

    it('uses green at a high score like 95', () => {
      const { container } = render(<ERIRing score={95} />)
      const progress = getProgressCircle(container)
      expect(progress.getAttribute('stroke')).toBe(GREEN)
    })

    it('uses amber (#f59e0b) when 50 <= score < 70', () => {
      const { container } = render(<ERIRing score={65} />)
      const progress = getProgressCircle(container)
      expect(progress.getAttribute('stroke')).toBe(AMBER)
    })

    it('uses amber at the lower bound (score=50)', () => {
      const { container } = render(<ERIRing score={50} />)
      const progress = getProgressCircle(container)
      expect(progress.getAttribute('stroke')).toBe(AMBER)
    })

    it('uses red (#EF4444) when score < 50', () => {
      const { container } = render(<ERIRing score={49} />)
      const progress = getProgressCircle(container)
      expect(progress.getAttribute('stroke')).toBe(RED)
    })

    it('uses red at score=0', () => {
      const { container } = render(<ERIRing score={0} />)
      const progress = getProgressCircle(container)
      expect(progress.getAttribute('stroke')).toBe(RED)
    })
  })

  describe('size prop', () => {
    it('renders with default size 120 when no size prop is passed', () => {
      const { container } = render(<ERIRing score={70} />)
      const svg = container.querySelector('svg')

      expect(svg).not.toBeNull()
      expect(svg?.getAttribute('width')).toBe(String(DEFAULT_SIZE))
      expect(svg?.getAttribute('height')).toBe(String(DEFAULT_SIZE))
    })

    it('respects a custom size prop (e.g. 180)', () => {
      const customSize = 180
      const { container } = render(<ERIRing score={70} size={customSize} />)
      const svg = container.querySelector('svg')

      expect(svg?.getAttribute('width')).toBe(String(customSize))
      expect(svg?.getAttribute('height')).toBe(String(customSize))
    })

    it('recomputes circumference for a custom size', () => {
      const customSize = 200
      const customRadius = (customSize - STROKE_WIDTH) / 2
      const customCircumference = 2 * Math.PI * customRadius

      const { container } = render(<ERIRing score={50} size={customSize} />)
      const progress = getProgressCircle(container)

      const offset = Number(progress.getAttribute('stroke-dashoffset'))
      expect(offset).toBeCloseTo(customCircumference / 2, 3)
    })
  })

  describe('accessibility', () => {
    it('exposes an accessible role and aria-label describing the score', () => {
      const { getByRole } = render(<ERIRing score={72} />)
      const ring = getByRole('img')

      expect(ring).toHaveAttribute('aria-label', expect.stringContaining('72'))
    })
  })
})
