// Authorization Code + PKCE, fully client-side (no client secret needed).
// https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

const CLIENT_ID_KEY = 'soundwall.clientId'
const TOKEN_KEY = 'soundwall.token'
const VERIFIER_KEY = 'soundwall.pkce.verifier'
const STATE_KEY = 'soundwall.pkce.state'

// Keep sessions from the site's previous name.
for (const [from, to] of [
  ['flagship.token', TOKEN_KEY],
  ['flagship.clientId', CLIENT_ID_KEY],
]) {
  const v = localStorage.getItem(from)
  if (v && !localStorage.getItem(to)) localStorage.setItem(to, v)
  if (v) localStorage.removeItem(from)
}

/**
 * Spotify's Development Mode caps hobby apps at five allow-listed users, so
 * the login button is disabled for visitors; the app owner (and friends on
 * the allow-list) can still open the site with `?login` to sign in.
 */
export const LOGIN_ENABLED = new URLSearchParams(window.location.search).has('login') || sessionStorage.getItem('soundwall.login') === '1'
if (LOGIN_ENABLED) sessionStorage.setItem('soundwall.login', '1')

export const LOGIN_DISABLED_NOTE = "Logging in is switched off: Spotify's API rules only allow five users for apps like this one. The demo works without an account."

export const SCOPES = ['user-top-read', 'user-library-read', 'user-read-recently-played', 'user-read-private']

interface StoredToken {
  access_token: string
  refresh_token: string
  expires_at: number
  /** Space-separated scopes the token was granted with. */
  scope?: string
}

export function getClientId(): string {
  const env = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined)?.trim()
  return env || localStorage.getItem(CLIENT_ID_KEY) || ''
}

export function setClientId(id: string) {
  localStorage.setItem(CLIENT_ID_KEY, id.trim())
}

/** Exactly what must be registered in the Spotify dashboard. */
export function redirectUri(): string {
  const path = window.location.pathname.replace(/index\.html$/, '')
  return `${window.location.origin}${path}`
}

function randomString(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function beginLogin(): Promise<void> {
  const clientId = getClientId()
  if (!clientId) throw new Error('No Spotify Client ID configured')
  const verifier = randomString(96)
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = randomString(16)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })
  window.location.assign(`https://accounts.spotify.com/authorize?${params}`)
}

function saveToken(json: { access_token: string; refresh_token?: string; expires_in: number; scope?: string }, prev?: StoredToken) {
  const token: StoredToken = {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? prev?.refresh_token ?? '',
    expires_at: Date.now() + json.expires_in * 1000,
    scope: json.scope ?? prev?.scope,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  return token
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? (JSON.parse(raw) as StoredToken) : null
  } catch {
    return null
  }
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `Token request failed (${res.status})`)
  }
  return json as { access_token: string; refresh_token?: string; expires_in: number; scope?: string }
}

/**
 * Call once on page load. If we're returning from Spotify with ?code=...,
 * exchanges it for tokens and cleans the URL. Returns an error message if the
 * redirect carried one.
 */
export async function handleRedirect(): Promise<string | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state')
  if (!code && !error) return null

  url.searchParams.delete('code')
  url.searchParams.delete('error')
  url.searchParams.delete('state')
  window.history.replaceState({}, '', url.pathname + (url.search || '') + url.hash)

  if (error) return `Spotify said: ${error}`
  if (state !== sessionStorage.getItem(STATE_KEY)) return 'Login state mismatch — please try again.'
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) return 'Missing PKCE verifier — please try logging in again.'
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)

  try {
    const json = await tokenRequest({
      client_id: getClientId(),
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    })
    // The user just consented to exactly what we asked for; if Spotify omits
    // the scope field, assume the requested set rather than forcing a re-login.
    saveToken({ ...json, scope: json.scope || SCOPES.join(' ') })
    return null
  } catch (e) {
    return (e as Error).message
  }
}

/** True when a token exists and was granted every scope we currently ask for. */
export function isLoggedIn(): boolean {
  const t = readToken()
  if (!t || !t.refresh_token) return false
  const granted = new Set((t.scope ?? '').split(' '))
  if (!SCOPES.every((s) => granted.has(s))) {
    logout() // older login without the newer scopes — ask again
    return false
  }
  return true
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY)
}

/** Marks the access token stale so the next call refreshes it. */
export function expireToken() {
  const t = readToken()
  if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify({ ...t, expires_at: 0 }))
}

let refreshing: Promise<string> | null = null

/** Returns a valid access token, refreshing if it expires within a minute. */
export async function getAccessToken(): Promise<string> {
  const t = readToken()
  if (!t) throw new Error('Not logged in')
  if (Date.now() < t.expires_at - 60_000) return t.access_token
  if (!refreshing) {
    refreshing = tokenRequest({
      client_id: getClientId(),
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
    })
      .then((json) => saveToken(json, t).access_token)
      .catch((e) => {
        logout()
        throw e
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}
