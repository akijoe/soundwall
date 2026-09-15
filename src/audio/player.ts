import type { PreviewInfo } from './resolve'

// One AudioContext for previews, UI blips and the visualizer. Previews are
// fetched (CORS) and decoded so we can (a) analyse the clip for its loudest
// stretch — a decent stand-in for the chorus — and (b) start exactly there.
// If a browser can't decode the clip, a plain <audio> element takes over.

export interface PlayerState {
  status: 'idle' | 'lookup' | 'loading' | 'playing' | 'error'
  albumId: string | null
  /** Album/track label to show while looking up or on error. */
  label: string
  info: PreviewInfo | null
  hookAt: number
  enabled: boolean
  volume: number
  blocked: boolean
  message: string
}

const SOUND_KEY = 'soundwall.sound'
const VOLUME_KEY = 'soundwall.volume'
const DEFAULT_VOLUME = 0.3
const FADE_IN = 0.45
const FADE_OUT = 0.3
const END_FADE = 1.6
const MAX_BUFFERS = 8
const ERROR_TTL = 2200

type Listener = () => void

function readVolume(): number {
  const v = Number(localStorage.getItem(VOLUME_KEY))
  return Number.isFinite(v) && localStorage.getItem(VOLUME_KEY) !== null ? Math.min(1, Math.max(0, v)) : DEFAULT_VOLUME
}

/** Slider position → gain, slightly curved so low settings stay audible. */
const curve = (v: number) => Math.pow(v, 1.5)

