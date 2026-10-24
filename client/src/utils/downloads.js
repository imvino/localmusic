// Explicit downloads: fetch the full stream through the SW's audio-cache so
// downloaded songs also play offline, and remember them in a local registry.
const API_BASE = import.meta.env.VITE_API_URL
const KEY = 'downloads'
const CACHE = 'audio-cache'
const DL_BITRATE = 96 // smallest stream; offline quality trade-off, ~1MB/min

const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)) } catch { /* quota */ } }

export const getDownloads = () => read()
export const isDownloaded = (id) => read().some(d => d.id === id)
export const downloadUrlFor = (id) => `${API_BASE}/api/stream/${id}?bitrate=${DL_BITRATE}`

// URL the player should use: downloaded songs always play their cached copy,
// which is also what makes them work fully offline.
export const streamUrlForSong = (song, fallbackUrl) =>
  isDownloaded(song.id) ? downloadUrlFor(song.id) : fallbackUrl

export async function downloadSong(song) {
  const url = downloadUrlFor(song.id)
  const res = await fetch(url) // no Range → full 200 → cacheable
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  const cache = await caches.open(CACHE)
  await cache.put(url, res)
  const img = Array.isArray(song.image)
    ? (song.image.find(i => i.quality === '150x150')?.url || song.image[0]?.url)
    : (typeof song.image === 'string' ? song.image : null)
  const entry = {
    id: song.id, name: song.name, artist: song.artist, album: song.album,
    imageUrl: song.imageUrl || img,
    duration: song.duration, downloadedAt: Date.now()
  }
  write([entry, ...read().filter(d => d.id !== song.id)])
  return entry
}

export async function removeDownload(id) {
  // If this exact URL is what's playing right now, deleting it mid-play breaks
  // any seek past the buffered region — leave it for the LRU to evict instead.
  const url = downloadUrlFor(id)
  const liveSrc = document.querySelector('audio')?.src
  try {
    if (liveSrc !== url) await (await caches.open(CACHE)).delete(url)
  } catch { /* no-op */ }
  write(read().filter(d => d.id !== id))
}

// Sequential batch download — powers the "Download" buttons on album,
// playlist, and liked-songs headers. One at a time (keeps the audio-cache LRU
// sane, doesn't hammer the stream proxy). Skips already-downloaded songs.
export async function downloadSongs(songs, { onProgress } = {}) {
  const list = Array.isArray(songs) ? songs.filter(s => s?.id) : []
  const results = { done: 0, failed: 0, total: list.length }
  for (let i = 0; i < list.length; i++) {
    const song = list[i]
    if (isDownloaded(song.id)) {
      results.done++
      onProgress?.(i + 1, list.length)
      continue
    }
    try {
      await downloadSong(song)
      results.done++
    } catch {
      results.failed++
    }
    onProgress?.(i + 1, list.length)
    // Space requests so the proxy + cache aren't slammed
    await new Promise(r => setTimeout(r, 150))
  }
  return results
}

// Drop registry entries whose audio was evicted from the shared cache.
export async function reconcileDownloads() {
  const list = read()
  if (!list.length) return []
  const cache = await caches.open(CACHE)
  const kept = []
  for (const d of list) {
    if (await cache.match(downloadUrlFor(d.id))) kept.push(d)
  }
  if (kept.length !== list.length) write(kept)
  return kept
}
