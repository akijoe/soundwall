import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { Album } from '../types'
import { player } from './player'
import { NoPreview, resolvePreview } from './resolve'

export function usePlayerState() {
  return useSyncExternalStore(player.subscribe, player.getSnapshot)
}

const HOVER_DELAY = 260

let hoverId: string | null = null

function isCurrent(albumId: string) {
  const s = player.getSnapshot()
  return s.albumId === albumId && (s.status === 'playing' || s.status === 'loading' || s.status === 'lookup')
}

export async function startPreview(album: Album) {
  hoverId = album.id
  if (isCurrent(album.id)) return
  player.lookup(album.id, album.name)
  try {
    const info = await resolvePreview(album)
    if (hoverId !== album.id) return
    await player.play(album.id, info)
  } catch (e) {
    if (hoverId !== album.id) return
    const msg =
      e instanceof NoPreview
        ? e.message
        : /403|404/.test(String((e as Error)?.message))
          ? `Spotify wouldn't list the songs on ${album.name}`
          : `Couldn't load a preview for ${album.name}`
    player.fail(album.id, msg)
  }
}

/** Hover ended: the song keeps playing — only hovering another cover changes it. */
export function endPreview(album: Album) {
  if (hoverId === album.id) hoverId = null
}

export function stopPreview() {
  hoverId = null
  player.stop()
}

/**
 * Pointer handlers that start the album's preview after a short hover. The
 * song keeps playing after the pointer leaves until another cover is hovered.
 */
export function useHoverPreview(album: Album | null) {
  const timer = useRef<number | null>(null)
  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  useEffect(() => clear, [])

  const onPointerEnter = useCallback(
    (e: React.PointerEvent) => {
      if (!album || e.pointerType === 'touch') return
      clear()
      timer.current = window.setTimeout(() => startPreview(album), HOVER_DELAY)
    },
    [album],
  )
  const onPointerLeave = useCallback(
    (e: React.PointerEvent) => {
      if (!album || e.pointerType === 'touch') return
      clear()
      endPreview(album)
    },
    [album],
  )
  return { onPointerEnter, onPointerLeave }
}
