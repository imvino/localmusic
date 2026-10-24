import { describe, it, expect, beforeEach } from 'vitest'
import { slimSong, mergePlaylists, mergeHistory, mergeCollections, addTombstone, clearTombstone, isTombstoned, applyTombstones, getTombstones, TOMB_KEYS } from './sync'

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
    expect(merged.p1.songs.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(merged.p2.songs.map(s => s.id)).toEqual(['z'])
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
