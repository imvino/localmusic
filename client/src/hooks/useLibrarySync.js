import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { getImageSrc } from '../utils'

const API_BASE = import.meta.env.VITE_API_URL
const LAST_SYNC_KEY = 'libraryLastSync'

// Songs are heavy (image arrays, artist lists, server paths). Shrink to the
// fields the player + UI actually need so sync payloads stay tiny.
function slimSong(s) {
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

function slimPlaylists(playlists) {
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

// Union playlists by id — local order first, server-only songs appended, and
// the fuller song object wins (local keeps rich artist/image fields).
function mergePlaylists(local, server) {
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

async function pushSnapshot(getToken, likedSongs, playlists) {
  try {
    const token = await getToken()
    if (!token) return false
    const ts = Date.now()
    const res = await fetch(`${API_BASE}/api/me/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        v: 1,
        ts,
        likedSongs: [...likedSongs],
        playlists: slimPlaylists(playlists)
      })
    })
    if (res.ok) {
      localStorage.setItem(LAST_SYNC_KEY, String(ts))
      return true
    }
  } catch { /* offline — local wins, retried on next change */ }
  return false
}

// Keeps likes + playlists in sync with the signed-in user's server copy.
// - On sign-in: pull; if the server is newer, merge (union — nothing is lost)
//   and push the merged union back.
// - On every local change: debounced push.
export function useLibrarySync({ likedSongs, setLikedSongs }) {
  const { isSignedIn, getToken } = useAuth()
  const playlists = usePlaylistStore(s => s.playlists)
  const lastSyncRef = useRef(() => {
    try { return parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10) || 0 } catch { return 0 }
  })

  // Pull + merge on sign-in
  useEffect(() => {
    if (!isSignedIn) return
    let live = true
    ;(async () => {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`${API_BASE}/api/me/library`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok || res.status === 404) {
          // First login on the server — seed it with the local snapshot
          pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists)
          return
        }
        const json = await res.json()
        if (!live || !json?.success || !json.data) return
        const server = json.data
        if (server.ts && server.ts <= lastSyncRef.current()) return // nothing newer

        setLikedSongs(prev => {
          const merged = new Set(prev)
          ;(server.likedSongs || []).forEach(id => merged.add(id))
          return merged
        })
        const merged = mergePlaylists(usePlaylistStore.getState().playlists, server.playlists || {})
        usePlaylistStore.setState({ playlists: merged })
        localStorage.setItem(LAST_SYNC_KEY, String(server.ts || Date.now()))
        // Teach the server the union so other devices converge too
        pushSnapshot(getToken, new Set([...(server.likedSongs || []), ...likedSongs]), merged)
      } catch { /* offline — local wins */ }
    })()
    return () => { live = false }
  }, [isSignedIn]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced push on any local change
  useEffect(() => {
    if (!isSignedIn) return
    const t = setTimeout(() => {
      pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists)
    }, 2500)
    return () => clearTimeout(t)
  }, [likedSongs, playlists, isSignedIn]) // eslint-disable-line react-hooks/exhaustive-deps
}