import { useMemo, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Album } from '../types'
import { useHoverPreview, usePlayerState } from '../audio/hover'

interface Props {
  albums: Album[]
  activeFromGrid: boolean
  onPick: (album: Album) => void
  includeSingles: boolean
  onToggleSingles: (v: boolean) => void
  selectedSlot: number | null
}

const PAGE = 120

export function AlbumPool({ albums, activeFromGrid, onPick, includeSingles, onToggleSingles, selectedSlot }: Props) {
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return albums
    return albums.filter((a) => a.name.toLowerCase().includes(needle) || a.artist.toLowerCase().includes(needle))
  }, [albums, q])

  return (
    <>
      <div className="pool-head">
        <input className="pool-search" placeholder="search albums / artists…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="toggle">
          <input type="checkbox" checked={includeSingles} onChange={(e) => onToggleSingles(e.target.checked)} />
          singles
        </label>
      </div>
      <div ref={setNodeRef} className={`pool ${isOver && activeFromGrid ? 'over' : ''}`}>
        {filtered.length === 0 && <div className="pool-empty">nothing here… try another search</div>}
        {filtered.slice(0, limit).map((a, i) => (
          <PoolItem key={a.id} album={a} rank={albums.indexOf(a) + 1} onPick={() => onPick(a)} idx={i} />
        ))}
        {filtered.length > limit && (
          <div className="pool-more">
            <button className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE)}>
              Show {Math.min(PAGE, filtered.length - limit)} more
            </button>
          </div>
        )}
      </div>
      <p className="hint">
        {selectedSlot !== null
          ? `Click an album to put it in slot ${selectedSlot + 1}, or drag one onto the collage.`
          : 'Drag an album onto the collage to swap it in, or select a tile first and click one here.'}
      </p>
    </>
  )
}

function PoolItem({ album, rank, onPick, idx }: { album: Album; rank: number; onPick: () => void; idx: number }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pool:${album.id}` })
  const audio = usePlayerState()
  const hover = useHoverPreview(album)
  const playing = audio.albumId === album.id && audio.status === 'playing'
  const loading = audio.albumId === album.id && audio.status === 'loading'
  return (
    <div
      ref={setNodeRef}
      className={`pool-item ${isDragging ? 'dragging' : ''} ${playing ? 'playing' : ''} ${loading ? 'loading-audio' : ''}`}
      title={`#${rank} ${album.name} — ${album.artist}${album.year ? ` (${album.year})` : ''}`}
      onClick={onPick}
      onPointerEnter={hover.onPointerEnter}
      onPointerLeave={hover.onPointerLeave}
      {...attributes}
      {...listeners}
    >
      <img src={album.thumb} alt={album.name} draggable={false} loading={idx < 40 ? 'eager' : 'lazy'} />
    </div>
  )
}
