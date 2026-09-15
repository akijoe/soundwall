import { expireToken, getAccessToken, logout } from './auth'

export interface SpotifyImage {
  url: string
  width: number | null
  height: number | null
}
export interface SpotifyArtist {
  id: string
  name: string
}
export interface SpotifyAlbum {
  id: string
  name: string
  album_type: string
  images: SpotifyImage[]
  artists: SpotifyArtist[]
  release_date?: string
  external_urls?: { spotify?: string }
}
export interface SpotifyTrack {
  id: string
  name: string
  artists: SpotifyArtist[]
  album: SpotifyAlbum
}
export interface Paging<T> {
  items: T[]
  next: string | null
  total: number
}
export interface SpotifyUser {
  id: string
  display_name: string | null
  country?: string
  images?: SpotifyImage[]
  external_urls?: { spotify?: string }
}

const API = 'https://api.spotify.com/v1'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class SpotifyError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

export async function spotifyGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))

  for (let attempt = 0; attempt < 4; attempt++) {
    const token = await getAccessToken()
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) return (await res.json()) as T

    if (res.status === 429) {
      const wait = Number(res.headers.get('Retry-After') ?? 2)
      await sleep(Math.min(wait, 30) * 1000)
      continue
    }
    if (res.status === 401 && attempt === 0) {
      // Token was revoked or expired mid-flight; force a refresh once.
      expireToken()
      continue
    }
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message || res.statusText || 'Spotify request failed'
    if (res.status === 401) logout()
    throw new SpotifyError(`${msg} (${res.status})`, res.status)
  }
  throw new SpotifyError('Spotify kept rate-limiting us — try again in a minute.', 429)
}

export const getMe = () => spotifyGet<SpotifyUser>('/me')

export type TimeRange = 'short_term' | 'medium_term' | 'long_term'

export const getTopTracks = (time_range: TimeRange, offset = 0) =>
  spotifyGet<Paging<SpotifyTrack>>('/me/top/tracks', { time_range, limit: 50, offset })

export const getSavedAlbums = (offset = 0) =>
  spotifyGet<Paging<{ added_at: string; album: SpotifyAlbum }>>('/me/albums', { limit: 50, offset })

export interface SpotifyTrackFull {
  id: string
  name: string
  popularity: number
  preview_url: string | null
  duration_ms: number
  artists: SpotifyArtist[]
}

// NB: the batch endpoints (GET /albums?ids, GET /tracks?ids) return 403 for
// Development Mode apps since March 2026 — only single-resource lookups and
// search (limit ≤ 10) remain.

export interface SpotifyTrackFull {
  id: string
  name: string
  popularity: number
  duration_ms: number
  artists: SpotifyArtist[]
  album: { id: string; name: string }
}

export const getAlbumTracks = (albumId: string) =>
  spotifyGet<Paging<{ id: string; name: string; artists: SpotifyArtist[] }>>(`/albums/${albumId}/tracks`, { limit: 50 })

/** Track search — full track objects (with popularity), max 10 per call. */
export const searchTracks = (q: string) => spotifyGet<{ tracks: Paging<SpotifyTrackFull> }>('/search', { q, type: 'track', limit: 10 })

export const getRecentlyPlayed = () =>
  spotifyGet<{ items: { track: SpotifyTrack; played_at: string }[] }>('/me/player/recently-played', { limit: 50 })
