import type { CSSProperties } from 'react'

interface Props {
  size?: 'small' | 'large'
}

/**
 * Wordmark with a Y2K orbit ring: a tilted ellipse passes behind the chrome
 * text, its front arc crosses over the bottom, and a satellite spark rides it.
 */
export function Logo({ size = 'small' }: Props) {
  const id = size === 'large' ? 'lg' : 'sm'
  return (
    <span className={`logo-mark ${size}`} aria-label="SOUNDWALL">
      <svg className="logo-ring back" viewBox="0 0 400 160" aria-hidden>
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#a8e6ff" stopOpacity="0" />
            <stop offset="0.3" stopColor="#e4ecf7" />
            <stop offset="0.7" stopColor="#c8ff3d" />
            <stop offset="1" stopColor="#a8e6ff" stopOpacity="0" />
          </linearGradient>
          <filter id={`glow-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g transform="rotate(-9 200 80)">
          <ellipse cx="200" cy="80" rx="196" ry="46" fill="none" stroke={`url(#ring-${id})`} strokeWidth="2.2" />
          <ellipse cx="200" cy="80" rx="176" ry="34" fill="none" stroke="rgba(168,230,255,0.28)" strokeWidth="1" strokeDasharray="3 6" />
        </g>
      </svg>
      <span className="chrome" data-text="SOUNDWALL">
        SOUNDWALL
      </span>
      <svg className="logo-ring front" viewBox="0 0 400 160" aria-hidden>
        <g transform="rotate(-9 200 80)">
          {/* front arc: the lower-right quarter of the ellipse crosses the text */}
          <path d="M 200 126 A 196 46 0 0 0 396 80" fill="none" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" opacity="0.95" />
          <circle r="5" fill="#ffffff" filter={`url(#glow-${id})`} style={{ '--c': '#c8ff3d' } as CSSProperties}>
            <animateMotion dur="7s" repeatCount="indefinite" path="M 396 80 A 196 46 0 0 1 4 80 A 196 46 0 0 1 396 80" />
          </circle>
        </g>
      </svg>
    </span>
  )
}
