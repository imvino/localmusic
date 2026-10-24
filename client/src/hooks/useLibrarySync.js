import { useEffect, useRef } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { clearPersonalData, getLastUserId, setLastUserId } from '../utils/personalData'
import { slimSong, slimPlaylists, mergePlaylists, mergeHistory, mergeCollections, markPullDone, resetPullDone, isPullDone } from '../utils/sync'

const API_BASE = import.meta.env.VITE_API_URL
const LAST_SYNC_KEY = 'libraryLastSync'

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
// After every pull the merged result is written back to localStorage.
//
// CRITICAL ordering (F1/F3): the debounced push is gated on pullDone — it
// must never fire before the session's first pull resolves. A push of the
// just-wiped empty state would overwrite the good server doc AND stamp
// libraryLastSync so the pull's apply is skipped: total loss both sides.
export function useLibrarySync({ likedSongs, setLikedSongs, savedAlbums, setSavedAlbums, followedArtists, setFollowedArtists }) {
  const { isSignedIn, userId, getToken } = useAuth()
  const playlists = usePlaylistStore(s => s.playlists)
  const lastSyncRef = useRef(() => {
    try { return parseInt(localStorage.getItem(LAST_SYNC_KEY) || '0', 10) || 0 } catch { return 0 }
  })

  // Sign-in pull — also resets pullDone so pushes hold until it resolves
  useEffect(() => {
    if (!isSignedIn || !userId) { if (!isSignedIn) resetPullDone(); return }
    resetPullDone()
    let live = true
    const done = () => { if (live) markPullDone() }
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
          const next = union ? mergeCollections(readLS(localKey, []), serverArr || []) : (serverArr || [])
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
      finally { done() }
    })()
    return () => { live = false }
  }, [isSignedIn, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced push on any local change — held until the session's first
  // pull resolves so a fresh/empty state can never clobber the server.
  useEffect(() => {
    if (!isSignedIn) return
    const t = setTimeout(() => {
      if (!isPullDone()) return
      pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists,
        { savedAlbums: readLS('savedAlbums', []), followedArtists: readLS('followedArtists', []) })
    }, 2500)
    return () => clearTimeout(t)
  }, [likedSongs, playlists, savedAlbums, followedArtists, isSignedIn]) // eslint-disable-line react-hooks/exhaustive-deps
}
