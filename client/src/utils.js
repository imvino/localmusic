// Helper to decode HTML entities
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

// Pure-regex entity decoder — DOM-free so it can run on whole API payloads.
// JioSaavn ships HTML-encoded strings ("(From &quot;Ramayana&quot;)") deep in
// nested fields; decode once at the fetch boundary instead of every render.
const NAMED_ENTITIES = { quot: '"', apos: "'", amp: '&', lt: '<', gt: '>', nbsp: ' ', copy: '©', reg: '®' }
export function decodeEntities(str) {
  if (!str || typeof str !== 'string' || str.indexOf('&') === -1) return str
  return str.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : m
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m
  })
}

// Recursively decode every string in an API payload (arrays + objects).
export function deepDecodeEntities(node) {
  if (typeof node === 'string') return decodeEntities(node)
  if (Array.isArray(node)) { for (let i = 0; i < node.length; i++) node[i] = deepDecodeEntities(node[i]); return node }
  if (node && typeof node === 'object') { for (const k of Object.keys(node)) node[k] = deepDecodeEntities(node[k]); return node }
  return node
}

// Playlist share links — compact {v,n,s:[{i,n,a,d,m,l}]} → base64url in the URL
// path, so a whole playlist travels as a link. Import rebuilds minimal song
// objects that the player/store already understand (id + isLocal drive streams).
export function buildPlaylistSharePayload(name, songs) {
  const all = (songs || []).filter(s => s.i || s.id)
  const localCount = all.filter(s => s.isLocal).length
  return {
    v: 1, n: name,
    // local files can't play on anyone else's server — don't ship them
    lc: localCount || undefined,
    s: all.filter(s => !s.isLocal).slice(0, 100).map(s => ({
      i: s.id,
      n: s.name || s.title || '',
      a: s.artist || s.artists?.primary?.[0]?.name || s.primaryArtists || '',
      d: s.duration || 0,
      m: getBestImageUrl(s.image) || s.imageUrl || ''
    })).filter(s => s.i)
  }
}

export function encodePlaylistShare(name, songs) {
  const payload = buildPlaylistSharePayload(name, songs)
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodePlaylistShare(data) {
  try {
    const b64 = (data || '').replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64))))
    if (payload?.v !== 1 || !Array.isArray(payload.s)) return null
    return {
      name: typeof payload.n === 'string' ? payload.n.slice(0, 200) : 'Shared Playlist',
      droppedLocal: payload.lc || 0,
      // Cap + coerce — shared links are user-supplied input, not trusted data
      songs: payload.s.slice(0, 100).map(s => ({
        id: s.i, name: String(s.n || ''), artist: String(s.a || ''),
        duration: Number(s.d) || 0,
        image: typeof s.m === 'string' && s.m ? [{ quality: '500x500', url: s.m }] : []
      })).filter(s => typeof s.id === 'string' && s.id)
    }
  } catch { return null }
}

// Family Blend links — just the creator's top song ids travel in the URL;
// the recipient's client does the overlap math against its own library.
// Local ids are excluded up front (they can't resolve on another device).
export function encodeBlendShare(name, songs) {
  const payload = {
    v: 1, n: String(name || 'Blend').slice(0, 80),
    s: (songs || []).filter(s => (s?.id || s?.i) && !s.isLocal && !s.audioPath).slice(0, 50)
      .map(s => ({ i: s.id || s.i, n: String(s.name || s.title || '').slice(0, 120) }))
      .filter(s => s.i)
  }
  return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeBlendShare(data) {
  try {
    const b64 = (data || '').replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(decodeURIComponent(escape(atob(b64))))
    if (payload?.v !== 1 || !Array.isArray(payload.s)) return null
    return {
      name: typeof payload.n === 'string' ? payload.n.slice(0, 80) : 'Blend',
      songs: payload.s.slice(0, 50)
        .map(s => ({ id: String(s.i || ''), name: String(s.n || '') }))
        .filter(s => s.id)
    }
  } catch { return null }
}

// Content-language preference — Spotify's Settings → "Content languages".
// Device-scoped persisted set; Discover biases rails toward chosen
// languages. Empty array = all languages (no filtering).
export const CONTENT_LANGUAGES = [
  ['tamil', 'Tamil'], ['telugu', 'Telugu'], ['hindi', 'Hindi'],
  ['malayalam', 'Malayalam'], ['kannada', 'Kannada'], ['punjabi', 'Punjabi'],
  ['bengali', 'Bengali'], ['marathi', 'Marathi'], ['gujarati', 'Gujarati'],
  ['english', 'English']
]
export function readContentLanguages() {
  try { return JSON.parse(localStorage.getItem('contentLanguages') || '[]') } catch { return [] }
}

// Compact K/M formatting for follower counts ("1.2M followers")
export function formatCount(n) {
  const num = Number(n) || 0
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return String(num)
}

// Light haptic tick for touch actions (no-op on unsupported devices)
export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms) } catch { /* unsupported */ }
}