class PreviewPlayer {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private node: AudioBufferSourceNode | null = null
  private nodeGain: GainNode | null = null
  private el: HTMLAudioElement | null = null
  private elSource: MediaElementAudioSourceNode | null = null
  private elGain: GainNode | null = null
  private freq = new Uint8Array(64)
  private buffers = new Map<string, Promise<AudioBuffer>>()
  private undecodable = new Set<string>()
  private hooks = new Map<string, number>()
  private token = 0
  private errorTimer: number | null = null
  private listeners = new Set<Listener>()
  private state: PlayerState = {
    status: 'idle',
    albumId: null,
    label: '',
    info: null,
    hookAt: 0,
    enabled: localStorage.getItem(SOUND_KEY) !== 'off',
    volume: readVolume(),
    blocked: false,
    message: '',
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.state
  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  private gainTarget() {
    return this.state.enabled ? curve(this.state.volume) : 0
  }

  /** Creates the graph lazily; safe to call from any user gesture. */
  ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.gainTarget()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 128
      this.analyser.smoothingTimeConstant = 0.82
      this.analyser.connect(this.master)
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => this.set({ blocked: this.ctx!.state !== 'running' })).catch(() => {})
    }
    return this.ctx
  }

  /** Called from a click/keydown anywhere so browsers let us make sound. */
  unlock() {
    const ctx = this.ensure()
    if (ctx.state === 'running' && this.state.blocked) this.set({ blocked: false, status: this.state.status === 'error' ? 'idle' : this.state.status })
  }

  private applyGain(ramp = 0.15) {
    if (!this.master || !this.ctx) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(this.gainTarget(), now + ramp)
  }

  setEnabled(v: boolean) {
    localStorage.setItem(SOUND_KEY, v ? 'on' : 'off')
    this.set({ enabled: v })
    this.applyGain()
    if (!v) this.stop()
  }

  setVolume(v: number) {
    const vol = Math.min(1, Math.max(0, v))
    localStorage.setItem(VOLUME_KEY, String(vol))
    this.set({ volume: vol, enabled: vol > 0 ? true : this.state.enabled })
    if (vol > 0) localStorage.setItem(SOUND_KEY, 'on')
    this.applyGain(0.05)
  }

  /** UI blip synthesized on the fly (no assets). */
  blip(kind: 'pick' | 'drop' | 'shuffle' | 'tab' | 'error' | 'hover') {
    if (!this.state.enabled || !this.ctx || this.ctx.state !== 'running' || !this.master) return
    const ctx = this.ctx
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.connect(g)
    g.connect(this.master)
    const env = (peak: number, dur: number) => {
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    }
    switch (kind) {
      case 'pick':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(740, t)
        osc.frequency.exponentialRampToValueAtTime(1180, t + 0.09)
        env(0.35, 0.12)
        break
      case 'drop':
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(1046, t)
        osc.frequency.setValueAtTime(1568, t + 0.07)
        env(0.4, 0.16)
        break
      case 'shuffle':
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(220, t)
        osc.frequency.exponentialRampToValueAtTime(1760, t + 0.28)
        env(0.18, 0.3)
        break
      case 'tab':
        osc.type = 'square'
        osc.frequency.setValueAtTime(1600, t)
        env(0.1, 0.05)
        break
      case 'hover':
        osc.type = 'sine'
        osc.frequency.setValueAtTime(2200, t)
        env(0.06, 0.03)
        break
      case 'error':
        osc.type = 'square'
        osc.frequency.setValueAtTime(180, t)
        env(0.22, 0.22)
        break
    }
  }

  /** Show "looking up…" immediately so hovering always gives feedback. */
  lookup(albumId: string, label: string) {
    if (!this.state.enabled) return
    this.token++
    this.clearError()
    // Whatever was playing gives way to the new one.
    this.fadeOutCurrent()
    this.set({ status: 'lookup', albumId, label, info: null, message: '' })
  }

  /**
   * Warm a clip: fetch (fills the HTTP cache), decode, and work out its hook
   * so the first hover on it starts instantly.
   */
  async preload(url: string) {
    if (this.undecodable.has(url) || this.hooks.has(url)) return
    try {
      const buffer = await this.load(url)
      if (!this.hooks.has(url)) this.hooks.set(url, findHook(buffer))
    } catch {
      this.undecodable.add(url)
      // still worth warming the HTTP cache for the <audio> fallback
      fetch(url).catch(() => {})
    }
  }

  fail(albumId: string, message: string) {
    if (this.state.albumId !== albumId && this.state.status !== 'idle') return
    this.clearError()
    this.set({ status: 'error', albumId, message })
    this.blip('error')
    this.errorTimer = window.setTimeout(() => {
      if (this.state.status === 'error') this.set({ status: 'idle', albumId: null, info: null, message: '' })
    }, ERROR_TTL)
  }

  private clearError() {
    if (this.errorTimer) {
      clearTimeout(this.errorTimer)
      this.errorTimer = null
    }
  }

  private load(url: string): Promise<AudioBuffer> {
    let p = this.buffers.get(url)
    if (!p) {
      p = fetch(url)
        .then((r) => {
          if (!r.ok) throw new Error(`preview ${r.status}`)
          return r.arrayBuffer()
        })
        .then((ab) => this.ensure().decodeAudioData(ab))
      this.buffers.set(url, p)
      p.catch(() => this.buffers.delete(url))
      if (this.buffers.size > MAX_BUFFERS) this.buffers.delete(this.buffers.keys().next().value!)
    }
    return p
  }

  async play(albumId: string, info: PreviewInfo) {
    const my = ++this.token
    if (!this.state.enabled) return
    this.clearError()
    this.set({ status: 'loading', albumId, info, label: info.track, message: '' })
    const ctx = this.ensure()

    let buffer: AudioBuffer | null = null
    if (!this.undecodable.has(info.url)) {
      try {
        buffer = await this.load(info.url)
      } catch {
        this.undecodable.add(info.url)
      }
    }
    if (my !== this.token) return
    if (ctx.state !== 'running') {
      this.set({ status: 'error', message: 'Click anywhere to turn on sound', blocked: true })
      return
    }

    this.fadeOutCurrent()
    const now = ctx.currentTime

    if (buffer) {
      let hookAt = this.hooks.get(info.url)
      if (hookAt === undefined) {
        hookAt = findHook(buffer)
        this.hooks.set(info.url, hookAt)
      }
      const g = ctx.createGain()
      g.connect(this.analyser!)
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(1, now + FADE_IN)
      // ease out before the clip runs dry
      const endAt = now + (buffer.duration - hookAt)
      const fadeStart = Math.max(now + FADE_IN, endAt - END_FADE)
      g.gain.setValueAtTime(1, fadeStart)
      g.gain.exponentialRampToValueAtTime(0.0001, endAt)

      const node = ctx.createBufferSource()
      node.buffer = buffer
      node.connect(g)
      node.start(now, hookAt)
      node.onended = () => {
        if (this.node === node) {
          this.node = null
          this.nodeGain = null
          g.disconnect()
          if (my === this.token) this.set({ status: 'idle', albumId: null, info: null})
        }
      }
      this.node = node
      this.nodeGain = g
      this.set({ status: 'playing', hookAt, blocked: false })
      return
    }

    // Fallback: let the browser's media stack decode it (no hook seeking).
    try {
      const el = this.element()
      const g = this.elGain!
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(0.0001, now)
      g.gain.exponentialRampToValueAtTime(1, now + FADE_IN)
      el.src = info.url
      await el.play()
      if (my !== this.token) {
        el.pause()
        return
      }
      el.onended = () => {
        if (my === this.token) this.set({ status: 'idle', albumId: null, info: null})
      }
      el.ontimeupdate = () => {
        const left = el.duration - el.currentTime
        if (Number.isFinite(left) && left < END_FADE && this.ctx) {
          const t = this.ctx.currentTime
          g.gain.cancelScheduledValues(t)
          g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t)
          g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.05, left))
          el.ontimeupdate = null
        }
      }
      this.set({ status: 'playing', hookAt: 0, blocked: false })
    } catch (e) {
      if (my !== this.token) return
      const blocked = (e as Error)?.name === 'NotAllowedError'
      this.set({ status: 'error', message: blocked ? 'Click anywhere to turn on sound' : "This clip won't play in your browser", blocked })
      this.errorTimer = window.setTimeout(() => {
        if (this.state.status === 'error') this.set({ status: 'idle', albumId: null, info: null, message: '' })
      }, ERROR_TTL)
    }
  }

  private element(): HTMLAudioElement {
    if (!this.el) {
      this.el = new Audio()
      this.el.crossOrigin = 'anonymous'
      this.el.preload = 'auto'
      const ctx = this.ensure()
      this.elSource = ctx.createMediaElementSource(this.el)
      this.elGain = ctx.createGain()
      this.elSource.connect(this.elGain)
      this.elGain.connect(this.analyser!)
    }
    return this.el
  }

  /** Fades whatever is sounding right now and releases it; state untouched. */
  private fadeOutCurrent() {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const node = this.node
    const g = this.nodeGain
    if (node && g) {
      g.gain.cancelScheduledValues(now)
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now)
      g.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT)
      node.onended = null
      this.node = null
      this.nodeGain = null
      setTimeout(() => {
        try {
          node.stop()
        } catch {
          /* already stopped */
        }
        g.disconnect()
      }, FADE_OUT * 1000 + 30)
    }
    const el = this.el
    if (el && !el.paused && this.elGain) {
      const eg = this.elGain
      eg.gain.cancelScheduledValues(now)
      eg.gain.setValueAtTime(Math.max(eg.gain.value, 0.0001), now)
      eg.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT)
      el.onended = null
      el.ontimeupdate = null
      const src = el.src
      setTimeout(() => {
        if (el.src === src) el.pause()
      }, FADE_OUT * 1000 + 30)
    }
  }

  stop() {
    this.token++
    this.clearError()
    if (this.state.status === 'idle') return
    this.fadeOutCurrent()
    this.set({ status: 'idle', albumId: null, info: null, message: ''})
  }

  /** Frequency bins (0–255) for the visualizer; empty when silent. */
  levels(): Uint8Array {
    if (this.analyser && this.state.status === 'playing') this.analyser.getByteFrequencyData(this.freq)
    else this.freq.fill(0)
    return this.freq
  }
}

