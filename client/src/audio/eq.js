// Web Audio EQ for the playback <audio> element.
// The MediaElementSource is created once and NEVER detached — "off" is flat
// gains, because an element's output is permanently rerouted once captured.
//
// NOTE: requires the stream URL to send CORS headers (element already runs
// crossOrigin="anonymous"). If the response lacks ACAO the graph outputs
// silence — guard call sites accordingly if a prod API drops the header.

let ctx = null
let source = null
let lowFilter = null
let midFilter = null
let highFilter = null
let attachedElement = null

export const EQ_PRESETS = {
  flat: { low: 0, mid: 0, high: 0 },
  bass: { low: 9, mid: 0, high: -2 },
  vocal: { low: -3, mid: 7, high: 4 },
  treble: { low: -4, mid: 2, high: 8 }
}

function ensureGraph(audioEl) {
  if (attachedElement === audioEl && ctx) return true
  if (!audioEl) return false
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return false
    if (!ctx) ctx = new Ctor()
    // Filter chain is built once; each playback ELEMENT gets its own
    // MediaElementSource feeding it — required for the dual-element
    // crossfade (the old source stays connected; its element is paused).
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
    source = ctx.createMediaElementSource(audioEl)
    source.connect(lowFilter)
    attachedElement = audioEl
    return true
  } catch {
    return false
  }
}

// Call from a user gesture — AudioContext starts suspended under autoplay policy
export function enableEq(audioEl) {
  if (!ensureGraph(audioEl)) return false
  ctx.resume?.().catch(() => {})
  return true
}

// gains in dB; safe to call when the graph exists. "off" = flat.
export function setEqGains({ low = 0, mid = 0, high = 0 }) {
  if (!ctx) return
  lowFilter.gain.value = low
  midFilter.gain.value = mid
  highFilter.gain.value = high
}

// Build the graph eagerly on mount when EQ was persisted-on, so a reload
// applies gains to the element before the next play. Autoplay policy keeps
// ctx suspended until a gesture — resume() fires on the next real click via
// enableEq, which all play paths should call when EQ is enabled.
export function warmEq(audioEl) {
  return ensureGraph(audioEl)
}

export function isEqAvailable() {
  return !!(window.AudioContext || window.webkitAudioContext)
}
