import { describe, it, expect, beforeEach } from 'vitest'
import { slimSong, slimPlaylists, slimFolders, mergeFolders, normalizeArtistName, mergePlaylists, mergeHistory, mergeCollections, addTombstone, clearTombstone, isTombstoned, applyTombstones, getTombstones, TOMB_KEYS } from './sync'

// Minimal localStorage stub — vitest runs node, not a browser
const __store = new Map()
globalThis.localStorage = {
  getItem: k => (__store.has(k) ? __store.get(k) : null),
  setItem: (k, v) => { __store.set(k, String(v)) },
  removeItem: k => { __store.delete(k) },
  clear: () => __store.clear()
}

const song = (id, extra = {}) => ({ id, name: `S${id}`, artist: 'A', image: `https://img/${id}.jpg`, duration: 100, ...extra })

describe('slimSong', () => {
  it('keeps only the fields sync needs and normalizes image arrays', () => {
    const out = slimSong({
      id: 'x', name: 'N', artist: 'A', duration: 5,
      image: [{ quality: '150x150', url: 'https://c.saavncdn.com/z-150x150.jpg' }],
      extraBlob: { big: true }
    })
    expect(out.id).toBe('x')
    expect(out.image).toContain('500x500')
    expect(out.extraBlob).toBeUndefined()
  })
  it('returns null for songs without an id', () => {
    expect(slimSong({ name: 'no-id' })).toBeNull()
    expect(slimSong(null)).toBeNull()
  })
})

describe('mergePlaylists (first-login union)', () => {
  it('unions playlists by id and dedupes songs within a playlist', () => {
    const local = { p1: { id: 'p1', name: 'Mine', createdAt: 1, songs: [song('a'), song('b')] } }
    const server = { p1: { id: 'p1', name: 'Mine', createdAt: 1, songs: [song('b'), song('c')] }, p2: { id: 'p2', name: 'Remote', createdAt: 2, songs: [song('z')] } }
    const merged = mergePlaylists(local, server)
    expect(merged.p1.songs.map(s => s.id).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.p2.songs.map(s => s.id)).toEqual(['z'])
  })
  it('scalar fields go to the most recently updated copy', () => {
    const local = { p1: { id: 'p1', name: 'Old', createdAt: 1, updatedAt: 5, songs: [] } }
    const server = { p1: { id: 'p1', name: 'New', createdAt: 1, updatedAt: 10, songs: [] } }
    expect(mergePlaylists(local, server).p1.name).toBe('New')
    expect(mergePlaylists(server, local).p1.name).toBe('New')
  })
  it('per-song removal tombstones propagate deletes through the union', () => {
    // Device A removed song X (tomb t=100); device B still has it (addedAt t=50)
    const a = { p1: { id: 'p1', createdAt: 1, updatedAt: 100, removed: { x: 100 }, songs: [song('y', { addedAt: 10 })] } }
    const b = { p1: { id: 'p1', createdAt: 1, updatedAt: 50, songs: [song('x', { addedAt: 50 }), song('y', { addedAt: 10 })] } }
    const merged = mergePlaylists(b, a).p1
    expect(merged.songs.map(s => s.id)).toEqual(['y']) // x stays removed
    expect(merged.removed.x).toBe(100)
  })
  it('a re-added song survives its older removal tombstone', () => {
    const a = { p1: { id: 'p1', createdAt: 1, updatedAt: 200, removed: {}, songs: [song('x', { addedAt: 150 })] } }
    const b = { p1: { id: 'p1', createdAt: 1, updatedAt: 100, removed: { x: 100 }, songs: [] } }
    const merged = mergePlaylists(b, a).p1
    expect(merged.songs.map(s => s.id)).toEqual(['x']) // addedAt 150 > tomb 100
  })
})

