import { useCallback, useEffect, useRef, useState } from 'react'
import { Background } from './components/Background'
import { Hero } from './components/Hero'
import { LoadingScreen } from './components/LoadingScreen'
import { Studio } from './components/Studio'
import { Footer } from './components/Footer'
import { NowPlaying } from './components/NowPlaying'
import { KofiModal } from './components/Kofi'
import { ToastProvider, useToast } from './components/Toast'
import { setMarket } from './audio/resolve'
import { Logo } from './components/Logo'
import { VolumeControl } from './components/VolumeControl'
import { beginLogin, getClientId, handleRedirect, isLoggedIn, logout, setClientId } from './spotify/auth'
import { getMe, type SpotifyUser } from './spotify/api'
import { buildLibrary } from './spotify/albums'
import { makeDemoLibrary } from './demo/demoAlbums'
import type { Album } from './types'

type Phase = { kind: 'boot' } | { kind: 'hero' } | { kind: 'loading'; msg: string; pct: number } | { kind: 'studio' }

interface Loaded {
  library: Album[]
  demo: boolean
}

function Inner() {
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [user, setUser] = useState<SpotifyUser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(!getClientId())
  const toast = useToast()

  const loadFromSpotify = useCallback(async () => {
    setPhase({ kind: 'loading', msg: 'Connecting…', pct: 0 })
    try {
      getMe()
        .then((u) => {
          setUser(u)
          setMarket(u.country)
        })
        .catch(() => {})
      const library = await buildLibrary((msg, pct) => setPhase({ kind: 'loading', msg, pct }))
      if (library.length === 0) {
        setError('Spotify returned no listening history for this account yet — try the demo, or listen to some music first.')
        setPhase({ kind: 'hero' })
        return
      }
      setLoaded({ library, demo: false })
      setPhase({ kind: 'studio' })
      toast(`Loaded ${library.length} albums from your library ✓`, 'ok')
    } catch (e) {
      setError((e as Error).message)
      setPhase({ kind: 'hero' })
    }
  }, [toast])

  // Handle the OAuth return exactly once (React dev mode runs effects twice).
  const booted = useRef(false)
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    ;(async () => {
      const err = await handleRedirect()
      if (err) setError(err)
      if (isLoggedIn()) await loadFromSpotify()
      else setPhase({ kind: 'hero' })
    })()
  }, [loadFromSpotify])

  const startDemo = () => {
    setPhase({ kind: 'loading', msg: 'Loading this week’s most-played albums…', pct: 30 })
    setTimeout(() => {
      setLoaded({ library: makeDemoLibrary(), demo: true })
      setPhase({ kind: 'studio' })
      setUser({ id: 'demo', display_name: 'demo user' })
    }, 350)
  }

  const login = async () => {
    setError(null)
    try {
      await beginLogin()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const saveClientId = (id: string) => {
    setClientId(id)
    setNeedsSetup(false)
    login()
  }

  const doLogout = () => {
    logout()
    setUser(null)
    setLoaded(null)
    setPhase({ kind: 'hero' })
    toast('Logged out')
  }

  /** Back to the landing page; a loaded collage is kept so it can be reopened instantly. */
  const goHome = () => {
    if (loaded?.demo) {
      setLoaded(null)
      setUser(null)
    }
    setPhase({ kind: 'hero' })
  }

  return (
    <>
      <Background />
      {phase.kind === 'studio' && loaded && (
        <header className="topbar">
          <a
            className="logo"
            href="#"
            title="Back to the start page"
            onClick={(e) => {
              e.preventDefault()
              goHome()
            }}
          >
            <Logo />
          </a>
          <div className="row">
            <VolumeControl />
            <span className="userchip">
              {user?.images?.[0]?.url ? <img src={user.images[0].url} alt="" /> : <span className="avatar">☺</span>}
              {user?.display_name ?? (loaded.demo ? 'demo user' : '…')}
            </span>
            {loaded.demo ? (
              <>
                <button className="btn btn-sm" onClick={goHome}>
                  ← Back
                </button>
                <button className="btn btn-sm btn-green" onClick={() => (needsSetup ? goHome() : login())}>
                  Log in with Spotify
                </button>
              </>
            ) : (
              <button className="btn btn-sm" onClick={doLogout}>
                Log out
              </button>
            )}
          </div>
        </header>
      )}

      {phase.kind === 'hero' && (
        <Hero
          needsSetup={needsSetup}
          error={error}
          onLogin={login}
          onDemo={startDemo}
          onSaveClientId={saveClientId}
          onResume={loaded && !loaded.demo ? () => setPhase({ kind: 'studio' }) : undefined}
        />
      )}
      {phase.kind === 'loading' && <LoadingScreen msg={phase.msg} pct={phase.pct} />}
      {phase.kind === 'boot' && <LoadingScreen msg="Booting…" pct={5} />}
      {phase.kind === 'studio' && loaded && <Studio key={loaded.demo ? 'demo' : 'real'} library={loaded.library} demo={loaded.demo} />}

      <Footer compact={phase.kind !== 'studio'} />
      <NowPlaying />
      <KofiModal />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <Inner />
    </ToastProvider>
  )
}
