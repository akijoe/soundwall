import { arrayMove } from '@dnd-kit/sortable'
import type { Album, CollageStyle, Layout, RankMode } from '../types'
import { rankAlbums } from '../spotify/albums'

export interface CollageState {
  library: Album[]
  byId: Map<string, Album>
  mode: RankMode
  includeSingles: boolean
  layout: Layout
  style: CollageStyle
  /** Album ids per slot, row-major. */
  grid: (string | null)[]
  /** Bumped whenever the grid should animate into its new arrangement. */
  flipToken: number
}

export type CollageAction =
  | { type: 'init'; library: Album[] }
  | { type: 'layout'; layout: Layout }
  | { type: 'mode'; mode: RankMode }
  | { type: 'singles'; include: boolean }
  | { type: 'move'; from: number; to: number }
  | { type: 'place'; index: number; albumId: string }
  | { type: 'remove'; index: number }
  | { type: 'shuffle' }
  | { type: 'reset' }
  | { type: 'style'; patch: Partial<CollageStyle> }

export const LAYOUTS: (Layout & { label: string })[] = [
  { cols: 4, rows: 4, label: '4×4 · 16' },
  { cols: 8, rows: 4, label: '8×4 · 32' },
  { cols: 5, rows: 3, label: '5×3 · 15' },
  { cols: 6, rows: 4, label: '6×4 · 24' },
  { cols: 5, rows: 5, label: '5×5 · 25' },
  { cols: 6, rows: 6, label: '6×6 · 36' },
  { cols: 10, rows: 5, label: '10×5 · 50' },
]

export const initialState: CollageState = {
  library: [],
  byId: new Map(),
  mode: 'mix',
  includeSingles: true,
  layout: LAYOUTS[0],
  style: { gap: 0, radius: 0, bg: '#0b0620' },
  grid: Array(16).fill(null),
  flipToken: 0,
}

export function ranked(s: CollageState): Album[] {
  return rankAlbums(s.library, s.mode, s.includeSingles)
}

function fill(grid: (string | null)[], order: Album[], size: number): (string | null)[] {
  const next = grid.slice(0, size)
  while (next.length < size) next.push(null)
  const used = new Set(next.filter(Boolean) as string[])
  let cursor = 0
  for (let i = 0; i < size; i++) {
    if (next[i]) continue
    while (cursor < order.length && used.has(order[cursor].id)) cursor++
    if (cursor >= order.length) break
    next[i] = order[cursor].id
    used.add(order[cursor].id)
  }
  return next
}

function topN(s: CollageState): (string | null)[] {
  return fill(Array(s.layout.cols * s.layout.rows).fill(null), ranked(s), s.layout.cols * s.layout.rows)
}

export function reducer(s: CollageState, a: CollageAction): CollageState {
  const size = s.layout.cols * s.layout.rows
  switch (a.type) {
    case 'init': {
      const next = { ...s, library: a.library, byId: new Map(a.library.map((x) => [x.id, x])) }
      return { ...next, grid: topN(next) }
    }
    case 'layout': {
      const next = { ...s, layout: a.layout }
      return { ...next, grid: fill(s.grid, ranked(next), a.layout.cols * a.layout.rows), flipToken: s.flipToken + 1 }
    }
    case 'mode': {
      const next = { ...s, mode: a.mode }
      return { ...next, grid: topN(next), flipToken: s.flipToken + 1 }
    }
    case 'singles': {
      const next = { ...s, includeSingles: a.include }
      const pruned = a.include ? s.grid : s.grid.map((id) => (id && s.byId.get(id)?.albumType === 'single' ? null : id))
      return { ...next, grid: fill(pruned, ranked(next), size), flipToken: s.flipToken + 1 }
    }
    case 'move':
      if (a.from === a.to) return s
      return { ...s, grid: arrayMove(s.grid, a.from, a.to) }
    case 'place': {
      const grid = [...s.grid]
      const existing = grid.indexOf(a.albumId)
      if (existing === a.index) return s
      if (existing >= 0) grid[existing] = grid[a.index]
      grid[a.index] = a.albumId
      return { ...s, grid }
    }
    case 'remove': {
      // Leaves the slot empty; the album is back in the pool.
      const grid = [...s.grid]
      grid[a.index] = null
      return { ...s, grid }
    }
    case 'shuffle': {
      const grid = [...s.grid]
      for (let i = grid.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[grid[i], grid[j]] = [grid[j], grid[i]]
      }
      return { ...s, grid, flipToken: s.flipToken + 1 }
    }
    case 'reset':
      return { ...s, grid: topN(s), flipToken: s.flipToken + 1 }
    case 'style':
      return { ...s, style: { ...s.style, ...a.patch } }
  }
}
