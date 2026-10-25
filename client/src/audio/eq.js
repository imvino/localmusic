// Web Audio graph for playback <audio> elements — EQ + loudness normalization.
// MediaElementSources are created once per element and NEVER detached —
// "off" is flat gains, because an element's output is permanently rerouted
// once captured (detaching a captured source = silence).
//
// Per-element registry: each element gets its own source → normGain →
// shared filter chain, plus an analyser tap for loudness measurement.
// Per-element normGain keeps crossfade independent (the outgoing element's
// boost doesn't leak into the incoming).
//
// NOTE: requires the stream URL to send CORS headers (element already runs
// crossOrigin="anonymous"). If the response lacks ACAO the graph outputs
// silence — the /api/stream local + proxied branches both send it.

let ctx = null
let preampNode = null
const bandFilters = [] // 6-band graphic EQ — Spotify's band layout
// element -> { source, normGain, analyser, rmsBuf }
const registry = new Map()

// Band center freqs: shelf / 4× peaking / shelf. Bands[i] pairs with EQ_BANDS[i].
export const EQ_BANDS = [60, 150, 400, 1000, 2400, 15000]

// Presets: bands = [60, 150, 400, 1k, 2.4k, 15k] dB; heavy boosts carry a
// negative preamp so they don't clip hot masters (Boost without headroom
// distorts — most web EQs get this wrong).
export const EQ_PRESETS = {
  flat:       { bands: [0, 0, 0, 0, 0, 0], preamp: 0 },
  bass:       { bands: [9, 6, 1, 0, -1, -2], preamp: -3 },
  melody:     { bands: [-3, -1, 3, 5, 3, 1], preamp: -2 },
  kuthu:      { bands: [7, 4, -2, 0, 3, 6], preamp: -3 },
  acoustic:   { bands: [3, 2, 0, 2, 3, 4], preamp: -1 },
  devotional: { bands: [-2, 0, 2, 4, 3, 1], preamp: -1 },
  treble:     { bands: [-4, -2, 0, 2, 5, 8], preamp: -3 },
  rock:       { bands: [5, 2, -1, 2, 4, 5], preamp: -2 },
  electronic: { bands: [6, 4, -2, 0, 2, 5], preamp: -2 },
  spoken:     { bands: [-4, 0, 3, 4, 2, 0], preamp: 0 }
}

export function getAudioContext() { return ctx }

// The ONLY way an element enters the graph. Call at a play gesture —
// AudioContext starts suspended under autoplay policy; callers resume.
export function ensureGraph(audioEl) {
  if (!audioEl) return false
  if (registry.has(audioEl)) return true
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return false
    if (!ctx) ctx = new Ctor()
    // Filter chain is built once and shared across elements:
    // source → normGain → preamp → 60 → 150 → 400 → 1k → 2.4k → 15k → out
    if (!preampNode) {
      preampNode = ctx.createGain()
      preampNode.gain.value = 1
      let prev = preampNode
      EQ_BANDS.forEach((freq, i) => {
        const f = ctx.createBiquadFilter()
        f.type = i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking'
        f.frequency.value = freq
        if (f.type === 'peaking') f.Q.value = 1
        prev.connect(f)
        prev = f
        bandFilters.push(f)
      })
      prev.connect(ctx.destination)
    }
    const source = ctx.createMediaElementSource(audioEl)
    const normGain = ctx.createGain()
    normGain.gain.value = 1
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(normGain)
    normGain.connect(preampNode)
    source.connect(analyser) // measurement tap — pre-norm, pre-filters
    registry.set(audioEl, {
      source, normGain, analyser,
      rmsBuf: new Float32Array(analyser.fftSize)
    })
    return true
  } catch {
    return false
  }
}

// Call from a user gesture — AudioContext starts suspended under autoplay policy
export function enableEq(audioEl) {
  if (!ensureGraph(audioEl)) return false
  resumeGraph()
  return true
}

// Resume the shared context — safe to call from every play path while
// EQ or normalization is on (a suspended ctx means silence, not bypass).
export function resumeGraph() {
  ctx?.resume?.().catch(() => {})
}

export function isAttached(audioEl) {
  return registry.has(audioEl)
}

// gains in dB; safe to call when the graph exists. "off" = flat.
// bands: [60, 150, 400, 1k, 2.4k, 15k]; preamp runs ahead of all filters.
export function setEqGains({ bands = [0, 0, 0, 0, 0, 0], preamp = 0 }) {
  if (!ctx || !preampNode) return
  preampNode.gain.value = Math.pow(10, preamp / 20)
  bandFilters.forEach((f, i) => { f.gain.value = bands[i] ?? 0 })
}

// Loudness normalization — per-element compensating gain, ramped so drift
// is inaudible (setTargetAtTime ≈ exponential approach, 300ms time const).
// Disabled = flattened to unity gain, never a disconnect.
export function setNormGainDb(audioEl, db) {
  const entry = registry.get(audioEl)
  if (!entry || !ctx) return
  const lin = Math.pow(10, db / 20)
  entry.normGain.gain.setTargetAtTime(lin, ctx.currentTime, 0.3)
}

// Instantaneous RMS of the element's decoded signal in dBFS — feeds the
// ~15s rolling-window measurement in the App loop. Returns null when the
// element isn't in the graph.
export function measureRmsDb(audioEl) {
  const entry = registry.get(audioEl)
  if (!entry || !ctx) return null
  entry.analyser.getFloatTimeDomainData(entry.rmsBuf)
  let sum = 0
  const buf = entry.rmsBuf
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  const rms = Math.sqrt(sum / buf.length)
  return rms > 0 ? 20 * Math.log10(rms) : -100
}

// Build the graph eagerly on mount when EQ was persisted-on, so a reload
// applies gains to the element before the next play. Autoplay policy keeps
// ctx suspended until a gesture — resume() fires on the next real click via
// enableEq, which all play paths should call when EQ is enabled.
// NEVER call this for the normalize-only case: a pre-gesture build leaves a
// suspended context, and media-session/lock-screen resume is not a gesture.
export function warmEq(audioEl) {
  return ensureGraph(audioEl)
}

export function isEqAvailable() {
  return !!(window.AudioContext || window.webkitAudioContext)
}
