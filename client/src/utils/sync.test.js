import { describe, it, expect } from 'vitest'
import { slimSong, mergePlaylists, mergeHistory, mergeCollections } from './sync'

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
  it('unions by song id, keeps the newest ts, sorts newest-first', () => {
    const local = [{ ...song('a'), ts: 50 }, { ...song('b'), ts: 10 }]
    const server = [{ ...song('a'), ts: 30 }, { ...song('c'), ts: 90 }]
    const merged = mergeHistory(local, server)
    expect(merged.map(s => s.id)).toEqual(['c', 'a', 'b'])
    expect(merged.find(s => s.id === 'a').ts).toBe(50)
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
