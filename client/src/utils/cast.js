// Chromecast sender — CAF default media receiver. Lazy-loads the Cast
// framework script (kept out of the critical path), resolves a LAN-reachable
// stream URL the receiver can fetch itself, and drives a queue via a light
// media-status poll (the app is the cast session's controller while open).

const API_BASE = import.meta.env.VITE_API_URL

let scriptPromise = null
let castCtx = null
let session = null
let poller = null
const stateListeners = new Set()
let casting = false

function emit() {
  for (const cb of stateListeners) cb(casting)
}

export function onCastState(cb) {
  stateListeners.add(cb)
  return () => stateListeners.delete(cb)
}

export function isCasting() { return casting }

function loadFramework() {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve) => {
    if (!window.chrome) return resolve(false)
    window.__onGCastApiAvailable = (isAvailable) => {
      if (!isAvailable || !window.cast?.framework) return resolve(false)
      try {
        castCtx = window.cast.framework.CastContext.getInstance()
        castCtx.setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        })
        resolve(true)
      } catch { resolve(false) }
    }
    const s = document.createElement('script')
    s.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
    s.onerror = () => resolve(false)
    document.head.appendChild(s)
    setTimeout(() => resolve(!!castCtx), 15000) // safety valve
  })
  return scriptPromise
}

// Cast URL resolution (design D3):
//   base = API_BASE || page origin (VITE_API_URL unset = relative/proxied dev)
//   public host or private-LAN IP → use as-is
//   localhost → /api/lan for the server's real LAN IPv4
//   unresolvable → null (button hidden)
export async function resolveCastBase(getToken) {
  const base = API_BASE || window.location.origin
  let host
  try { host = new URL(base).hostname } catch { return null }
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  if (!isLocalhost) return base // public host or LAN IP — receiver can reach it
  const token = await getToken?.().catch(() => null)
  if (!token) return null // /api/lan is authed; guests on localhost can't resolve
  try {
    const res = await fetch(`${base}/api/lan`, { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json()
    return json?.origin || null
  } catch { return null }
}

// Can the cast button render at all? Needs chrome.cast availability (the
// framework probe below covers device discovery UX) + a resolvable base.
export async function canCast(getToken) {
  const ok = await loadFramework()
  if (!ok) return false
  return !!(await resolveCastBase(getToken))
}

export async function startCast({ url, title, artist, image, positionSec = 0, getToken }) {
  const ready = await loadFramework()
  if (!ready || !castCtx) throw new Error('Cast framework unavailable')
  await castCtx.requestSession()
  session = castCtx.getCurrentSession()
  if (!session) throw new Error('No cast session')
  return loadSong({ url, title, artist, image, positionSec })
}

export async function loadSong({ url, title, artist, image, positionSec = 0 }) {
  if (!session) throw new Error('No cast session')
  const c = window.chrome.cast
  const info = new c.media.MediaInfo(url, 'audio/mpeg')
  info.metadata = new c.media.MusicTrackMediaMetadata()
  info.metadata.title = title || ''
  info.metadata.artist = artist || ''
  if (image) info.metadata.images = [{ url: image }]
  const req = new c.media.LoadRequest(info)
  req.currentTime = Math.max(0, positionSec | 0)
  await session.loadMedia(req)
  casting = true
  emit()
}

// Watch the receiver; onFinished fires exactly once per media item when the
// receiver reports it finished — the app advances the queue + counts the play.
export function watchCastPlayback(onFinished, onEnded) {
  clearInterval(poller)
  let finishedForUrl = null
  poller = setInterval(() => {
    const media = session?.getMediaSession?.()
    if (!media) return
    if (media.playerState === 'IDLE' && media.idleReason === 'FINISHED') {
      const key = media.media?.contentId
      if (finishedForUrl === key) return
      finishedForUrl = key
      onFinished?.()
    } else if (media.playerState === 'IDLE' && media.idleReason === 'CANCELLED') {
      stopCast()
      onEnded?.()
    }
  }, 4000)
}

export function stopCast() {
  clearInterval(poller)
  poller = null
  try { session?.endSession?.(true) } catch {}
  session = null
  casting = false
  emit()
}
