import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@clerk/clerk-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { clearPersonalData, getLastUserId, setLastUserId } from '../utils/personalData'
import { slimSong, slimPlaylists, slimFolders, mergePlaylists, mergeFolders, mergeHistory, mergeCollections, markPullDone, resetPullDone, isPullDone, onPullDone, getTombstones, isTombstoned, applyTombstones, TOMB_KEYS, HISTORY_CLEARED_KEY, mergeHiddenMap } from '../utils/sync'

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
        folders: slimFolders(usePlaylistStore.getState().folders),
        history,
        savedAlbums: collections?.savedAlbums?.slice(0, 2000) || [],
        followedArtists: collections?.followedArtists?.slice(0, 2000) || [],
        likedMeta: readLS('likedMeta', {}), // metadata so local/delisted songs still render
        // Content controls + sharing prefs — member-scoped, merged on pull
        hiddenSongs: readLS('hiddenSongs', {}),
        hiddenArtists: readLS('hiddenArtists', {}),
        explicitFilter: !!readLS('explicitFilter', false),
        dataSaver: !!readLS('dataSaver', false),
        shareActivity: !!readLS('shareActivity', false),
        shareActivityAt: Number(readLS('shareActivityAt', 0)) || 0,
        displayName: readLS('displayName', '') || '',
        // Tombstones let deletes propagate through the union merges
        removedAlbums: getTombstones(TOMB_KEYS.albums),
        removedArtists: getTombstones(TOMB_KEYS.artists),
        removedSongs: getTombstones(TOMB_KEYS.songs),
        removedPlaylists: getTombstones(TOMB_KEYS.playlists),
        removedFolders: getTombstones(TOMB_KEYS.folders),
        removedHiddenSongs: getTombstones(TOMB_KEYS.hiddenSongs),
        removedHiddenArtists: getTombstones(TOMB_KEYS.hiddenArtists),
        historyClearedAt: Number(localStorage.getItem(HISTORY_CLEARED_KEY)) || 0,
        // Cap the payload — keep the 3000 most recently played ids
        playCounts: Object.fromEntries(
          Object.entries(readLS('playCounts', {}))
            .sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0)).slice(0, 3000)
        )
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
  const folders = usePlaylistStore(s => s.folders)
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
        setLastUserId(userId) // claim the device NOW — if the pull fails and the
        // app restarts, getLastUserId must already say "this user" so their
        // own offline work isn't wiped as a phantom user-switch.
        if (!live) return
        setLikedSongs(new Set())
        setSavedAlbums?.(new Set())
        setFollowedArtists?.(new Set())
        usePlaylistStore.setState({ playlists: {}, folders: {} })
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

        // ALWAYS merge — never blind-replace. Unpushed local adds (offline
        // edits, inside-debounce changes) must survive a pull; deletes travel
        // exclusively through tombstones, which are merged from BOTH sides.

        // 1. Fold server tombstones into local storage so every filter below
        // (and future pushes) honors deletes from either device.
        for (const kind of Object.keys(TOMB_KEYS)) {
          const incoming = server.tombstones?.[kind] || []
          if (!incoming.length) continue
          const m = new Map(getTombstones(TOMB_KEYS[kind]).map(t => [t.id, t.ts]))
          for (const t of incoming) if ((t.ts || 0) > (m.get(t.id) || 0)) m.set(t.id, Number(t.ts))
          writeLS(TOMB_KEYS[kind], [...m.entries()].map(([id, ts]) => ({ id, ts })).slice(-500))
        }

        // 2. likedMeta — union by newest likedAt per id (must precede the
        // like filter, which compares tombstones against likedAt).
        const mergedMeta = { ...(server.likedMeta || {}) }
        for (const [id, m] of Object.entries(readLS('likedMeta', {}))) {
          const s = mergedMeta[id]
          if (!s || (m?.likedAt || 0) > (s?.likedAt || 0)) mergedMeta[id] = m
        }

        // 3. Likes — union; a tombstone kills an id only when it's newer
        // than the newest likedAt seen on either device.
        const songTombMap = new Map(getTombstones(TOMB_KEYS.songs).map(t => [t.id, t.ts]))
        const nextLikes = new Set(
          [...(server.likedSongs || []), ...readLS('likedSongs', [])]
            .filter(id => (songTombMap.get(id) || 0) <= (mergedMeta[id]?.likedAt || 0))
        )
        writeLS('likedSongs', [...nextLikes])
        setLikedSongs(nextLikes)
        for (const id of Object.keys(mergedMeta)) if (!nextLikes.has(id)) delete mergedMeta[id]
        writeLS('likedMeta', mergedMeta)

        // 4. Playlists — per-id winner by updatedAt (song lists unioned);
        // a tombstone newer than createdAt kills the stale copy.
        const plTombMap = new Map(getTombstones(TOMB_KEYS.playlists).map(t => [t.id, t.ts]))
        const mergedPls = Object.fromEntries(Object.entries(
          mergePlaylists(usePlaylistStore.getState().playlists, server.playlists || {})
        ).filter(([id, p]) => (plTombMap.get(id) || 0) <= (p.createdAt || 0)))

        // 4b. Folders — same merge shape as playlists. A folder tombstone
        // kills the folder ONLY when newer than its createdAt (restored
        // folders legitimately outlive their tomb). Member playlists are
        // un-filed ONLY for folders the tomb filter actually killed here —
        // an unconditional un-file would strip membership from restores.
        const flTombMap = new Map(getTombstones(TOMB_KEYS.folders).map(t => [t.id, t.ts]))
        const mergedFolders = Object.fromEntries(Object.entries(
          mergeFolders(usePlaylistStore.getState().folders, server.folders || {})
        ).filter(([id, f]) => (flTombMap.get(id) || 0) <= (f.createdAt || 0)))
        for (const [pid, p] of Object.entries(mergedPls)) {
          if (!p.folderId) continue
          const f = mergedFolders[p.folderId]
          if (!f || (flTombMap.get(p.folderId) || 0) > (f.createdAt || 0)) {
            mergedPls[pid] = { ...p, folderId: undefined }
          }
        }
        usePlaylistStore.setState({ playlists: mergedPls, folders: mergedFolders })

        // 5. Collections — union + tombstone filter (server tombs are local now)
        const applyCollection = (serverArr, localKey, setState, kind, tsKey) => {
          const next = applyTombstones(
            mergeCollections(readLS(localKey, []), serverArr || []),
            kind, tsKey
          )
          writeLS(localKey, next)
          setState?.(new Set(next.map(x => x.id)))
          return next
        }
        const nextAlbums = applyCollection(server.savedAlbums, 'savedAlbums', setSavedAlbums, 'albums', 'savedAt')
        const nextArtists = applyCollection(server.followedArtists, 'followedArtists', setFollowedArtists, 'artists', 'followedAt')

        // 6. playCounts — { ...slimSong, count, ts } per id; max-merge, never regresses
        if (server.playCounts && typeof server.playCounts === 'object') {
          const merged = { ...readLS('playCounts', {}) }
          for (const [id, c] of Object.entries(server.playCounts)) {
            const cnt = Number(c?.count ?? c) || 0
            const prev = merged[id]
            if (cnt > (Number(prev?.count ?? prev) || 0)) {
              merged[id] = c && typeof c === 'object' ? c : { id, count: cnt, ts: 0 }
            }
          }
          // Cap local bloat — keep the 3000 most recently played ids
          const capped = Object.fromEntries(
            Object.entries(merged).sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0)).slice(0, 3000)
          )
          writeLS('playCounts', capped)
        }

        // Cleared-at wins on BOTH sides — entries older than the latest
        // clear (local or server) stay gone after the union merge
        // 7. Hidden lists — per-entry hiddenAt LWW + dedicated tomb filter
        // (server tombs are already folded into local storage by step 1).
        writeLS('hiddenSongs', mergeHiddenMap(readLS('hiddenSongs', {}), server.hiddenSongs, 'hiddenSongs'))
        writeLS('hiddenArtists', mergeHiddenMap(readLS('hiddenArtists', {}), server.hiddenArtists, 'hiddenArtists'))

        // 8. Scalars — shareActivity resolves by shareActivityAt (newest
        // wins: a stale device can't re-enable after an opt-out). The other
        // toggles take the server value when the doc is newer — this merge
        // only runs when serverTs > lastSync (or first login), so the
        // server's copy is definitionally the newer write.
        if (Number(server.shareActivityAt || 0) !== Number(readLS('shareActivityAt', 0))) {
          const newer = Number(server.shareActivityAt || 0) > Number(readLS('shareActivityAt', 0)) ? server : { shareActivity: readLS('shareActivity', false), shareActivityAt: readLS('shareActivityAt', 0) }
          writeLS('shareActivity', !!newer.shareActivity)
          writeLS('shareActivityAt', Number(newer.shareActivityAt) || 0)
        }
        if (server.explicitFilter !== undefined) writeLS('explicitFilter', !!server.explicitFilter)
        if (server.dataSaver !== undefined) writeLS('dataSaver', !!server.dataSaver)
        if (server.displayName && !readLS('displayName', '')) {
          writeLS('displayName', String(server.displayName).slice(0, 100))
        }

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
    let off = null
    const t = setTimeout(() => {
      const push = () => pushSnapshot(getToken, likedSongs, usePlaylistStore.getState().playlists,
        { savedAlbums: readLS('savedAlbums', []), followedArtists: readLS('followedArtists', []) })
      if (isPullDone()) { push(); return }
      // Deferred — MUST unsubscribe in cleanup or a stale-closure push can
      // fire after a user switch and merge the PREVIOUS account's data.
      off = onPullDone(() => { off(); off = null; push() })
    }, 2500)
    return () => { clearTimeout(t); off?.() }
  }, [likedSongs, playlists, folders, savedAlbums, followedArtists, historyVersion, changedBump, isSignedIn, userId]) // eslint-disable-line react-hooks/exhaustive-deps
}
