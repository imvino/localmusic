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
    isLocal: !!s.isLocal,
    ...(s.addedAt ? { addedAt: Number(s.addedAt) } : {})
  }
}

export function slimPlaylists(playlists) {
  const out = {}
  for (const [id, p] of Object.entries(playlists || {})) {
    out[id] = {
      id: p.id || id,
      name: p.name || 'Untitled Playlist',
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || p.createdAt || Date.now(),
      pinned: !!p.pinned,
      // folderId rides along — dropping it here would wipe folder
      // assignments on every push (the server's stored copy wins ties).
      ...(p.folderId ? { folderId: String(p.folderId) } : {}),
      // Weekly-mix markers MUST round-trip or a fresh device regenerates
      // a duplicate mix instead of refilling the synced one.
      ...(p.weeklyMix ? { weeklyMix: true } : {}),
      ...(p.weeklyMixWeek ? { weeklyMixWeek: String(p.weeklyMixWeek) } : {}),
      removed: p.removed && typeof p.removed === 'object' ? p.removed : {},
      songs: (p.songs || []).map(slimSong).filter(Boolean)
    }
  }
  return out
}

export function slimFolders(folders) {
  const out = {}
  for (const [id, f] of Object.entries(folders || {})) {
    if (!f) continue
    out[id] = {
      id: f.id || id,
      name: String(f.name || 'Folder').slice(0, 200),
      createdAt: f.createdAt || Date.now(),
      updatedAt: f.updatedAt || f.createdAt || Date.now()
    }
  }
  return out
}

// Folder merge — newest updatedAt wins scalars; tomb filter happens at the
// call site (same shape as playlist merging, minus the song lists).
export function mergeFolders(local, server) {
  const merged = {}
  const ids = new Set([...Object.keys(local || {}), ...Object.keys(server || {})])
  for (const id of ids) {
    const l = local[id]
    const s = server[id]
    if (!l) { merged[id] = s; continue }
    if (!s) { merged[id] = l; continue }
    merged[id] = (s.updatedAt || s.createdAt || 0) >= (l.updatedAt || l.createdAt || 0) ? s : l
  }
  return merged
}

// Artist-name normalizer — shared by the "New from artists you follow" rail
// and daily-mix clustering. "A. R. Rahman" must match "AR Rahman".
export function normalizeArtistName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
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
    // Weekly-mix playlists REPLACE their song list by week, not union —
    // the newer weeklyMixWeek wins wholesale (tie → updatedAt winner) or
    // week-2 refills grow the mix unboundedly past its 30-track cap.
    if (l.weeklyMix || s.weeklyMix) {
      const lw = l.weeklyMixWeek || '', sw = s.weeklyMixWeek || ''
      const mixWinner = sw > lw ? s : lw > sw ? l
        : ((s.updatedAt || 0) >= (l.updatedAt || 0) ? s : l)
      merged[id] = { ...(mixWinner === s ? l : s), ...mixWinner, songs: mixWinner.songs || [] }
      continue
    }
    // Scalars (name, pinned) go to the most recently edited copy; song
    // lists union so adds from either device survive — BUT per-song removal
    // tombstones (removed[songId] > song.addedAt) propagate deletes.
    const winner = (s.updatedAt || s.createdAt || 0) >= (l.updatedAt || l.createdAt || 0) ? s : l
    const loser = winner === s ? l : s
    const removed = {}
    for (const src of [loser.removed, winner.removed]) {
      for (const [sid, ts] of Object.entries(src || {})) {
        removed[sid] = Math.max(removed[sid] || 0, Number(ts) || 0)
      }
    }
    const seen = new Map()
    const songs = []
    for (const song of [...(winner.songs || []), ...(loser.songs || [])]) {
      if (!song?.id) continue
      const prev = seen.get(song.id)
      if (prev) { // keep the copy with the newer addedAt
        if ((song.addedAt || 0) > (prev.addedAt || 0)) {
          songs[songs.indexOf(prev)] = song
          seen.set(song.id, song)
        }
        continue
      }
      seen.set(song.id, song)
      songs.push(song)
    }
    merged[id] = {
      ...loser, ...winner,
      // folderId defensive guard: a server copy that lacks the field
      // entirely (un-migrated/rolled-back server) must NOT strip a local
      // assignment — local wins when the winner never carried the field.
      ...(winner.folderId === undefined && loser.folderId ? { folderId: loser.folderId } : {}),
      songs: songs.filter(x => (removed[x.id] || 0) <= (x.addedAt || 0)),
      removed
    }
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