describe('mergeHistory', () => {
  it('unions by id+ts — every play survives so repeat counts work', () => {
    const local = [{ ...song('a'), ts: 50 }, { ...song('b'), ts: 10 }]
    const server = [{ ...song('a'), ts: 30 }, { ...song('c'), ts: 90 }]
    const merged = mergeHistory(local, server)
    // 'a' was played on BOTH devices at different times → 2 entries
    expect(merged.map(s => `${s.id}:${s.ts}`)).toEqual(['c:90', 'a:50', 'a:30', 'b:10'])
  })
  it('dedupes the identical play seen on both devices', () => {
    const local = [{ ...song('a'), ts: 50 }]
    const server = [{ ...song('a'), ts: 50 }]
    expect(mergeHistory(local, server)).toHaveLength(1)
  })
  it('caps at 200 entries', () => {
    const local = Array.from({ length: 300 }, (_, i) => ({ ...song(`s${i}`), ts: i }))
    expect(mergeHistory(local, [])).toHaveLength(200)
  })
  it('skips id-less entries', () => {
    expect(mergeHistory([{ name: 'ghost', ts: 1 }], [])).toEqual([])
  })
})

describe('mergeCollections', () => {
  it('unions by id, newest per-item timestamp wins', () => {
    const local = [{ id: 'al1', savedAt: 100 }, { id: 'al2', savedAt: 5 }]
    const server = [{ id: 'al1', savedAt: 50 }, { id: 'al3', savedAt: 200 }]
    const merged = mergeCollections(local, server)
    const byId = Object.fromEntries(merged.map(x => [x.id, x]))
    expect(Object.keys(byId).sort()).toEqual(['al1', 'al2', 'al3'])
    expect(byId.al1.savedAt).toBe(100)
  })
})

describe('tombstones', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('kills items saved before the tombstone, keeps re-saves after', () => {
    addTombstone('albums', 'al1')
    const items = [
      { id: 'al1', savedAt: 50 },     // saved before tombstone → dead
      { id: 'al1b', savedAt: Date.now() }, // different id → survives
      { id: 'al2', savedAt: Date.now() + 1000 }
    ]
    const out = applyTombstones(items, 'albums', 'savedAt')
    expect(out.map(x => x.id).sort()).toEqual(['al1b', 'al2'])
  })

  it('a re-save after the tombstone survives', () => {
    const tombTs = Date.now()
    localStorage.setItem(TOMB_KEYS.albums, JSON.stringify([{ id: 'al1', ts: tombTs }]))
    const items = [{ id: 'al1', savedAt: tombTs + 1000 }] // re-saved AFTER → survives
    expect(applyTombstones(items, 'albums', 'savedAt')).toHaveLength(1)
  })

  it('clearTombstone removes the kill', () => {
    addTombstone('artists', 'ar1')
    clearTombstone('artists', 'ar1')
    expect(getTombstones(TOMB_KEYS.artists)).toEqual([])
    expect(applyTombstones([{ id: 'ar1', followedAt: 1 }], 'artists', 'followedAt')).toHaveLength(1)
  })

  it('caps the tombstone list at 500', () => {
    for (let i = 0; i < 600; i++) addTombstone('albums', `a${i}`)
    expect(getTombstones(TOMB_KEYS.albums).length).toBe(500)
  })

  it('song tombstones: unlike kills the id, re-like clears it', () => {
    addTombstone('songs', 'songA')
    expect(isTombstoned('songs', 'songA')).toBe(true)
    // Pull-side filter drops a stale server like
    const merged = ['songA', 'songB'].filter(id => !isTombstoned('songs', id))
    expect(merged).toEqual(['songB'])
    clearTombstone('songs', 'songA')
    expect(isTombstoned('songs', 'songA')).toBe(false)
  })

  it('playlist tombstones survive push/pull so deletes propagate', () => {
    addTombstone('playlists', 'pl1')
    const tombs = getTombstones(TOMB_KEYS.playlists)
    expect(tombs.find(t => t.id === 'pl1')).toBeTruthy()
    // Server-side semantics: tombstone newer than createdAt kills the stale copy
    const pl = { id: 'pl1', createdAt: tombs[0].ts - 1000 }
    const recreated = { id: 'pl2', createdAt: tombs[0].ts + 1000 }
    const plTombs = new Map(getTombstones(TOMB_KEYS.playlists).map(t => [t.id, t.ts]))
    expect((plTombs.get(pl.id) || 0) <= pl.createdAt).toBe(false) // killed
    expect((plTombs.get(recreated.id) || 0) <= recreated.createdAt).toBe(true) // survives
  })
})

