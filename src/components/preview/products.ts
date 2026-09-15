import type { ProductId } from '../../types'
import { paintBackground } from '../../collage/render'

export interface ProductSpec {
  id: ProductId
  label: string
  icon: string
  price: string
  size: string
  /** Print area aspect (w/h); null = follows the collage's own aspect. */
  aspect: number | null
  /** contain = whole collage with a border; cover = crop to fill. */
  fit: 'contain' | 'cover'
  margin: number
  /** Fixed background for the print area (e.g. a natural-canvas tote). */
  canvasBg?: string
  /** Extra artwork drawn over the design. */
  overlay?: 'puzzle'
  /** Wall-mounted items don't auto-rotate and can only be viewed from the front. */
  wall?: boolean
  /** Items that lie on a table are viewed from above. */
  flat?: boolean
  camera: [number, number, number]
}

export const PRODUCTS: ProductSpec[] = [
  { id: 'flag', label: 'wall flag', icon: '🏁', price: '$34', size: '3 × 5 ft', aspect: 5 / 3, fit: 'contain', margin: 0.04, wall: true, camera: [0, 0.1, 7] },
  { id: 'poster', label: 'poster', icon: '🖼️', price: '$19', size: '24 in', aspect: null, fit: 'contain', margin: 0.06, wall: true, camera: [0, 0.2, 6.8] },
  { id: 'tee', label: 't-shirt', icon: '👕', price: '$24', size: 'unisex · S–XXL', aspect: null, fit: 'contain', margin: 0, camera: [0, 0.2, 7.4] },
  { id: 'mug', label: 'mug', icon: '☕', price: '$14', size: '11 oz', aspect: null, fit: 'contain', margin: 0, camera: [0, 0.9, 6] },
  { id: 'pillow', label: 'pillow', icon: '🛋️', price: '$29', size: '18 × 18 in', aspect: 1, fit: 'contain', margin: 0.05, camera: [0, 0.9, 6.8] },
  { id: 'tote', label: 'tote bag', icon: '👜', price: '$22', size: '15 × 16 in', aspect: 2.8 / 3, fit: 'contain', margin: 0.12, canvasBg: '#efe6d6', camera: [0, 0.6, 7] },
  { id: 'case', label: 'phone case', icon: '📱', price: '$19', size: 'fits iPhone 17 Pro', aspect: 76 / 153, fit: 'cover', margin: 0, camera: [0, 0.4, 7] },
  { id: 'keychain', label: 'keychain', icon: '🔑', price: '$9', size: '2 × 2 in', aspect: 1, fit: 'contain', margin: 0.08, canvasBg: '#ffffff', camera: [0, 0.5, 6.6] },
  { id: 'mousepad', label: 'mousepad', icon: '🖱️', price: '$15', size: '9 × 7 in', aspect: 3.6 / 2.9, fit: 'contain', margin: 0.03, flat: true, camera: [0, 5.4, 3.8] },
  { id: 'puzzle', label: 'puzzle', icon: '🧩', price: '$27', size: 'pieces', aspect: null, fit: 'contain', margin: 0, overlay: 'puzzle', flat: true, camera: [0, 5.2, 4] },
]

/**
 * Paints the product's print design (background + the collage fitted inside)
 * into `target`, sized for the GPU. Returns the design's aspect ratio.
 */
export function drawDesign(target: HTMLCanvasElement, collage: HTMLCanvasElement, spec: ProductSpec, bg: string): number {
  const collageAspect = collage.width / Math.max(1, collage.height)
  const aspect = spec.aspect ?? collageAspect
  const MAX = 2048
  const w = aspect >= 1 ? MAX : Math.round(MAX * aspect)
  const h = aspect >= 1 ? Math.round(MAX / aspect) : MAX
  target.width = w
  target.height = h
  const ctx = target.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  paintBackground(ctx, w, h, spec.canvasBg ?? (spec.id === 'poster' ? '#fbfbf7' : bg))

  const m = spec.margin
  const availW = w * (1 - 2 * m)
  const availH = h * (1 - 2 * m)
  const scale =
    spec.fit === 'cover' ? Math.max(availW / collage.width, availH / collage.height) : Math.min(availW / collage.width, availH / collage.height)
  const dw = collage.width * scale
  const dh = collage.height * scale
  const dx = (w - dw) / 2
  const dy = (h - dh) / 2
  if (spec.id === 'poster') {
    ctx.shadowColor = 'rgba(0,0,0,0.18)'
    ctx.shadowBlur = w * 0.01
    ctx.shadowOffsetY = w * 0.003
  }
  ctx.drawImage(collage, dx, dy, dw, dh)
  ctx.shadowColor = 'transparent'

  if (spec.overlay === 'puzzle') {
    const { cols } = puzzlePieces(collage)
    drawJigsaw(ctx, 0, 0, w, h, cols)
  }
  return aspect
}

/** Jigsaw grid for a collage: three pieces per album column, rows to match. */
export function puzzlePieces(collage: HTMLCanvasElement) {
  const albumCols = Number(collage.dataset.cols) || 4
  const cols = Math.max(9, albumCols * 3)
  const rows = Math.max(3, Math.round((cols * collage.height) / Math.max(1, collage.width)))
  return { cols, rows, count: cols * rows }
}

/** Jigsaw cut lines: alternating knobs on every internal edge. */
function drawJigsaw(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cols: number) {
  const rows = Math.max(3, Math.round((cols * h) / w))
  const cw = w / cols
  const ch = h / rows
  const r = Math.min(cw, ch) * 0.14
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const pass = (color: string, width: number, off: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    for (let j = 1; j < rows; j++) {
      const yy = y + j * ch + off
      ctx.beginPath()
      ctx.moveTo(x, yy)
      for (let i = 0; i < cols; i++) {
        const x0 = x + i * cw
        const xm = x0 + cw / 2
        const up = (i + j) % 2 === 0
        ctx.lineTo(xm - r * 1.15, yy)
        ctx.arc(xm, yy, r, Math.PI, 0, up)
        ctx.lineTo(x0 + cw, yy)
      }
      ctx.stroke()
    }
    for (let i = 1; i < cols; i++) {
      const xx = x + i * cw + off
      ctx.beginPath()
      ctx.moveTo(xx, y)
      for (let j = 0; j < rows; j++) {
        const y0 = y + j * ch
        const ym = y0 + ch / 2
        const left = (i + j) % 2 === 0
        ctx.lineTo(xx, ym - r * 1.15)
        ctx.arc(xx, ym, r, -Math.PI / 2, Math.PI / 2, left)
        ctx.lineTo(xx, y0 + ch)
      }
      ctx.stroke()
    }
  }
  pass('rgba(255,255,255,0.35)', Math.max(1, w * 0.0022), -Math.max(1, w * 0.0012))
  pass('rgba(0,0,0,0.6)', Math.max(1, w * 0.0022), 0)
  ctx.restore()
}
