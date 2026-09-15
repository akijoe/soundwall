import { useMemo, type CSSProperties } from 'react'

export function Background() {
  const stars = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        dur: 2 + Math.random() * 4,
        delay: Math.random() * 4,
        big: Math.random() < 0.12,
      })),
    [],
  )
  return (
    <div className="bg" aria-hidden>
      <div className="bg-dots" />
      <div className="bg-stars">
        {stars.map((s) => (
          <span
            key={s.id}
            className={s.big ? 'big' : undefined}
            style={{ left: `${s.x}%`, top: `${s.y}%`, '--dur': `${s.dur}s`, '--delay': `${s.delay}s` } as CSSProperties}
          />
        ))}
      </div>
      <div className="blob" style={{ width: 520, height: 520, left: '-10%', top: '5%', background: '#3de1ff', '--dx': '120px', '--dy': '80px', '--dur': '18s' } as CSSProperties} />
      <div className="blob" style={{ width: 560, height: 560, right: '-12%', top: '-8%', background: '#8d7bff', '--dx': '-90px', '--dy': '120px', '--dur': '21s' } as CSSProperties} />
      <div className="flare" />
      <div className="bg-grid" />
    </div>
  )
}