describe('folders', () => {
  beforeEach(() => localStorage.clear())

  it('slimPlaylists carries folderId so assignments sync', () => {
    const out = slimPlaylists({ p1: { id: 'p1', name: 'P', createdAt: 1, updatedAt: 2, folderId: 'f1', songs: [song('a')] } })
    expect(out.p1.folderId).toBe('f1')
  })

  it('slimFolders serializes the map with timestamps', () => {
    const out = slimFolders({ f1: { id: 'f1', name: 'Tamil', createdAt: 10, updatedAt: 20, junk: 'x' } })
    expect(out.f1).toEqual({ id: 'f1', name: 'Tamil', createdAt: 10, updatedAt: 20 })
    expect(out.f1.junk).toBeUndefined()
  })

  it('mergeFolders unions by id, newest updatedAt wins scalars', () => {
    const local = { f1: { id: 'f1', name: 'Old', createdAt: 1, updatedAt: 5 }, f2: { id: 'f2', name: 'LocalOnly', createdAt: 2, updatedAt: 2 } }
    const server = { f1: { id: 'f1', name: 'New', createdAt: 1, updatedAt: 10 }, f3: { id: 'f3', name: 'RemoteOnly', createdAt: 3, updatedAt: 3 } }
    const merged = mergeFolders(local, server)
    expect(merged.f1.name).toBe('New')
    expect(merged.f2.name).toBe('LocalOnly')
    expect(merged.f3.name).toBe('RemoteOnly')
  })

  it('cross-device deletion propagates: tomb newer than createdAt kills the folder', () => {
    addTombstone('folders', 'f1')
    const tombTs = getTombstones(TOMB_KEYS.folders)[0].ts
    const folders = {
      f1: { id: 'f1', name: 'Dead', createdAt: tombTs - 1000 },   // older than tomb → dead
      f2: { id: 'f2', name: 'Alive', createdAt: tombTs - 500 }   // no tomb → survives
    }
    const flTombMap = new Map(getTombstones(TOMB_KEYS.folders).map(t => [t.id, t.ts]))
    const merged = Object.fromEntries(Object.entries(folders)
      .filter(([id, f]) => (flTombMap.get(id) || 0) <= (f.createdAt || 0)))
    expect(Object.keys(merged)).toEqual(['f2'])
  })

  it('restored folders outlive their tomb: restamped createdAt survives the filter', () => {
    addTombstone('folders', 'f1')
    const tombTs = getTombstones(TOMB_KEYS.folders)[0].ts
    // Backup restore restamps createdAt newer than the tomb → restored
    const folders = { f1: { id: 'f1', name: 'Restored', createdAt: tombTs + 1000 } }
    const flTombMap = new Map(getTombstones(TOMB_KEYS.folders).map(t => [t.id, t.ts]))
    const merged = Object.fromEntries(Object.entries(folders)
      .filter(([id, f]) => (flTombMap.get(id) || 0) <= (f.createdAt || 0)))
    expect(merged.f1).toBeTruthy()
  })

  it('concurrent add-to-deleted-folder: playlist survives but is un-filed', () => {
    addTombstone('folders', 'f1')
    const tombTs = getTombstones(TOMB_KEYS.folders)[0].ts
    // Folder killed by tomb filter (createdAt older than tomb)
    const mergedFolders = {} // f1 didn't survive
    const flTombMap = new Map(getTombstones(TOMB_KEYS.folders).map(t => [t.id, t.ts]))
    const mergedPls = {
      p1: { id: 'p1', name: 'P', createdAt: 1, folderId: 'f1', songs: [song('a')] }
    }
    for (const [pid, p] of Object.entries(mergedPls)) {
      if (!p.folderId) continue
      const f = mergedFolders[p.folderId]
      if (!f || (flTombMap.get(p.folderId) || 0) > (f.createdAt || 0)) {
        mergedPls[pid] = { ...p, folderId: undefined }
      }
    }
    expect(mergedPls.p1).toBeTruthy()              // playlist NOT lost
    expect(mergedPls.p1.folderId).toBeUndefined()  // just un-filed
    expect(mergedPls.p1.songs).toHaveLength(1)
  })

  it('C1 regression: server copy lacking folderId never strips the local assignment', () => {
    const local = { p1: { id: 'p1', name: 'P', createdAt: 1, updatedAt: 20, folderId: 'f1', songs: [] } }
    const server = { p1: { id: 'p1', name: 'P', createdAt: 1, updatedAt: 10, songs: [] } } // no folderId field at all
    const merged = mergePlaylists(local, server)
    expect(merged.p1.folderId).toBe('f1')
    // And when the server IS the scalar winner but still lacks the field
    const serverNewer = { p1: { id: 'p1', name: 'P', createdAt: 1, updatedAt: 30, songs: [] } }
    expect(mergePlaylists(local, serverNewer).p1.folderId).toBe('f1')
  })
})

