import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { getImageSrc } from '../utils'
import { clearPersonalData, getLastUserId, setLastUserId } from '../utils/personalData'

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

// Union playlists by id — used ONLY for the first-ever merge (importing a
// pre-account local library into a brand-new account).
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

// History is append data — union by song id, newest entry wins, cap 200.
function mergeHistory(local, server) {
  const byId = new Map()
  for (const s of [...(server || []), ...(local || [])]) {
    if (!s?.id) continue
    const prev = byId.get(s.id)
    if (!prev || (s.ts || 0) > (prev.ts || 0)) byId.set(s.id, s)
  }
  return [...byId.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 200)
}

const readLS = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || '') ?? fb } catch { return fb } }
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* quota */ } }

async function pushSnapshot(getToken, likedSongs, playlists, collections) {
  try {
    const token = await getToken()
    if (!token) return false
    const ts = Date.now()
    const history = readLS('playHistory', []).slice(0, 200).map(s => ({ ...slimSong(s), ts: s.ts || 0 })).filter(s => s?.id)
    const res = await fetch(`${API_BASE}/api/me/library`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        v: 2,
        ts,
        likedSongs: [...likedSongs],
        playlists: slimPlaylists(playlists),
        history,
        savedAlbums: collections?.savedAlbums?.slice(0, 2000) || [],
        followedArtists: collections?.followedArtists?.slice(0, 2000) || []
      })
    })
    if (res.ok) {
      localStorage.setItem(LAST_SYNC_KEY, String(ts))
      return true
    }
  } catch { /* offline — local wins, retried on next change */ }
  return false
}

// Keeps the member library in sync with the signed-in user's server copy.
// Sign-in pull, three cases:
//  A) Different userId than last session → wipe personal data FIRST (shared
//     family devices must never inherit the previous user's library), then
//     replace local with the server snapshot.
//  B) Same user, server newer → REPLACE (last-writer-wins: unlikes/deletes
//     made on another device must propagate, not resurrect).
//  C) First-ever sign-in on this device → UNION local into the account
//     (imports the pre-account library).
// After every pull the merged result is written back to localStorage (#12).
export function useLibrarySync({ likedSongs, setLikedSongs, savedAlbums, setSavedAlbums, followedArtists, setFollowedArtists }) {
  const { isSignedIn, userId, getToken } = useAuth()
  const playlists = usePlaylistStore(s => s.playlists)
  const lastSyncRef = useRef(() => {
    try { return parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10) || 0 } catch { return 0 }
  })

  useEffect(() => {
    if (!isSignedIn || !userId) return
    let live = true
    ;(async () => {
      const lastUser = getLastUserId()
      const firstLogin = !lastUser
      const differentUser = lastUser && lastUser !== userId

      if (differentUser) {
        clearPersonalData()
        if (!live) return
        setLikedSongs(new Set())
        setSavedAlbums?.(new Set())
        setFollowedArtists?.(new Set())
        usePlaylistStore.setState({ playlists: {} })
      }

      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`${API_BASE}/api/me/library`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!live) return

        if (res.status === 404 || !res.ok) {
          // No server doc — seed the account with the local snapshot
          if (!differentUser) {
            pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists,
              { savedAlbums: readLS('savedAlbums', []), followedArtists: readLS('followedArtists', []) })
          }
          setLastUserId(userId)
          return
        }
        const json = await res.json()
        if (!live || !json?.success || !json.data) return
        const server = json.data
        const serverTs = server.ts || 0

        if (!firstLogin && !differentUser && serverTs <= lastSyncRef.current()) {
          setLastUserId(userId)
          return // nothing newer
        }

        const union = firstLogin // only the first merge imports local data

        const serverLikes = new Set(server.likedSongs || [])
        setLikedSongs(prev => {
          const next = union ? new Set([...serverLikes, ...prev]) : serverLikes
          writeLS('likedSongs', [...next])
          return next
        })

        const mergedPls = union
          ? mergePlaylists(usePlaylistStore.getState().playlists, server.playlists || {})
          : (server.playlists || {})
        usePlaylistStore.setState({ playlists: mergedPls })

        const applyCollection = (serverArr, localKey, setState) => {
          const next = union ? [...(serverArr || []), ...readLS(localKey, []).filter(l => !(serverArr || []).some(s => s.id === l.id))] : (serverArr || [])
          writeLS(localKey, next)
          setState?.(new Set(next.map(x => x.id)))
          return next
        }
        const nextAlbums = applyCollection(server.savedAlbums, 'savedAlbums', setSavedAlbums)
        const nextArtists = applyCollection(server.followedArtists, 'followedArtists', setFollowedArtists)

        const mergedHist = mergeHistory(readLS('playHistory', []), server.history || [])
        writeLS('playHistory', mergedHist)

        localStorage.setItem(LAST_SYNC_KEY, String(serverTs))
        setLastUserId(userId)
        // Push the merged snapshot back so the server converges
        pushSnapshot(getToken,
          new Set(readLS('likedSongs', [])),
          mergedPls,
          { savedAlbums: nextAlbums, followedArtists: nextArtists })
      } catch { /* offline — local wins */ }
    })()
    return () => { live = false }
  }, [isSignedIn, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced push on any local change
  useEffect(() => {
    if (!isSignedIn) return
    const t = setTimeout(() => {
      pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists,
        { savedAlbums: readLS('savedAlbums', []), followedArtists: readLS('followedArtists', []) })
    }, 2500)
    return () => clearTimeout(t)
  }, [likedSongs, playlists, savedAlbums, followedArtists, isSignedIn]) // eslint-disable-line react-hooks/exhaustive-deps
}
