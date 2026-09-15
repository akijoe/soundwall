import type { Album, CollageStyle, Layout } from '../types'
import type { LoadedCover } from './images'

export interface RenderOpts extends Layout, CollageStyle {
  /** Pixel size of one tile. */
  tile: number
}

export function collageSize(o: RenderOpts) {
  const gapPx = Math.round((o.gap / 100) * o.tile)
  const w = o.cols * o.tile + (o.cols + 1) * gapPx
  const h = o.rows * o.tile + (o.rows + 1) * gapPx
  return { w, h, gapPx }
}

/**
 * Draws the grid into `canvas`. Slots without a loaded cover get a subtle
 * placeholder so the layout is always visible.
 */
export function renderCollage(
  canvas: HTMLCanvasElement,
  slots: (Album | null)[],
  covers: Map<string, LoadedCover>,
  o: RenderOpts,
) {
  const { w, h, gapPx } = collageSize(o)
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  paintBackground(ctx, w, h, o.bg)

  const radius = (o.radius / 100) * o.tile * 0.5
  for (let i = 0; i < o.cols * o.rows; i++) {
    const col = i % o.cols
    const row = Math.floor(i / o.cols)
    const x = gapPx + col * (o.tile + gapPx)
    const y = gapPx + row * (o.tile + gapPx)
    const album = slots[i]
    const cover = album ? covers.get(album.id) : undefined

    ctx.save()
    if (radius > 0) {
      roundRect(ctx, x, y, o.tile, o.tile, radius)
      ctx.clip()
    }
    if (cover) {
      ctx.drawImage(cover.img, x, y, o.tile, o.tile)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.08)'
      ctx.fillRect(x, y, o.tile, o.tile)
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'
      ctx.lineWidth = Math.max(1, o.tile * 0.01)
      ctx.setLineDash([o.tile * 0.05, o.tile * 0.04])
      ctx.strokeRect(x + o.tile * 0.05, y + o.tile * 0.05, o.tile * 0.9, o.tile * 0.9)
    }
    ctx.restore()
  }
}

export function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number, bg: string) {
  if (bg === 'holo') {
    const g = ctx.createLinearGradient(0, 0, w, h)
    ;['#ff6ad5', '#c774e8', '#ad8cff', '#8795e8', '#94d0ff', '#b8ffb3', '#fff59d', '#ff6ad5'].forEach((c, i, a) =>
      g.addColorStop(i / (a.length - 1), c),
    )
    ctx.fillStyle = g
  } else if (bg === 'chrome') {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    ;[
      [0, '#ffffff'],
      [0.3, '#dfe6ee'],
      [0.48, '#6b7687'],
      [0.52, '#d8dee6'],
      [0.7, '#ffffff'],
      [1, '#98a3b3'],
    ].forEach(([s, c]) => g.addColorStop(s as number, c as string))
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = bg
  }
  ctx.fillRect(0, 0, w, h)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Biggest tile we can afford for export without blowing canvas limits. */
export function exportTileSize(layout: Layout, covers: Map<string, LoadedCover>): number {
  const MAX_SIDE = 8192
  const best = Math.max(640, ...[...covers.values()].map((c) => c.size))
  return Math.min(best, Math.floor(MAX_SIDE / Math.max(layout.cols, layout.rows)))
}