describe('swipe decisions (useSwipeAction core)', () => {
  it('axis locks on the first >10px movement, ~45° split', async () => {
    const { pickSwipeAxis } = await import('../hooks/useSwipeAction')
    expect(pickSwipeAxis(5, 5)).toBeNull()   // under activation → undecided
    expect(pickSwipeAxis(30, 15)).toBe('x')  // horizontal leads → swipe
    expect(pickSwipeAxis(15, 30)).toBe('y')  // vertical leads → scroll wins
    expect(pickSwipeAxis(-30, 15)).toBe('x') // direction-agnostic
  })
  it('fires only past the 70px threshold, direction by sign', async () => {
    const { swipeDirection } = await import('../hooks/useSwipeAction')
    expect(swipeDirection(-71)).toBe('left')   // → add to queue
    expect(swipeDirection(71)).toBe('right')   // → like
    expect(swipeDirection(-70)).toBeNull()     // exactly AT threshold → no fire
    expect(swipeDirection(0)).toBeNull()
  })
})

describe('normalizeArtistName', () => {
  it('collapses case, spaces, and punctuation — "A. R. Rahman" ≡ "ar rahman"', () => {
    expect(normalizeArtistName('A. R. Rahman')).toBe('arrahman')
    expect(normalizeArtistName('ar rahman')).toBe('arrahman')
    expect(normalizeArtistName('AR-RAHMAN')).toBe('arrahman')
  })
  it('handles empty/garbage input without throwing', () => {
    expect(normalizeArtistName(null)).toBe('')
    expect(normalizeArtistName(undefined)).toBe('')
    expect(normalizeArtistName(42)).toBe('42')
  })
})

describe('mergeHiddenMap — hidden song/artist sync', () => {
  it('per-entry hiddenAt LWW: the newer hide wins', async () => {
    const { mergeHiddenMap } = await import('./sync')
    const local = { s1: { id: 's1', hiddenAt: 100 } }
    const server = { s1: { id: 's1', hiddenAt: 200 }, s2: { id: 's2', hiddenAt: 50 } }
    const merged = mergeHiddenMap(local, server, 'hiddenSongs')
    expect(merged.s1.hiddenAt).toBe(200)
    expect(merged.s2).toBeTruthy()
  })

  it('un-hide tombstone kills the older entry — must NOT resurrect on merge', async () => {
    const { mergeHiddenMap } = await import('./sync')
    __store.clear()
    addTombstone('hiddenSongs', 's1')
    const tombTs = getTombstones(TOMB_KEYS.hiddenSongs)[0].ts
    const local = { s1: { id: 's1', hiddenAt: tombTs - 10 } }
    const server = { s1: { id: 's1', hiddenAt: tombTs - 5 } }
    expect(mergeHiddenMap(local, server, 'hiddenSongs').s1).toBeUndefined()
  })

  it('a re-hide AFTER the tombstone survives the filter', async () => {
    const { mergeHiddenMap } = await import('./sync')
    __store.clear()
    addTombstone('hiddenSongs', 's1')
    const tombTs = getTombstones(TOMB_KEYS.hiddenSongs)[0].ts
    const merged = mergeHiddenMap({ s1: { id: 's1', hiddenAt: tombTs + 10 } }, {}, 'hiddenSongs')
    expect(merged.s1.hiddenAt).toBe(tombTs + 10)
  })

  it('hiddenSongs and hiddenArtists have INDEPENDENT tombstone kinds', () => {
    expect(TOMB_KEYS.hiddenSongs).toBe('removedHiddenSongs')
    expect(TOMB_KEYS.hiddenArtists).toBe('removedHiddenArtists')
    expect(TOMB_KEYS.hiddenSongs).not.toBe(TOMB_KEYS.songs) // never collide with like-tombs
  })
})

