import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Album, CollageStyle, Layout } from '../types'
import { useHoverPreview, usePlayerState } from '../audio/hover'

interface Props {
  slots: (Album | null)[]
  slotIds: string[]
  layout: Layout
  style: CollageStyle
  flipToken: number
  activeFromPool: boolean
  selected: number | null
  hiRes: Set<string>
  onSelect: (i: number | null) => void
  onRemove: (i: number) => void
}

export function CollageGrid({ slots, slotIds, layout, style, flipToken, activeFromPool, selected, hiRes, onSelect, onRemove }: Props) {
  const nodes = useRef(new Map<string, HTMLElement>())
  const rects = useRef(new Map<string, { x: number; y: number }>())
  const lastToken = useRef(flipToken)

  // FLIP: tiles glide (and tumble a bit) into their new places after a
  // shuffle/reset/layout change; tiles that just arrived pop in.
  useLayoutEffect(() => {
    const flip = lastToken.current !== flipToken
    lastToken.current = flipToken
    let i = 0
    for (const [id, el] of nodes.current) {
      const prev = rects.current.get(id)
      if (!prev) {
        el.animate(
          [
            { transform: 'scale(0.3) rotate(-12deg)', opacity: 0 },
            { transform: 'scale(1.08) rotate(2deg)', opacity: 1, offset: 0.7 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: 450, delay: Math.min(i * 28, 600), easing: 'cubic-bezier(.2,1.2,.3,1)', fill: 'backwards' },
        )
      } else if (flip) {
        const dx = prev.x - el.offsetLeft
        const dy = prev.y - el.offsetTop
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          el.animate(
            [
              { transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random() - 0.5) * 24}deg) scale(0.92)`, zIndex: 5 },
              { transform: 'none', zIndex: 5 },
            ],
            { duration: 520 + Math.random() * 260, easing: 'cubic-bezier(.2,1.1,.3,1)' },
          )
        }
      }
      i++
    }
  })

  useEffect(() => {
    const next = new Map<string, { x: number; y: number }>()
    for (const [id, el] of nodes.current) next.set(id, { x: el.offsetLeft, y: el.offsetTop })
    rects.current = next
  })

  // Gap and corner radius are fractions of a tile in the canvas renderer
  // (gap/100 and radius/200 of the tile size); mirror that on screen by
  // measuring the grid, so the preview matches the export and 3D mock-ups.
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [tilePx, setTilePx] = useState(150)
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => {
      const f = style.gap / 100
      setTilePx(el.clientWidth / (layout.cols + (layout.cols + 1) * f))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.cols, style.gap])

  const cssVars = {
    '--cols': layout.cols,
    '--gap': `${(style.gap / 100) * tilePx}px`,
    '--radius': `${(style.radius / 100) * tilePx * 0.5}px`,
    '--collage-bg': style.bg,
  } as CSSProperties

  return (
    <div className="collage-wrap">
      <SortableContext items={slotIds} strategy={rectSortingStrategy}>
        <div
          ref={gridRef}
          className={`collage ${style.bg === 'holo' ? 'bg-holo' : style.bg === 'chrome' ? 'bg-chrome' : ''}`}
          style={{ ...cssVars, position: 'relative', maxWidth: `${layout.cols * (layout.cols > 6 ? 110 : 150)}px` }}
        >
          {slots.map((album, i) => (
            <Tile
              key={slotIds[i]}
              id={slotIds[i]}
              index={i}
              album={album}
              activeFromPool={activeFromPool}
              selected={selected === i}
              hi={!!album && hiRes.has(album.id)}
              register={(el) => (el ? nodes.current.set(slotIds[i], el) : nodes.current.delete(slotIds[i]))}
              onSelect={() => onSelect(selected === i ? null : i)}
              onRemove={() => onRemove(i)}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

interface TileProps {
  id: string
  index: number
  album: Album | null
  activeFromPool: boolean
  selected: boolean
  hi: boolean
  register: (el: HTMLElement | null) => void
  onSelect: () => void
  onRemove: () => void
}

function Tile({ id, index, album, activeFromPool, selected, register, onSelect, onRemove }: TileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({
    id,
    disabled: !album,
  })
  const audio = usePlayerState()
  const hover = useHoverPreview(album)
  const ref = useRef<HTMLDivElement | null>(null)

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const showOver = isOver && activeFromPool
  const playing = !!album && audio.albumId === album.id && audio.status === 'playing'
  const loading = !!album && audio.albumId === album.id && (audio.status === 'loading' || audio.status === 'lookup')

  // Pointer-following tilt.
  const onMove = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || isDragging) return
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${px * 12}deg`)
    el.style.setProperty('--rx', `${-py * 12}deg`)
    el.style.setProperty('--s', '1.05')
  }
  const onLeave = (e: React.PointerEvent) => {
    const el = ref.current
    if (el) {
      el.style.setProperty('--ry', '0deg')
      el.style.setProperty('--rx', '0deg')
      el.style.setProperty('--s', '1')
    }
    hover.onPointerLeave(e)
  }

  return (
    <div
      ref={(el) => {
        setNodeRef(el)
        register(el)
        ref.current = el
      }}
      className={`tile ${album ? '' : 'empty'} ${isDragging ? 'dragging' : ''} ${showOver ? 'over' : ''} ${selected ? 'selected' : ''} ${
        playing ? 'playing' : ''
      } ${loading ? 'loading-audio' : ''}`}
      style={style}
      onClick={onSelect}
      onPointerEnter={hover.onPointerEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      title={album ? `${album.name} — ${album.artist}` : 'empty slot'}
      {...attributes}
      {...listeners}
    >
      {album ? (
        <>
          <div className="tile-inner">
            <img src={album.cover} alt={album.name} draggable={false} loading={index < 24 ? 'eager' : 'lazy'} />
          </div>
          <div className="tile-caption">
            <b>{album.name}</b>
            <span>{album.artist}</span>
          </div>
          <button
            className="tile-x"
            type="button"
            aria-label="remove from collage"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            ×
          </button>
        </>
      ) : (
        <span className="tile-caption" style={{ opacity: 0.6 }}>
          <span>drop here</span>
        </span>
      )}
    </div>
  )
}

export function DragGhost({ album }: { album: Album | null }) {
  if (!album) return null
  return (
    <div className="drag-ghost">
      <img src={album.thumb} alt="" />
    </div>
  )
}
