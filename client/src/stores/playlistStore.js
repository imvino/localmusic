import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { addTombstone } from '../utils/sync'

export const usePlaylistStore = create(persist(
  (set, get) => ({
    playlists: {}, // { [id]: { id, name, songs: [], createdAt } }

    createPlaylist: (name) => {
      const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      set(state => ({
        playlists: {
          ...state.playlists,
          [id]: { id, name: name.trim() || 'Untitled Playlist', songs: [], createdAt: Date.now(), updatedAt: Date.now() }
        }
      }))
      return id
    },

    pinPlaylist: (id, pinned) => {
      set(state => state.playlists[id] ? {
        playlists: { ...state.playlists, [id]: { ...state.playlists[id], pinned: pinned ?? !state.playlists[id].pinned, updatedAt: Date.now() } }
      } : state)
    },

    renamePlaylist: (id, name) => {
      set(state => state.playlists[id] ? {
        playlists: { ...state.playlists, [id]: { ...state.playlists[id], name: name.trim() || state.playlists[id].name, updatedAt: Date.now() } }
      } : state)
    },

    deletePlaylist: (id) => {
      addTombstone('playlists', id) // deleted playlists must stay deleted across devices
      set(state => {
        const playlists = { ...state.playlists }
        delete playlists[id]
        return { playlists }
      })
    },

    addSong: (id, song) => {
      const playlist = get().playlists[id]
      if (!playlist) return 'error'
      if (playlist.songs.some(s => s.id === song.id)) return 'exists'
      // Strip server file path — meaningless client-side, leaks absolute
      // paths into localStorage (isLocal flag alone drives local playback)
      const { audioPath, ...safeSong } = song
      const now = Date.now()
      set(state => {
        const removed = { ...(playlist.removed || {}) }
        delete removed[safeSong.id] // re-add clears the removal tombstone
        return {
          playlists: {
            ...state.playlists,
            [id]: { ...playlist, removed, songs: [...playlist.songs, { ...safeSong, addedAt: now }], updatedAt: now }
          }
        }
      })
      return 'added'
    },

    removeSong: (id, songId) => {
      set(state => {
        const playlist = state.playlists[id]
        if (!playlist) return state
        // Per-song removal tombstone — a union-merged pull can't resurrect
        // a removed track since removed[songId] > its addedAt.
        return {
          playlists: {
            ...state.playlists,
            [id]: {
              ...playlist,
              songs: playlist.songs.filter(s => s.id !== songId),
              removed: { ...(playlist.removed || {}), [songId]: Date.now() },
              updatedAt: Date.now()
            }
          }
        }
      })
    },

    importPlaylist: (name, songs) => {
      const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const seen = new Set()
      const deduped = (songs || []).filter(s => s?.id && !seen.has(s.id) && seen.add(s.id))
      set(state => ({
        playlists: {
          ...state.playlists,
          [id]: { id, name: (name || '').trim() || 'Shared Playlist', songs: deduped, createdAt: Date.now(), updatedAt: Date.now() }
        }
      }))
      return id
    },

    moveSong: (id, from, to) => {
      set(state => {
        const playlist = state.playlists[id]
        if (!playlist || from === to || from < 0 || to < 0 || from >= playlist.songs.length || to >= playlist.songs.length) return state
        const songs = [...playlist.songs]
        const [moved] = songs.splice(from, 1)
        songs.splice(to, 0, moved)
        return {
          playlists: { ...state.playlists, [id]: { ...playlist, songs, updatedAt: Date.now() } }
        }
      })
    }
  }),
  { name: 'playlists' }
))