/**
 * Picks a start offset inside a preview clip: the 7-second stretch with the
 * highest average energy, walked back to the quiet moment just before it so
 * playback starts on the phrase (usually the hook/chorus of the clip).
 */
export function findHook(buffer: AudioBuffer): number {
  const sr = buffer.sampleRate
  const win = Math.floor(sr * 0.25)
  const chans = Math.min(2, buffer.numberOfChannels)
  const n = Math.floor(buffer.length / win)
  if (n < 8) return 0
  const rms = new Float32Array(n)
  for (let c = 0; c < chans; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) {
      let s = 0
      const o = i * win
      for (let j = 0; j < win; j++) s += d[o + j] * d[o + j]
      rms[i] += Math.sqrt(s / win) / chans
    }
  }
  const span = 28 // 7 s
  const lastStart = Math.max(0, n - Math.floor(8 / 0.25)) // leave ≥8 s to play
  let best = 0
  let bestE = -1
  for (let i = 0; i <= Math.min(lastStart, n - span); i++) {
    let e = 0
    for (let j = 0; j < span; j++) e += rms[i + j]
    if (e > bestE) {
      bestE = e
      best = i
    }
  }
  // walk back (≤2 s) to the local minimum before the loud stretch
  let start = best
  for (let i = best; i > Math.max(0, best - 8); i--) {
    if (rms[i] < rms[start]) start = i
  }
  return (start * win) / sr
}

export const player = new PreviewPlayer()

// First gesture anywhere unlocks audio for the rest of the session.
for (const ev of ['pointerdown', 'keydown'] as const) {
  window.addEventListener(ev, () => player.unlock(), { capture: true, passive: true })
}
