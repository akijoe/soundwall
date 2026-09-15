import { usePlayerState } from '../audio/hover'
import { player } from '../audio/player'

/** Speaker toggle + slider; volume defaults low so hover previews stay polite. */
export function VolumeControl({ compact = false }: { compact?: boolean }) {
  const s = usePlayerState()
  const pct = Math.round(s.volume * 100)
  const muted = !s.enabled || s.volume === 0
  const icon = muted ? '🔇' : s.volume < 0.34 ? '🔈' : s.volume < 0.67 ? '🔉' : '🔊'
  return (
    <div className={`vol ${compact ? 'compact' : ''} ${muted ? 'muted' : ''}`} title="Preview volume">
      <button
        type="button"
        className="vol-btn"
        aria-label={muted ? 'Turn sound on' : 'Mute'}
        aria-pressed={!muted}
        onClick={() => {
          if (muted && s.volume === 0) player.setVolume(0.3)
          player.setEnabled(muted)
        }}
      >
        {icon}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={s.enabled ? pct : 0}
        onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
        aria-label="Preview volume"
        style={{ '--pct': `${s.enabled ? pct : 0}%` } as React.CSSProperties}
      />
      {!compact && <span className="vol-pct">{s.enabled ? pct : 0}%</span>}
    </div>
  )
}
