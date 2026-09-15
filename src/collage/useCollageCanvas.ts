import { useEffect, useMemo, useRef, useState } from 'react'
import type { Album, CollageStyle, Layout } from '../types'
import { loadCover, type LoadedCover } from './images'
import { renderCollage } from './render'

/**
 * Owns the offscreen "master" collage canvas: loads covers for whatever is in
 * the grid and re-renders whenever the grid, layout or style changes.
 * `version` bumps on every repaint so consumers (the 3D texture) can react.
 */
export function useCollageCanvas(slots: (Album | null)[], layout: Layout, style: CollageStyle) {
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const covers = useRef(new Map<string, LoadedCover>())
  const [version, setVersion] = useState(0)
  const [loaded, setLoaded] = useState(0)

  const ids = slots.map((a) => a?.id ?? '').join(',')

  useEffect(() => {
    let cancelled = false
    const wanted = slots.filter(Boolean) as Album[]
    const repaint = () => {
      if (cancelled) return
      // Keep the 3D texture reasonably sized; the export path renders bigger.
      const tile = Math.min(512, Math.floor(2048 / Math.max(layout.cols, layout.rows)))
      renderCollage(canvas, slots, covers.current, { ...layout, ...style, tile })
      canvas.dataset.cols = String(layout.cols)
      canvas.dataset.rows = String(layout.rows)
      setVersion((v) => v + 1)
      setLoaded(wanted.filter((a) => covers.current.has(a.id)).length)
    }
    repaint()
    let pending = 0
    let raf = 0
    const scheduleRepaint = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(repaint)
    }
    for (const album of wanted) {
      if (covers.current.has(album.id)) continue
      pending++
      loadCover(album)
        .then((c) => {
          covers.current.set(album.id, c)
          scheduleRepaint()
        })
        .catch(() => {})
        .finally(() => {
          pending--
        })
    }
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, layout.cols, layout.rows, style.gap, style.radius, style.bg])

  return { canvas, version, covers: covers.current, loaded, total: slots.filter(Boolean).length }
}
