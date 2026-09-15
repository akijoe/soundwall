import { useEffect, useRef, useState } from 'react'
import { usePlayerState } from '../audio/hover'
import { player } from '../audio/player'
import { stopPreview } from '../audio/hover'
import { VolumeControl } from './VolumeControl'

const EXIT_MS = 340

const BARS = 24

/** Bottom-center pill: spinning disc, what's playing, live spectrum, volume. */
export function NowPlaying() {
  const s = usePlayerState()
  const bars = useRef<HTMLElement[]>([])
  const active = s.status !== 'idle'

  // Keep the pill mounted briefly after it goes idle so it can animate out.
  const [shown, setShown] = useState(active)
  const [leaving, setLeaving] = useState(false)
  const last = useRef(s)
  if (active) last.current = s
  useEffect(() => {
    if (active) {
      setShown(true)
      setLeaving(false)
      return
    }
    setLeaving(true)
    const t = setTimeout(() => {
      setShown(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => clearTimeout(t)
  }, [active])

  useEffect(() => {
    if (s.status !== 'playing') {
      document.documentElement.style.setProperty('--level', '0')
      return
    }
    let raf = 0
    const tick = () => {
      const f = player.levels()
      const n = bars.current.length
      for (let i = 0; i < n; i++) {
        const el = bars.current[i]
        if (!el) continue
        const idx = Math.floor((i / n) * (f.length * 0.7))
        el.style.transform = `scaleY(${Math.max(0.08, f[idx] / 255)})`
      }
      let bass = 0
      for (let i = 0; i < 6; i++) bass += f[i]
      document.documentElement.style.setProperty('--level', (bass / (6 * 255)).toFixed(3))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [s.status])

  if (!shown) return null
  const v0 = active ? s : last.current

  let k: React.ReactNode = ''
  let v: React.ReactNode = ''
  switch (v0.status) {
    case 'lookup':
      k = 'Finding a snippet'
      v = v0.label
      break
    case 'loading':
      k = 'Loading'
      v = v0.info ? (
        <>
          {v0.info.track} <span>— {v0.info.artist}</span>
        </>
      ) : (
        v0.label
      )
      break
    case 'playing':
      k = 'Now playing'
      v = v0.info ? (
        <>
          {v0.info.track} <span>— {v0.info.artist}</span>
        </>
      ) : (
        v0.label
      )
      break
    case 'error':
      k = v0.blocked ? 'Sound is off' : 'No preview'
      v = v0.message
      break
  }

  return (
    <div className={`np s-${v0.status} ${leaving ? 'leaving' : ''}`} role="status" aria-live="polite">
      <span className="np-cd" aria-hidden />
      <div className="np-text">
        <div className="k">{k}</div>
        <div className="v" title={typeof v === 'string' ? v : undefined}>
          {v}
        </div>
      </div>
      <div className="np-eq" aria-hidden>
        {Array.from({ length: BARS }, (_, i) => (
          <i
            key={i}
            style={{ '--i': i } as React.CSSProperties}
            ref={(el) => {
              if (el) bars.current[i] = el
            }}
          />
        ))}
      </div>
      <VolumeControl compact />
      <button className="np-x" type="button" aria-label="Stop preview" onClick={stopPreview}>
        ×
      </button>
    </div>
  )
}
