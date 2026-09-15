import type { Album } from '../types'
import { getAlbumTracks, searchTracks } from '../spotify/api'

// Spotify stopped handing out 30-second preview URLs to new apps in late
// 2024, so previews come from the iTunes Search API (CORS-enabled, stable
// URLs) with Deezer (JSONP) as a fallback. The *track* is still chosen with
// Spotify data: the album's most popular song.

export interface PreviewInfo {
  url: string
  track: string
  artist: string
  source: 'itunes' | 'deezer'
  popularity: number | null
  /** True when the match is a loose guess (demo mode). */
  loose?: boolean
}

export class NoPreview extends Error {}

/** ISO country of the listener (from the Spotify profile) for store lookups. */
let market = 'US'
export function setMarket(country?: string | null) {
  if (country && /^[A-Z]{2}$/.test(country)) market = country
}

/* ---------- top track per album ---------- */

export interface TopTrack {
  name: string
  artist: string
  popularity: number | null
}

const topCache = new Map<string, Promise<TopTrack | null>>()

/**
 * The song to preview for an album. Grid albums almost always carry the
 * listener's own most-played track (free, from the data we already loaded);
 * otherwise one search call ranks the album's songs by popularity.
 */
export function topTrack(album: Album): Promise<TopTrack | null> {
  if (album.topTrack) return Promise.resolve({ ...album.topTrack, popularity: null })
  let p = topCache.get(album.id)
  if (!p) {
    p = (async () => {
      const artist = album.artists[0] ?? album.artist
      try {
        const { tracks } = await searchTracks(`album:"${album.name}" artist:"${artist}"`)
        const own = tracks.items.filter((t) => t.album?.id === album.id || norm(t.album?.name ?? '') === norm(album.name))
        const best = (own.length ? own : tracks.items).sort((a, b) => b.popularity - a.popularity)[0]
        if (best) return { name: best.name, artist: best.artists[0]?.name ?? artist, popularity: best.popularity }
      } catch {
        /* search unavailable — fall through */
      }
      const page = await getAlbumTracks(album.id)
      const first = page.items[0]
      return first ? { name: first.name, artist: first.artists[0]?.name ?? artist, popularity: null } : null
    })()
    topCache.set(album.id, p)
    p.catch(() => topCache.delete(album.id))
  }
  return p
}

/** Warm the lookups for albums that lack listener data (e.g. saved-only albums in the grid). */
export function prefetchTopTracks(albums: Album[]) {
  for (const a of albums) if (!a.topTrack) topTrack(a).catch(() => {})
}

/* ---------- preview clip lookup ---------- */

const memo = new Map<string, Promise<PreviewInfo>>()
const LS_KEY = 'soundwall.previews.v3'

function loadPersisted(): Record<string, PreviewInfo> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}
const persisted = loadPersisted()
function persist(id: string, info: PreviewInfo) {
  if (info.source !== 'itunes') return // Deezer URLs are signed and expire
  persisted[id] = info
  try {
    const keys = Object.keys(persisted)
    if (keys.length > 400) delete persisted[keys[0]]
    localStorage.setItem(LS_KEY, JSON.stringify(persisted))
  } catch {
    /* quota — ignore */
  }
}

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\((feat|ft|with)\.?[^)]*\)|\[[^\]]*\]/g, '')
    .replace(/\s[-–]\s.*$/, '')
    .replace(/\((.*?)(remaster|deluxe|edit|version|live|mix|mono|stereo|bonus|explicit)[^)]*\)/g, '')
    .replace(/\b(feat|ft)\.?\s.*$/, '')
    .replace(/[^a-z0-9À-ɏ]+/g, ' ')
    .trim()
}

const VARIANT = /\b(acoustic|live|remix|rmx|karaoke|instrumental|cover|tribute|sped up|slowed|8d|piano|lullaby|demo|edit|mix)\b/

function score(candName: string, candArtist: string, want: TopTrack): number {
  const n = norm(candName)
  const a = norm(candArtist)
  const wn = norm(want.name)
  const wa = norm(want.artist)
  let s = 0
  if (n === wn) s += 3
  else if (n && wn && (n.includes(wn) || wn.includes(n))) s += 2
  if (a === wa) s += 2
  else if (a && wa && (a.includes(wa) || wa.includes(a))) s += 1
  if (VARIANT.test(candName.toLowerCase()) && !VARIANT.test(want.name.toLowerCase())) s -= 2
  return s
}

interface ItunesResult {
  trackName: string
  artistName: string
  previewUrl?: string
}

