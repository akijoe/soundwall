import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Album, ProductId, RankMode } from '../types'
import { LAYOUTS, initialState, ranked, reducer } from '../state/collage'
import { useCollageCanvas } from '../collage/useCollageCanvas'
import { exportTileSize, renderCollage } from '../collage/render'
import { Win } from './Win'
import { CollageGrid, DragGhost } from './CollageGrid'
import { AlbumPool } from './AlbumPool'
import { ProductViewer } from './preview/ProductViewer'
import { useToast } from './Toast'
import { kofiModal } from './Kofi'
import { player } from '../audio/player'
import { startPreview, stopPreview } from '../audio/hover'
import { warmPreviews } from '../audio/warm'

interface Props {
  library: Album[]
  demo: boolean
}

const MODES: { id: RankMode; label: string }[] = [
  { id: 'mix', label: 'mix' },
  { id: 'short', label: '4 weeks' },
  { id: 'medium', label: '6 months' },
  { id: 'long', label: 'all time' },
]

const SWATCHES = ['#0b0620', '#000000', '#ffffff', '#ff2fb3', '#3cf0ff', '#c8ff00', 'holo', 'chrome']

const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args)
  return within.length ? within : closestCenter(args)
}

export function Studio({ library, demo }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState, (s) => reducer(s, { type: 'init', library }))
  const toast = useToast()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [product, setProduct] = useState<ProductId>('flag')

  const slots = useMemo(() => state.grid.map((id) => (id ? state.byId.get(id) ?? null : null)), [state.grid, state.byId])
  const slotIds = useMemo(() => state.grid.map((id, i) => (id ? `slot:${id}` : `empty:${i}`)), [state.grid])
  const rankedList = useMemo(() => ranked(state), [state.library, state.mode, state.includeSingles]) // eslint-disable-line react-hooks/exhaustive-deps
  const poolAlbums = useMemo(() => {
    const inGrid = new Set(state.grid)
    return rankedList.filter((a) => !inGrid.has(a.id))
  }, [rankedList, state.grid])

  const { canvas, version, covers, loaded, total } = useCollageCanvas(slots, state.layout, state.style)

  // Prefetch previews for everything on the collage so hovers start instantly.
  useEffect(() => {
    const t = setTimeout(() => warmPreviews(slots.filter((a): a is Album => !!a)), 300)
    return () => clearTimeout(t)
  }, [slots])

  // Selecting a tile also plays it (touch users have no hover).
  const select = (i: number | null) => {
    setSelected(i)
    const album = i === null ? null : slots[i]
    if (album) startPreview(album)
  }
  const hiRes = useMemo(() => new Set([...covers].filter(([, c]) => c.hiRes).map(([id]) => id)), [covers, version]) // eslint-disable-line react-hooks/exhaustive-deps

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeAlbum = useMemo(() => {
    if (!activeId) return null
    const id = activeId.replace(/^(pool|slot):/, '')
    return state.byId.get(id) ?? null
  }, [activeId, state.byId])
  const activeFromPool = !!activeId?.startsWith('pool:')
  const activeFromGrid = !!activeId?.startsWith('slot:')

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setSelected(null)
    player.blip('pick')
  }, [])

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null)
      const { active, over } = e
      if (!over) return
      player.blip('drop')
      const a = String(active.id)
      const o = String(over.id)
      if (a.startsWith('slot:')) {
        if (o === 'pool') {
          dispatch({ type: 'remove', index: slotIds.indexOf(a) })
          return
        }
        const from = slotIds.indexOf(a)
        const to = slotIds.indexOf(o)
        if (from >= 0 && to >= 0) dispatch({ type: 'move', from, to })
      } else if (a.startsWith('pool:')) {
        const to = slotIds.indexOf(o)
        if (to >= 0) dispatch({ type: 'place', index: to, albumId: a.slice(5) })
      }
    },
    [slotIds, toast],
  )

  const pick = (album: Album) => {
    // Selected slot first, then the first empty slot, then the last slot.
    const firstEmpty = state.grid.indexOf(null)
    const index = selected ?? (firstEmpty >= 0 ? firstEmpty : state.grid.length - 1)
    player.blip('drop')
    dispatch({ type: 'place', index, albumId: album.id })
    toast(`${album.name} → slot #${index + 1}`, 'ok')
    if (selected !== null) startPreview(album)
  }

  const exportPng = async () => {
    if (loaded < total) toast('Some covers are still loading — exporting what we have', 'info')
    toast('Rendering full-res PNG…')
    await new Promise((r) => setTimeout(r, 30))
    const tile = exportTileSize(state.layout, covers)
    const c = document.createElement('canvas')
    renderCollage(c, slots, covers, { ...state.layout, ...state.style, tile })
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
    if (!blob) {
      toast('Export failed — canvas too large for this browser?', 'err')
      return
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `soundwall-${state.layout.cols}x${state.layout.rows}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    toast(`Saved a ${c.width}×${c.height} PNG`, 'ok')
    kofiModal.show()
  }

  const copyPng = async () => {
    try {
      const tile = Math.min(exportTileSize(state.layout, covers), 800)
      const c = document.createElement('canvas')
      renderCollage(c, slots, covers, { ...state.layout, ...state.style, tile })
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
      if (!blob) throw new Error('no blob')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast('Copied to clipboard', 'ok')
      kofiModal.show()
    } catch {
      toast('Clipboard blocked — use download instead', 'err')
    }
  }

  const exportTile = exportTileSize(state.layout, covers)
  const exportW = state.layout.cols * exportTile
  const exportH = state.layout.rows * exportTile
  // Photographic PNGs land around 1.7 bytes per pixel.
  const exportMb = (exportW * exportH * 1.7) / 1e6
  const exportSize = exportMb >= 10 ? `~${Math.round(exportMb / 5) * 5} MB` : `~${exportMb.toFixed(1)} MB`
  const hqCount = slots.filter((a) => a && hiRes.has(a.id)).length

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="studio">
        <div className="studio-col">
          <Win
            title={`Your collage${demo ? ' · demo' : ''}`}
            right={
              loaded < total ? (
                <span className="label">
                  Loading covers <span className="num">{loaded}/{total}</span>
                </span>
              ) : null
            }
          >
            <div className="toolbar">
              <select
                className="select"
                value={`${state.layout.cols}x${state.layout.rows}`}
                onChange={(e) => {
                  const [c, r] = e.target.value.split('x').map(Number)
                  dispatch({ type: 'layout', layout: { cols: c, rows: r } })
                }}
                aria-label="grid size"
              >
                {LAYOUTS.map((l) => (
                  <option key={l.label} value={`${l.cols}x${l.rows}`}>
                    {l.label}
                  </option>
                ))}
              </select>
              <div className="seg" role="radiogroup" aria-label="time range">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    role="radio"
                    aria-checked={state.mode === m.id}
                    className={`chip ${state.mode === m.id ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'mode', mode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <span className="spacer" />
              <button
                className="btn btn-sm btn-violet"
                onClick={() => {
                  player.blip('shuffle')
                  dispatch({ type: 'shuffle' })
                }}
              >
                Shuffle
              </button>
              <button
                className="btn btn-sm btn-silver"
                onClick={() => {
                  player.blip('tab')
                  dispatch({ type: 'reset' })
                }}
              >
                Reset
              </button>
            </div>

            <CollageGrid
              slots={slots}
              slotIds={slotIds}
              layout={state.layout}
              style={state.style}
              flipToken={state.flipToken}
              activeFromPool={activeFromPool}
              selected={selected}
              hiRes={hiRes}
              onSelect={select}
              onRemove={(i) => {
                if (i === selected) stopPreview()
                dispatch({ type: 'remove', index: i })
              }}
            />

            <div className="toolbar" style={{ marginTop: 14, marginBottom: 0 }}>
              <span className="label">Gap</span>
              <input
                className="range"
                type="range"
                min={0}
                max={40}
                value={state.style.gap}
                onChange={(e) => dispatch({ type: 'style', patch: { gap: Number(e.target.value) } })}
                aria-label="gap"
              />
              <span className="label">Corners</span>
              <input
                className="range"
                type="range"
                min={0}
                max={100}
                value={state.style.radius}
                onChange={(e) => dispatch({ type: 'style', patch: { radius: Number(e.target.value) } })}
                aria-label="corner radius"
              />
              <span className="label">Background</span>
              <span className="swatches">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${c === 'holo' ? 'holo' : c === 'chrome' ? 'chrome' : ''} ${state.style.bg === c ? 'active' : ''}`}
                    style={{ '--c': c } as React.CSSProperties}
                    onClick={() => dispatch({ type: 'style', patch: { bg: c } })}
                    aria-label={`background ${c}`}
                    title={c}
                  />
                ))}
              </span>
              <span className="spacer" />
              <button className="btn btn-sm" onClick={copyPng}>
                Copy
              </button>
              <button className="btn btn-sm btn-lime" onClick={exportPng} title={`${exportW} × ${exportH} px`}>
                Download PNG · {exportSize}
              </button>
            </div>
            <p className="hint export-note">
              Full resolution — every cover is {exportTile} px, so the file is print-ready and big.
            </p>
          </Win>

          <Win title="More albums">
            <AlbumPool
              albums={poolAlbums}
              activeFromGrid={activeFromGrid}
              onPick={pick}
              includeSingles={state.includeSingles}
              onToggleSingles={(v) => dispatch({ type: 'singles', include: v })}
              selectedSlot={selected}
            />
          </Win>
        </div>

        <div className="studio-col">
          <Win title="Print preview">
            <ProductViewer
              product={product}
              onProduct={(p) => {
                player.blip('tab')
                setProduct(p)
              }}
              collage={canvas}
              version={version}
              bg={state.style.bg}
            />
            <div className="preview-actions">
              <button className="btn btn-ice" onClick={() => toast('Ordering is coming soon — for now, download the PNG and take it to any print shop.')}>
                Order · coming soon
              </button>
              <span className="hint" style={{ margin: 0 }}>
                Prints up to <span className="num">{(exportW / 300).toFixed(0)} × {(exportH / 300).toFixed(0)} in</span>
                {hqCount === total && total > 0 ? ' · all covers in HD' : hqCount > 0 ? ` · ${hqCount}/${total} covers in HD` : ''}
              </span>
            </div>
          </Win>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(.2,1,.3,1)' }}>
        <DragGhost album={activeAlbum} />
      </DragOverlay>
    </DndContext>
  )
}
