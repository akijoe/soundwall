export type RankMode = 'mix' | 'short' | 'medium' | 'long'

export interface AlbumScores {
  short: number
  medium: number
  long: number
  saved: number
  recent: number
}

export interface Album {
  id: string
  name: string
  artist: string
  artists: string[]
  albumType: 'album' | 'single' | 'compilation'
  year: string
  spotifyUrl: string
  /** Largest image the Web API hands out (640px for real albums). */
  cover: string
  /** Small thumbnail (~300px) for pool tiles. */
  thumb: string
  scores: AlbumScores
  /** The song from this album the listener plays most (from top tracks / recent plays). */
  topTrack?: { name: string; artist: string }
  /** Known 30-second clip for the top track (demo data); skips the lookup. */
  previewUrl?: string
}

export interface Layout {
  cols: number
  rows: number
}

export interface CollageStyle {
  gap: number
  radius: number
  bg: string
}

export type ProductId = 'flag' | 'poster' | 'tee' | 'mug' | 'pillow' | 'tote' | 'case' | 'keychain' | 'mousepad' | 'puzzle'