describe('blocklistKeys — member vs guest scope', () => {
  it('member and guest keys are disjoint sets', async () => {
    const { blocklistKeys } = await import('./sync')
    const member = blocklistKeys(true), guest = blocklistKeys(false)
    for (const k of Object.keys(member)) {
      expect(member[k]).not.toBe(guest[k])
      expect(guest[k]).toMatch(/^guest/)
    }
  })
})

describe('isContentBlocked', () => {
  it('blocks by hidden song id', async () => {
    const { isContentBlocked } = await import('./sync')
    expect(isContentBlocked(song('s1'), { hiddenSongs: { s1: {} } })).toBe(true)
    expect(isContentBlocked(song('s2'), { hiddenSongs: { s1: {} } })).toBe(false)
  })

  it('blocks by normalized artist name — punctuation/case-insensitive', async () => {
    const { isContentBlocked } = await import('./sync')
    const ctx = { hiddenArtists: { arrahman: {} } }
    expect(isContentBlocked({ id: 's1', artist: 'A. R. Rahman' }, ctx)).toBe(true)
    expect(isContentBlocked({ id: 's1', artists: { primary: [{ name: 'AR-RAHMAN' }] } }, ctx)).toBe(true)
    expect(isContentBlocked({ id: 's1', artist: 'Someone Else' }, ctx)).toBe(false)
  })

  it('blocks explicit tracks only when the filter is on — both payload shapes', async () => {
    const { isContentBlocked } = await import('./sync')
    const on = { explicitFilter: true }, off = {}
    expect(isContentBlocked({ id: 's1', explicitContent: true }, on)).toBe(true)
    expect(isContentBlocked({ id: 's1', more_info: { explicit_content: '1' } }, on)).toBe(true)
    expect(isContentBlocked({ id: 's1', explicitContent: true }, off)).toBe(false)
  })

  it('never blocks a song with no id', async () => {
    const { isContentBlocked } = await import('./sync')
    expect(isContentBlocked({ name: 'x' }, { hiddenSongs: { x: {} }, explicitFilter: true })).toBe(false)
  })
})

describe('weekly-mix playlist merge', () => {
  it('newer weeklyMixWeek replaces the song list wholesale — no union growth', () => {
    const local = {
      w: { id: 'w', name: 'Weekly Mix', createdAt: 1, updatedAt: 5, weeklyMix: true, weeklyMixWeek: '2025-W10', songs: [song('a'), song('b')] }
    }
    const server = {
      w: { id: 'w', name: 'Weekly Mix', createdAt: 1, updatedAt: 6, weeklyMix: true, weeklyMixWeek: '2025-W11', songs: [song('c')] }
    }
    const merged = mergePlaylists(local, server)
    expect(merged.w.songs).toHaveLength(1)
    expect(merged.w.songs[0].id).toBe('c')
    expect(merged.w.weeklyMixWeek).toBe('2025-W11')
  })

  it('same week: updatedAt winner still replaces (idempotent refill)', () => {
    const local = { w: { id: 'w', createdAt: 1, updatedAt: 5, weeklyMix: true, weeklyMixWeek: '2025-W10', songs: [song('a')] } }
    const server = { w: { id: 'w', createdAt: 1, updatedAt: 9, weeklyMix: true, weeklyMixWeek: '2025-W10', songs: [song('a'), song('b')] } }
    const merged = mergePlaylists(local, server)
    expect(merged.w.songs).toHaveLength(2)
    expect(merged.w.songs[1].id).toBe('b')
  })

  it('older week never clobbers a newer refill', () => {
    const local = { w: { id: 'w', createdAt: 1, updatedAt: 5, weeklyMix: true, weeklyMixWeek: '2025-W11', songs: [song('c')] } }
    const server = { w: { id: 'w', createdAt: 1, updatedAt: 99, weeklyMix: true, weeklyMixWeek: '2025-W10', songs: [song('a'), song('b'), song('d')] } }
    const merged = mergePlaylists(local, server)
    expect(merged.w.songs).toHaveLength(1)
    expect(merged.w.weeklyMixWeek).toBe('2025-W11')
  })

  it('slimPlaylists round-trips weekly markers (a fresh device must not regenerate a duplicate)', () => {
    const out = slimPlaylists({ w: { id: 'w', name: 'WM', weeklyMix: true, weeklyMixWeek: '2025-W11', songs: [] } })
    expect(out.w.weeklyMix).toBe(true)
    expect(out.w.weeklyMixWeek).toBe('2025-W11')
  })
})
