import { useEffect, useState } from 'react'
import { Win } from './Win'

const TIPS = ['warming up…', 'finding your favourites…', 'polishing the chrome…', 'almost there…']

export function LoadingScreen({ msg, pct }: { msg: string; pct: number }) {
  const [tip, setTip] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTip((x) => (x + 1) % TIPS.length), 1400)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="loading">
      <Win title="">
        <p className="loading-msg">{msg}</p>
        <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <p className="loading-tip">{TIPS[tip]}</p>
      </Win>
    </div>
  )
}
