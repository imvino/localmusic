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
let lowFilter = null
let midFilter = null
let highFilter = null
// element -> { source, normGain, analyser, rmsBuf }
const registry = new Map()

export const EQ_PRESETS = {
  flat: { low: 0, mid: 0, high: 0 },
  bass: { low: 9, mid: 0, high: -2 },
  vocal: { low: -3, mid: 7, high: 4 },
  treble: { low: -4, mid: 2, high: 8 }
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
    // Filter chain is built once and shared across elements.
    if (!lowFilter) {
      lowFilter = ctx.createBiquadFilter()
      lowFilter.type = 'lowshelf'
      lowFilter.frequency.value = 200
      midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking'
      midFilter.frequency.value = 1000
      midFilter.Q.value = 1
      highFilter = ctx.createBiquadFilter()
      highFilter.type = 'highshelf'
      highFilter.frequency.value = 3000
      lowFilter.connect(midFilter)
      midFilter.connect(highFilter)
      highFilter.connect(ctx.destination)
    }
    const source = ctx.createMediaElementSource(audioEl)
    const normGain = ctx.createGain()
    normGain.gain.value = 1
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(normGain)
    normGain.connect(lowFilter)
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
export function setEqGains({ low = 0, mid = 0, high = 0 }) {
  if (!ctx || !lowFilter) return
  lowFilter.gain.value = low
  midFilter.gain.value = mid
  highFilter.gain.value = high
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
