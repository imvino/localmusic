import { create } from 'zustand'

export const useDownloadStore = create((set, get) => ({
  downloads: {}, // { downloadId: { songId, songName, albumName, progress, status, error } }
  
  addDownload: (downloadId, songId, songName, albumName) => {
    set(state => ({
      downloads: {
        ...state.downloads,
        [downloadId]: {
          downloadId,
          songId,
          songName,
          albumName,
          progress: 0,
          status: 'downloading',
          error: null
        }
      }
    }))
  },
  
  updateDownload: (downloadId, progress) => {
    set(state => ({
      downloads: {
        ...state.downloads,
        [downloadId]: {
          ...state.downloads[downloadId],
          ...progress
        }
      }
    }))
  },
  
  removeDownload: (downloadId) => {
    set(state => {
      const newDownloads = { ...state.downloads }
      delete newDownloads[downloadId]
      return { downloads: newDownloads }
    })
  },
  
  clearCompleted: () => {
    set(state => {
      const newDownloads = {}
      Object.entries(state.downloads).forEach(([id, dl]) => {
        if (dl.status !== 'complete' && dl.status !== 'error') {
          newDownloads[id] = dl
        }
      })
      return { downloads: newDownloads }
    })
  },
  
  getDownloadBySongId: (songId) => {
    const state = get()
    return Object.values(state.downloads).find(dl => dl.songId === songId)
  },
  
  hasActiveDownloads: () => {
    const state = get()
    return Object.values(state.downloads).some(dl => dl.status === 'downloading')
  }
}))
