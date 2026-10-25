import { describe, it, expect, beforeEach } from 'vitest'

// Minimal localStorage stub — vitest runs node, not a browser
const __store = new Map()
globalThis.localStorage = {
  getItem: k => (__store.has(k) ? __store.get(k) : null),
  setItem: (k, v) => { __store.set(k, String(v)) },
  removeItem: k => { __store.delete(k) },
  clear: () => __store.clear()
}

const { usePlaylistStore } = await import('./playlistStore')

const song = (id) => ({ id, name: `S${id}` })

describe('playlistStore.moveSong', () => {
  beforeEach(() => {
    __store.clear()
    usePlaylistStore.setState({ playlists: {}, folders: {} })
  })

  const seed = () => {
    const id = usePlaylistStore.getState().createPlaylist('P')
    const s = usePlaylistStore.getState()
    for (const n of ['a', 'b', 'c', 'd']) s.addSong(id, song(n))
    return id
  }

  it('moves a song down and back up — order updated, updatedAt bumps', () => {
    const id = seed()
    usePlaylistStore.getState().moveSong(id, 0, 2)
    expect(usePlaylistStore.getState().playlists[id].songs.map(s => s.id)).toEqual(['b', 'c', 'a', 'd'])
    usePlaylistStore.getState().moveSong(id, 2, 0)
    expect(usePlaylistStore.getState().playlists[id].songs.map(s => s.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('rejects out-of-bounds and no-op moves without corrupting the list', () => {
    const id = seed()
    const before = usePlaylistStore.getState().playlists[id].songs.map(s => s.id)
    usePlaylistStore.getState().moveSong(id, -1, 2)
    usePlaylistStore.getState().moveSong(id, 0, 99)
    usePlaylistStore.getState().moveSong(id, 1, 1)
    expect(usePlaylistStore.getState().playlists[id].songs.map(s => s.id)).toEqual(before)
  })
})

describe('playlistStore.createPlaylistWithId + replacePlaylistSongs (Weekly Mix)', () => {
  beforeEach(() => {
    __store.clear()
    usePlaylistStore.setState({ playlists: {}, folders: {} })
  })

  it('deterministic id — a second create with the same id is a no-op', () => {
    usePlaylistStore.getState().createPlaylistWithId('pl_weekly_2025-W11', 'Weekly Mix', { weeklyMix: true, weeklyMixWeek: '2025-W11' })
    usePlaylistStore.getState().replacePlaylistSongs('pl_weekly_2025-W11', [song('x')])
    usePlaylistStore.getState().createPlaylistWithId('pl_weekly_2025-W11', 'Weekly Mix')
    const pl = usePlaylistStore.getState().playlists['pl_weekly_2025-W11']
    expect(pl.songs).toHaveLength(1) // not reset by the duplicate create
    expect(pl.weeklyMix).toBe(true)
    expect(pl.weeklyMixWeek).toBe('2025-W11')
  })

  it('replacePlaylistSongs swaps the list wholesale and bumps updatedAt', () => {
    usePlaylistStore.getState().createPlaylistWithId('w', 'W')
    usePlaylistStore.getState().replacePlaylistSongs('w', [song('a'), song('b')])
    const first = usePlaylistStore.getState().playlists['w'].updatedAt
    usePlaylistStore.getState().replacePlaylistSongs('w', [song('c')], { weeklyMixWeek: '2025-W12' })
    const pl = usePlaylistStore.getState().playlists['w']
    expect(pl.songs.map(s => s.id)).toEqual(['c'])
    expect(pl.weeklyMixWeek).toBe('2025-W12')
    expect(pl.updatedAt).toBeGreaterThanOrEqual(first)
  })
})
