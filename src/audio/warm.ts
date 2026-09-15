import type { Album } from '../types'
import { player } from './player'
import { resolvePreview } from './resolve'

// Prefetch previews for the albums on screen: resolve the clip, pull it into
// the HTTP cache, decode once to find the hook. Staggered so the iTunes
// Search API (≈20 req/min per IP) isn't tripped; hovers jump the queue
// naturally because every step is memoised.

const STAGGER = 650
let generation = 0

export function warmPreviews(albums: Album[]) {
  const gen = ++generation
  ;(async () => {
    for (const album of albums) {
      if (gen !== generation) return
      try {
        const info = await resolvePreview(album)
        if (gen !== generation) return
        await player.preload(info.url)
      } catch {
        /* no preview for this one — the hover path will say so */
      }
      await new Promise((r) => setTimeout(r, STAGGER))
    }
  })()
}
