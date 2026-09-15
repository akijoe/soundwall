import type { Album } from '../types'
import data from './demoData.json'

// Demo mode = a snapshot of what people are playing most right now (Apple
// Music's US "most played" albums), with each album's charting song as its
// preview. Refresh it with `node scripts/build-demo.mjs`.

interface DemoAlbum {
  id: string
  name: string
  artist: string
  year: string
  cover: string
  thumb: string
  url: string
  track: string
  trackArtist: string
  previewUrl: string
  chartRank: number
  hitRank: number | null
}

export const DEMO_GENERATED_AT = (data as { generatedAt: string }).generatedAt

export function makeDemoLibrary(): Album[] {
  const albums = (data as { albums: DemoAlbum[] }).albums
  return albums.map((a, i) => {
    const artists = a.artist.split(/,\s*|\s&\s/).map((s) => s.trim())
    // Rank drives the scores so the grid starts with the chart order; the
    // shorter ranges are shuffled a little so the time-range chips do something.
    const base = 100 - i * (100 / albums.length)
    return {
      id: a.id,
      name: a.name,
      artist: a.artist,
      artists,
      albumType: 'album',
      year: a.year,
      spotifyUrl: a.url,
      cover: a.cover,
      thumb: a.thumb,
      scores: {
        long: base,
        medium: 100 - ((i * 7) % albums.length) * (100 / albums.length),
        short: 100 - ((i * 13) % albums.length) * (100 / albums.length),
        saved: 1,
        recent: a.hitRank ? 1 : 0,
      },
      topTrack: { name: a.track, artist: a.trackArtist },
      previewUrl: a.previewUrl,
    }
  })
}
