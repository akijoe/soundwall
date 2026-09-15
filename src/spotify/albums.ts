import type { Album, AlbumScores, RankMode } from '../types'
import { getRecentlyPlayed, getSavedAlbums, getTopTracks, type SpotifyAlbum, type TimeRange } from './api'

export type Progress = (msg: string, pct: number) => void

const RANGE_WEIGHT: Record<string, number> = { long: 1, medium: 0.85, short: 0.7 }

const RANGES: { range: TimeRange; key: keyof AlbumScores }[] = [
  { range: 'long_term', key: 'long' },
  { range: 'medium_term', key: 'medium' },
  { range: 'short_term', key: 'short' },
]

function largest(images: SpotifyAlbum['images']) {
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
}

function toAlbum(a: SpotifyAlbum): Album {
  const imgs = largest(a.images)
  const cover = imgs[0]?.url ?? ''
  const thumb = imgs.find((i) => (i.width ?? 0) <= 320)?.url ?? cover
  const type = a.album_type === 'single' || a.album_type === 'compilation' ? a.album_type : 'album'
  return {
    id: a.id,
    name: a.name,
    artist: a.artists.map((x) => x.name).join(', '),
    artists: a.artists.map((x) => x.name),
    albumType: type,
    year: (a.release_date ?? '').slice(0, 4),
    spotifyUrl: a.external_urls?.spotify ?? `https://open.spotify.com/album/${a.id}`,
    cover,
    thumb,
    scores: { short: 0, medium: 0, long: 0, saved: 0, recent: 0 },
  }
}

/**
 * Spotify has no "top albums" endpoint, so we derive one: every top track
 * votes for its album (weighted by rank and time range), then saved albums and
 * recent plays pad out the pool. Duplicate releases (clean/explicit re-uploads)
 * collapse onto one entry by name + artist.
 */
export async function buildLibrary(progress: Progress): Promise<Album[]> {
  const byId = new Map<string, Album>()
  const byKey = new Map<string, string>()
  const trackScore = new Map<string, number>()
  const errors: string[] = []
  const note = (what: string, e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`${what}: ${msg}`)
    console.warn(`[spotify] ${what} failed —`, msg)
  }

  /** Remember the best-scoring track per album as its "top track". */
  const noteTrack = (album: Album, t: { name: string; artists: { name: string }[] }, score: number) => {
    if ((trackScore.get(album.id) ?? -1) >= score) return
    trackScore.set(album.id, score)
    album.topTrack = { name: t.name, artist: t.artists[0]?.name ?? album.artists[0] }
  }

  let seen = 0
  let noArt = 0
  const upsert = (raw: SpotifyAlbum): Album => {
    seen++
    if (!raw?.id) return null as unknown as Album
    if (!raw.images?.length) {
      noArt++
      return null as unknown as Album
    }
    const key = `${raw.name}|${raw.artists?.[0]?.name ?? ''}`.toLowerCase().replace(/\s+/g, ' ').trim()
    const existingId = byId.has(raw.id) ? raw.id : byKey.get(key)
    if (existingId) return byId.get(existingId)!
    const album = toAlbum(raw)
    byId.set(album.id, album)
    byKey.set(key, album.id)
    return album
  }

  let step = 0
  const totalSteps = RANGES.length * 2 + 2
  for (const { range, key } of RANGES) {
    for (const offset of [0, 50]) {
      progress(`Reading your ${labelFor(range)} top tracks…`, (step++ / totalSteps) * 100)
      try {
        const page = await getTopTracks(range, offset)
        page.items.forEach((t, i) => {
          const album = upsert(t.album)
          if (!album) return
          const pts = 100 - (offset + i)
          album.scores[key] += pts
          noteTrack(album, t, pts * RANGE_WEIGHT[key])
        })
        if (!page.next) {
          step++
          break
        }
      } catch (e) {
        note(`top tracks (${labelFor(range)})`, e)
        step++
        break
      }
    }
  }

  progress('Digging through your saved albums…', (step++ / totalSteps) * 100)
  try {
    let offset = 0
    for (let page = 0; page < 20; page++) {
      const res = await getSavedAlbums(offset)
      res.items.forEach(({ album }) => {
        const a = upsert(album)
        if (a) a.scores.saved += 1
      })
      if (!res.next) break
      offset += 50
      progress(`Digging through your saved albums… (${offset}/${res.total})`, (step / totalSteps) * 100)
    }
  } catch (e) {
    note('saved albums', e)
  }

  progress('Checking what you played lately…', (step++ / totalSteps) * 100)
  try {
    const res = await getRecentlyPlayed()
    res.items.forEach(({ track }) => {
      const a = upsert(track.album)
      if (!a) return
      a.scores.recent += 1
      noteTrack(a, track, 1)
    })
  } catch (e) {
    note('recently played', e)
  }

  progress('Polishing chrome…', 100)
  if (byId.size === 0 && errors.length) {
    throw new Error(`Spotify wouldn't hand over your listening data — ${errors[0]}`)
  }
  if (byId.size === 0 && seen > 0) {
    throw new Error(`Spotify sent ${seen} items but none had album artwork (${noArt} without images) — please report this.`)
  }
  return [...byId.values()]
}

function labelFor(range: TimeRange) {
  return range === 'short_term' ? 'last-4-weeks' : range === 'medium_term' ? 'last-6-months' : 'all-time'
}

export function rankScore(a: Album, mode: RankMode): number {
  const s = a.scores
  switch (mode) {
    case 'short':
      return s.short * 10 + s.medium * 0.3 + s.long * 0.2 + s.recent * 4 + s.saved * 0.5
    case 'medium':
      return s.medium * 10 + s.short * 0.3 + s.long * 0.3 + s.recent + s.saved * 0.5
    case 'long':
      return s.long * 10 + s.medium * 0.3 + s.short * 0.2 + s.recent * 0.5 + s.saved * 0.5
    default:
      return s.long + s.medium * 0.85 + s.short * 0.7 + s.recent * 6 + s.saved * 10
  }
}

export function rankAlbums(albums: Album[], mode: RankMode, includeSingles: boolean): Album[] {
  return albums
    .filter((a) => includeSingles || a.albumType !== 'single')
    .map((a) => ({ a, s: rankScore(a, mode) }))
    .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
    .map((x) => x.a)
}