// iTunes rate-limits per IP; after a 403 skip it for a while (Deezer carries on).
let itunesCooldownUntil = 0

async function itunesSearch(term: string, country: string): Promise<ItunesResult[]> {
  if (Date.now() < itunesCooldownUntil) throw new Error('itunes cooling down')
  const params = new URLSearchParams({ term, media: 'music', entity: 'song', limit: '10', country })
  const res = await fetch(`https://itunes.apple.com/search?${params}`)
  if (res.status === 403 || res.status === 429) itunesCooldownUntil = Date.now() + 60_000
  if (!res.ok) throw new Error(`itunes ${res.status}`)
  const json = (await res.json()) as { results: ItunesResult[] }
  return json.results.filter((r) => r.previewUrl)
}

interface Candidate {
  info: PreviewInfo
  s: number
}

async function fromItunes(t: TopTrack, loose: boolean, country: string): Promise<Candidate[]> {
  const results = await itunesSearch(loose ? t.name : `${t.artist} ${t.name}`, country)
  return results.map((r) => ({
    info: { url: r.previewUrl!, track: r.trackName, artist: r.artistName, source: 'itunes', popularity: t.popularity, loose },
    s: loose ? 3 : score(r.trackName, r.artistName, t),
  }))
}

let jsonpCounter = 0
function jsonp<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const cb = `__soundwall_jsonp_${++jsonpCounter}`
    const script = document.createElement('script')
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('jsonp timeout'))
    }, 8000)
    const cleanup = () => {
      clearTimeout(timer)
      delete (window as unknown as Record<string, unknown>)[cb]
      script.remove()
    }
    ;(window as unknown as Record<string, unknown>)[cb] = (data: T) => {
      cleanup()
      resolve(data)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('jsonp failed'))
    }
    script.src = `${url}&output=jsonp&callback=${cb}`
    document.head.appendChild(script)
  })
}

interface DeezerTrack {
  title: string
  preview: string
  artist: { name: string }
}

async function fromDeezer(t: TopTrack, loose: boolean): Promise<Candidate[]> {
  const q = loose ? t.name : `${t.artist} ${t.name}`
  const json = await jsonp<{ data?: DeezerTrack[] }>(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10`)
  return (json.data ?? [])
    .filter((d) => d.preview)
    .map((r) => ({
      info: { url: r.preview, track: r.title, artist: r.artist.name, source: 'deezer' as const, popularity: t.popularity, loose },
      // tiny bonus: MP3 decodes everywhere and Deezer's exact matches are cleaner
      s: (loose ? 3 : score(r.title, r.artist.name, t)) + 0.1,
    }))
}

/** Resolves a playable clip for the album's top track, or throws NoPreview. */
export function resolvePreview(album: Album): Promise<PreviewInfo> {
  let p = memo.get(album.id)
  if (p) return p
  if (album.previewUrl && album.topTrack) {
    p = Promise.resolve({ url: album.previewUrl, track: album.topTrack.name, artist: album.topTrack.artist, source: 'itunes', popularity: null })
    memo.set(album.id, p)
    return p
  }
  if (persisted[album.id]) {
    p = Promise.resolve(persisted[album.id])
    memo.set(album.id, p)
    return p
  }
  p = (async () => {
    const t = await topTrack(album)
    if (!t) throw new NoPreview(`No songs found for ${album.name}`)
    const loose = false
    const errors: string[] = []
    const settled = await Promise.allSettled([fromItunes(t, loose, market), fromDeezer(t, loose)])
    const candidates: Candidate[] = []
    for (const r of settled) {
      if (r.status === 'fulfilled') candidates.push(...r.value)
      else errors.push(String(r.reason?.message ?? r.reason))
    }
    let best = candidates.sort((a, b) => b.s - a.s)[0]
    if ((!best || best.s < 3) && market !== 'US') {
      // Not in the local store — try the (much larger) US catalogue.
      try {
        candidates.push(...(await fromItunes(t, loose, 'US')))
        best = candidates.sort((a, b) => b.s - a.s)[0]
      } catch (e) {
        errors.push(String((e as Error).message))
      }
    }
    const info = best && best.s >= 3 ? best.info : null
    if (!info) {
      if (errors.length) console.warn('[preview] lookups failed', errors)
      throw new NoPreview(errors.length === 2 ? `Couldn't reach the preview services` : `No preview found for “${t.name}”`)
    }
    persist(album.id, info)
    return info
  })()
  memo.set(album.id, p)
  p.catch(() => memo.delete(album.id))
  return p
}