// Helper to get best image URL from image array
export function getBestImageUrl(imageArray) {
  if (!imageArray || !Array.isArray(imageArray) || imageArray.length === 0) return null
  const sorted = [...imageArray].sort((a, b) => {
    const qualityMap = { '50x50': 1, '150x150': 2, '500x500': 3 }
    return (qualityMap[b.quality] || 0) - (qualityMap[a.quality] || 0)
  })
  let url = sorted[0]?.url || null
  
  // Replace JioSaavn brand logo with local logo
  if (url && url.includes('share-image-2.png')) {
    return '/logo_512x512.png'
  }
  
  return url
}

// JioSaavn CDN ships -150x150.jpg / -50x50.jpg thumbs; bump to 500x500 when available
export function upgradeImageUrl(url) {
  if (typeof url !== 'string') return url
  if (url.includes('-150x150.')) return url.replace('-150x150.', '-500x500.')
  if (url.includes('-50x50.')) return url.replace('-50x50.', '-500x500.')
  return url
}

// Normalize ANY image shape (string URL | array of {quality,url} | {url}) to a
// URL string, upgrading to 500x500 for crisp Spotify-grade art. Returns '' when
// there's nothing usable — callers fall back to their placeholder.
export function getImageSrc(image) {
  if (!image) return ''
  if (typeof image === 'string') return upgradeImageUrl(image)
  if (Array.isArray(image)) {
    const url = getBestImageUrl(image)
    return url ? upgradeImageUrl(url) : ''
  }
  if (typeof image === 'object' && typeof image.url === 'string') return upgradeImageUrl(image.url)
  return ''
}

// Best artwork for a song/album object across every shape the app uses
export function getSongArtwork(song) {
  return song?.artworkUrl || song?.moviePosterUrl || song?.imageUrl || getImageSrc(song?.image)
}

// Helper to get artist image URL (prefers 150x150 for better resolution in small containers)
export function getArtistImageUrl(imageArray) {
  if (!imageArray || !Array.isArray(imageArray) || imageArray.length === 0) return null
  const sorted = [...imageArray].sort((a, b) => {
    const qualityMap = { '150x150': 3, '500x500': 2, '50x50': 1 }
    return (qualityMap[b.quality] || 0) - (qualityMap[a.quality] || 0)
  })
  let url = sorted[0]?.url || null
  
  // Replace JioSaavn brand logo with local logo
  if (url && url.includes('share-image-2.png')) {
    return '/logo_512x512.png'
  }
  
  return url
}

// Helper to format duration from seconds
export function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Helper to format time from seconds
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Helper to detect connection type (WiFi/cellular) for adaptive bitrate
export function getConnectionType() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!connection) return 'unknown'
  
  // Check effectiveType for cellular networks
  if (connection.effectiveType) {
    const slowTypes = ['slow-2g', '2g', '3g']
    if (slowTypes.includes(connection.effectiveType)) {
      return 'cellular-slow'
    }
  }
  
  // Check if on cellular
  if (connection.type === 'cellular') {
    return 'cellular'
  }
  
  // Default to WiFi if not cellular
  return 'wifi'
}

// Helper to get max bitrate based on connection type and user preference
export function getMaxBitrate(connectionType, userPreference = 'auto') {
  if (userPreference === 'low-data') {
    return 96
  }
  
  if (userPreference === 'high-quality') {
    return 320
  }
  
  // Auto mode - adapt based on connection
  if (connectionType === 'cellular-slow') {
    return 96
  }
  
  if (connectionType === 'cellular') {
    return 160
  }
  
  // WiFi or unknown
  return 320
}
