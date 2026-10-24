import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { clearPersonalData, getLastUserId, setLastUserId } from '../utils/personalData'
import { slimSong, slimPlaylists, mergePlaylists, mergeHistory, mergeCollections, markPullDone, resetPullDone, isPullDone, onPullDone, getTombstones, isTombstoned, applyTombstones, TOMB_KEYS, HISTORY_CLEARED_KEY } from '../utils/sync'

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
        followedArtists: collections?.followedArtists?.slice(0, 2000) || [],
        likedMeta: readLS('likedMeta', {}), // metadata so local/delisted songs still render
        // Tombstones let deletes propagate through the union merges
        removedAlbums: getTombstones(TOMB_KEYS.albums),
        removedArtists: getTombstones(TOMB_KEYS.artists),
        removedSongs: getTombstones(TOMB_KEYS.songs),
        removedPlaylists: getTombstones(TOMB_KEYS.playlists),
        historyClearedAt: Number(localStorage.getItem(HISTORY_CLEARED_KEY)) || 0,
        playCounts: readLS('playCounts', {})
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
export function useLibrarySync({ likedSongs, setLikedSongs, savedAlbums, setSavedAlbums, followedArtists, setFollowedArtists, historyVersion }) {
  const { isSignedIn, userId, getToken } = useAuth()
  const playlists = usePlaylistStore(s => s.playlists)
  // Re-pull when the network comes back — otherwise a device that was
  // offline while another device changed the library pushes STALE
  // likes/playlists and resurrects deletes (the post-offline race)
  const [syncNonce, setSyncNonce] = useState(0)
  const [changedBump, setChangedBump] = useState(0)
  useEffect(() => {
    const onOnline = () => setSyncNonce(n => n + 1)
    const onChanged = () => setChangedBump(b => b + 1) // tombstone writes etc.
    window.addEventListener('online', onOnline)
    window.addEventListener('library:changed', onChanged)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('library:changed', onChanged)
    }
  }, [])
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

      // A failed pull must NOT release deferred pushes (they'd push stale
      // state over a healthy doc) — retry via syncNonce until it succeeds.
      const retryPull = () => setTimeout(() => { if (live) setSyncNonce(n => n + 1) }, 15000)
      let succeeded = false
      try {
        const token = await getToken()
        if (!token) { retryPull(); return }
        const res = await fetch(`${API_BASE}/api/me/library`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000) // cold-start cap — pullDone MUST resolve
        })
        if (!live) return

        if (!res.ok) { retryPull(); return } // server unhealthy — don't seed over it
        const json = await res.json()
        if (!live || !json?.success || !json.data) { retryPull(); return }
        const server = json.data
        const serverTs = server.ts || 0

        if (serverTs > 0 && !firstLogin && !differentUser && serverTs <= lastSyncRef.current()) {
          succeeded = true
          setLastUserId(userId)
          return // nothing newer
        }

        // Import local data on first login, a user switch, OR a wiped server
        // doc (ts===0 means the default empty doc — re-seed it).
        const union = firstLogin || differentUser || serverTs === 0

        const serverLikes = new Set(server.likedSongs || [])
        setLikedSongs(prev => {
          // Local song tombstones still apply — an unlike pending push must
          // not resurrect just because the pull raced it.
          const merged = union ? new Set([...serverLikes, ...prev]) : serverLikes
          const next = new Set([...merged].filter(id => !isTombstoned('songs', id)))
          writeLS('likedSongs', [...next])
          return next
        })

        const plTombs = new Set(getTombstones(TOMB_KEYS.playlists).map(t => t.id))
        const mergedPls = Object.fromEntries(Object.entries(
          union
            ? mergePlaylists(usePlaylistStore.getState().playlists, server.playlists || {})
            : (server.playlists || {})
        ).filter(([id]) => !plTombs.has(id)))
        usePlaylistStore.setState({ playlists: mergedPls })

        const applyCollection = (serverArr, localKey, setState, kind, tsKey) => {
          const next = applyTombstones(
            union ? mergeCollections(readLS(localKey, []), serverArr || []) : (serverArr || []),
            kind, tsKey
          )
          writeLS(localKey, next)
          setState?.(new Set(next.map(x => x.id)))
          return next
        }
        const nextAlbums = applyCollection(server.savedAlbums, 'savedAlbums', setSavedAlbums, 'albums', 'savedAt')
        const nextArtists = applyCollection(server.followedArtists, 'followedArtists', setFollowedArtists, 'artists', 'followedAt')

        // likedMeta rides alongside — newest likedAt wins per id
        if (server.likedMeta && typeof server.likedMeta === 'object') {
          const local = readLS('likedMeta', {})
          const merged = union ? { ...server.likedMeta, ...local } : server.likedMeta
          writeLS('likedMeta', merged)
        }

        // playCounts — durable totals; max-merge per id, never regresses
        if (server.playCounts && typeof server.playCounts === 'object') {
          const merged = { ...readLS('playCounts', {}) }
          for (const [id, c] of Object.entries(server.playCounts)) {
            merged[id] = Math.max(Number(merged[id]) || 0, Number(c) || 0)
          }
          writeLS('playCounts', merged)
        }

        // Cleared-at wins on BOTH sides — entries older than the latest
        // clear (local or server) stay gone after the union merge
        const clearedAt = Math.max(
          Number(localStorage.getItem(HISTORY_CLEARED_KEY)) || 0,
          Number(server.historyClearedAt) || 0
        )
        if (clearedAt) localStorage.setItem(HISTORY_CLEARED_KEY, String(clearedAt))
        const mergedHist = mergeHistory(readLS('playHistory', []), server.history || [])
          .filter(s => (s.ts || 0) > clearedAt)
        writeLS('playHistory', mergedHist)

        localStorage.setItem(LAST_SYNC_KEY, String(serverTs))
        setLastUserId(userId)
        succeeded = true
        // Push the merged snapshot back so the server converges
        pushSnapshot(getToken,
          new Set(readLS('likedSongs', [])),
          mergedPls,
          { savedAlbums: nextAlbums, followedArtists: nextArtists })
      } catch { retryPull() /* offline — retry rather than pushing stale */ }
      finally { if (succeeded) done() }
    })()
    return () => { live = false }
  }, [isSignedIn, userId, syncNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced push on any local change — held until the session's first
  // pull resolves so a fresh/empty state can never clobber the server.
  // If the pull is still in-flight when the debounce fires, the push is
  // DEFERRED (one-shot onPullDone), not dropped — otherwise changes made
  // during a slow cold-start pull would be silently lost.
  useEffect(() => {
    if (!isSignedIn) return
    const t = setTimeout(() => {
      const push = () => pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists,
        { savedAlbums: readLS('savedAlbums', []), followedArtists: readLS('followedArtists', []) })
      if (isPullDone()) { push(); return }
      const off = onPullDone(() => { off(); push() })
    }, 2500)
    return () => clearTimeout(t)
  }, [likedSongs, playlists, savedAlbums, followedArtists, historyVersion, changedBump, isSignedIn]) // eslint-disable-line react-hooks/exhaustive-deps
}
