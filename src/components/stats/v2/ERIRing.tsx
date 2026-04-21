interface ERIRingProps {
  score: number
  size?: number
}

const STROKE_WIDTH = 10
const DEFAULT_SIZE = 120

const GREEN = '#22C55E'
const AMBER = '#f59e0b'
const RED = '#EF4444'

const TRACK_LIGHT = '#e5e7eb'
const TEXT_COLOR = '#111827'

function colorFor(score: number): string {
  if (score >= 70) return GREEN
  if (score >= 50) return AMBER
  return RED
}

export function ERIRing({ score, size = DEFAULT_SIZE }: ERIRingProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = (size - STROKE_WIDTH) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (clamped / 100) * circumference
  const color = colorFor(clamped)
  const displayScore = Math.round(clamped)

  return (
    <div
      role="img"
      aria-label={`ציון מוכנות ${displayScore} מתוך 100`}
      data-testid="eri-ring"
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'inline-block',
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={TRACK_LIGHT}
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          color: TEXT_COLOR,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        <span style={{ fontSize: Math.round(size * 0.3) }}>{displayScore}</span>
        <span style={{ fontSize: Math.round(size * 0.11), opacity: 0.7, marginTop: 2 }}>
          /100
        </span>
      </div>
    </div>
  )
}
