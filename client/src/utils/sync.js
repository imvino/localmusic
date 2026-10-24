import { getImageSrc } from '../utils'

// Pure sync helpers — kept side-effect free so vitest can exercise the merge
// semantics without Clerk or fetch.

// Songs are heavy (image arrays, artist lists, server paths). Shrink to the
// fields the player + UI actually need so sync payloads stay tiny.
export function slimSong(s) {
  if (!s?.id) return null
  return {
    id: s.id,
    name: s.name || s.title || '',
    artist: s.artist || s.artists?.primary?.[0]?.name || s.primaryArtists || '',
    album: typeof s.album === 'object' ? s.album?.name : s.album || '',
    albumId: s.album?.id || s.albumId || '',
    duration: Number(s.duration) || 0,
    image: getImageSrc(s.image) || s.imageUrl || '',
    isLocal: !!s.isLocal
  }
}

export function slimPlaylists(playlists) {
  const out = {}
  for (const [id, p] of Object.entries(playlists || {})) {
    out[id] = {
      id: p.id || id,
      name: p.name || 'Untitled Playlist',
      createdAt: p.createdAt || Date.now(),
      songs: (p.songs || []).map(slimSong).filter(Boolean)
    }
  }
  return out
}

// Union playlists by id — used ONLY for the first-ever merge (importing a
// pre-account local library into a brand-new account).
export function mergePlaylists(local, server) {
  const merged = {}
  const ids = new Set([...Object.keys(local || {}), ...Object.keys(server || {})])
  for (const id of ids) {
    const l = local[id]
    const s = server[id]
    if (!l) { merged[id] = s; continue }
    if (!s) { merged[id] = l; continue }
    const seen = new Set(l.songs.map(x => x.id))
    const songs = [
      ...l.songs,
      ...(s.songs || []).filter(x => !seen.has(x.id))
    ]
    merged[id] = { ...s, ...l, songs }
  }
  return merged
}

// History is append data — union by id+ts so EVERY play survives (repeat
// plays are what power Stats counts and the "On Repeat" rail — collapsing
// them by id alone silently destroys personalization). Cap 200.
export function mergeHistory(local, server) {
  const byKey = new Map()
  for (const s of [...(server || []), ...(local || [])]) {
    if (!s?.id) continue
    byKey.set(`${s.id}:${s.ts || 0}`, s)
  }
  return [...byKey.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200)
}

// Collection merge (saved albums / followed artists) — union by id for the
// first-login import; newer per-item timestamp wins.
export function mergeCollections(local, server) {
  const byId = new Map()
  for (const item of [...(server || []), ...(local || [])]) {
    if (!item?.id) continue
    const prev = byId.get(item.id)
    const ts = item.savedAt || item.followedAt || 0
    const pts = prev?.savedAt || prev?.followedAt || 0
    if (!prev || ts > pts) byId.set(item.id, item)
  }
  return [...byId.values()]
}

// Shared pull-done signal: AuthGate holds a pending member action (e.g. a
// like tapped as guest) that must run AFTER the sync pull applies server
// state — otherwise the pull's replace would silently drop it.
const listeners = new Set()
let pullDone = false
export const markPullDone = () => { pullDone = true; listeners.forEach(fn => fn()) }
export const resetPullDone = () => { pullDone = false }
export const isPullDone = () => pullDone
export const onPullDone = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