// Tombstones — deletes must propagate through union merges, or an un-save /
// un-follow / clear-history silently resurrects on the next pull. A tombstone
// only kills items saved BEFORE it, so re-saving later still works.
export const TOMB_KEYS = { albums: 'removedAlbums', artists: 'removedArtists', songs: 'removedSongs', playlists: 'removedPlaylists', folders: 'removedFolders', hiddenSongs: 'removedHiddenSongs', hiddenArtists: 'removedHiddenArtists' }
export const HISTORY_CLEARED_KEY = 'historyClearedAt'

export function getTombstones(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
export function addTombstone(kind, id) {
  const list = getTombstones(TOMB_KEYS[kind]).filter(t => t.id !== id)
  list.push({ id, ts: Date.now() })
  try { localStorage.setItem(TOMB_KEYS[kind], JSON.stringify(list.slice(-500))) } catch { /* quota */ }
}
export function clearTombstone(kind, id) {
  try {
    localStorage.setItem(TOMB_KEYS[kind], JSON.stringify(getTombstones(TOMB_KEYS[kind]).filter(t => t.id !== id)))
  } catch { /* quota */ }
}
// For id-keyed collections (likes): any tombstone kills the id — the
// re-add path clears the tombstone first, so a live tombstone = deleted.
export function isTombstoned(kind, id) {
  return getTombstones(TOMB_KEYS[kind]).some(t => t.id === id)
}
// Keep items whose save-ts is at/after any tombstone for their id
export function applyTombstones(items, kind, tsKey) {
  const m = new Map(getTombstones(TOMB_KEYS[kind]).map(t => [t.id, t.ts]))
  if (!m.size) return items
  return items.filter(i => (m.get(i.id) || 0) <= (i[tsKey] || 0))
}

// Hidden-list merge — per-entry hiddenAt LWW + dedicated tombstone filter.
// Used by BOTH the client pull and (mirrored in) the server PUT so an
// un-hide propagates and a re-hide (fresh hiddenAt > tomb ts) survives.
export function mergeHiddenMap(local, server, kind) {
  const merged = { ...(local || {}) }
  for (const [id, e] of Object.entries(server || {})) {
    const prev = merged[id]
    if (!prev || (e?.hiddenAt || 0) > (prev?.hiddenAt || 0)) merged[id] = e
  }
  const m = new Map(getTombstones(TOMB_KEYS[kind]).map(t => [t.id, t.ts]))
  return Object.fromEntries(
    Object.entries(merged).filter(([id, e]) => (m.get(id) || 0) <= (e?.hiddenAt || 0))
  )
}

// Member vs guest key selection — guests hide on the device only (their
// keys are deliberately absent from PERSONAL_KEYS so a member sign-in/out
// on a shared device never nukes them).
export const blocklistKeys = (signedIn) => signedIn
  ? { hiddenSongs: 'hiddenSongs', hiddenArtists: 'hiddenArtists', explicitFilter: 'explicitFilter', dataSaver: 'dataSaver' }
  : { hiddenSongs: 'guestHiddenSongs', hiddenArtists: 'guestHiddenArtists', explicitFilter: 'guestExplicitFilter', dataSaver: 'guestDataSaver' }

// The single block check — consumed by every passive surface: suggestion
// injection (autoplay + both radios), play-all/shuffle queue builds,
// discovery rails, search results, typeahead. Explicit flag is checked in
// BOTH payload shapes since raw-fetch paths bypass boundary normalization.
export function isContentBlocked(song, { hiddenSongs = {}, hiddenArtists = {}, explicitFilter = false } = {}) {
  if (!song?.id) return false
  if (hiddenSongs[song.id]) return true
  const artist = normalizeArtistName(song.artist || song.artists?.primary?.[0]?.name || song.primaryArtists || '')
  if (artist && hiddenArtists[artist]) return true
  if (explicitFilter) {
    const ec = song.explicitContent ?? song.more_info?.explicit_content
    if (ec === true || ec === 'true' || ec === 1 || ec === '1') return true
  }
  return false
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
