import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const usePlaylistStore = create(persist(
  (set, get) => ({
    playlists: {}, // { [id]: { id, name, songs: [], createdAt } }

    createPlaylist: (name) => {
      const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      set(state => ({
        playlists: {
          ...state.playlists,
          [id]: { id, name: name.trim() || 'Untitled Playlist', songs: [], createdAt: Date.now() }
        }
      }))
      return id
    },

    renamePlaylist: (id, name) => {
      set(state => state.playlists[id] ? {
        playlists: { ...state.playlists, [id]: { ...state.playlists[id], name: name.trim() || state.playlists[id].name } }
      } : state)
    },

    deletePlaylist: (id) => {
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
      set(state => ({
        playlists: {
          ...state.playlists,
          [id]: { ...playlist, songs: [...playlist.songs, safeSong] }
        }
      }))
      return 'added'
    },

    removeSong: (id, songId) => {
      set(state => {
        const playlist = state.playlists[id]
        if (!playlist) return state
        return {
          playlists: {
            ...state.playlists,
            [id]: { ...playlist, songs: playlist.songs.filter(s => s.id !== songId) }
          }
        }
      })
    },

    importPlaylist: (name, songs) => {
      const id = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      set(state => ({
        playlists: {
          ...state.playlists,
          [id]: { id, name: (name || '').trim() || 'Shared Playlist', songs: songs || [], createdAt: Date.now() }
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
          playlists: { ...state.playlists, [id]: { ...playlist, songs } }
        }
      })
    }
  }),
  { name: 'playlists' }
))