import type { Album } from '../types'

// The Web API tops out at 640×640 covers (image id prefix ab67616d0000b273),
// but Spotify's CDN also serves a 1500×1500 rendition of most covers under the
// ab67616d000082c1 prefix. We try that first and fall back to 640.
const STD_PREFIX = 'ab67616d0000b273'
const HI_PREFIX = 'ab67616d000082c1'

export interface LoadedCover {
  img: HTMLImageElement
  size: number
  hiRes: boolean
}

const cache = new Map<string, Promise<LoadedCover>>()

export function hiResUrl(url: string): string | null {
  return url.includes(STD_PREFIX) ? url.replace(STD_PREFIX, HI_PREFIX) : null
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`failed: ${src}`))
    img.src = src
  })
}

// Small concurrency gate so a 36-tile grid doesn't fire 72 requests at once.
let active = 0
const queue: (() => void)[] = []
const MAX_ACTIVE = 6
function gate<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      active++
      fn()
        .then(resolve, reject)
        .finally(() => {
          active--
          queue.shift()?.()
        })
    }
    active < MAX_ACTIVE ? run() : queue.push(run)
  })
}

export function loadCover(album: Album): Promise<LoadedCover> {
  let p = cache.get(album.id)
  if (!p) {
    p = gate(async () => {
      const hi = hiResUrl(album.cover)
      if (hi) {
        try {
          const img = await loadImage(hi)
          return { img, size: img.naturalWidth, hiRes: true }
        } catch {
          /* no 1500px rendition for this one */
        }
      }
      const img = await loadImage(album.cover)
      return { img, size: img.naturalWidth, hiRes: img.naturalWidth >= 1000 }
    })
    cache.set(album.id, p)
    p.catch(() => cache.delete(album.id))
  }
  return p
}

export function peekCover(albumId: string): Promise<LoadedCover> | undefined {
  return cache.get(albumId)
}
