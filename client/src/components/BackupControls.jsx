import { useRef, useState } from 'react'
import { Download, Upload, Check } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'

// Backup & restore — one JSON file carries the whole library (liked songs,
// playlists, play history, prefs). For family who never sign in, this is the
// safety net that localStorage wipes can't take.
export default function BackupControls({ onImportLibrary, showToast }) {
  const fileRef = useRef(null)
  const [exported, setExported] = useState(false)

  const handleExport = () => {
    try {
      const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) || fb) } catch { return fb } }
      const backup = {
        app: 'torsongs',
        v: 1,
        exportedAt: new Date().toISOString(),
        likedSongs: read('likedSongs', '[]'),
        playlists: usePlaylistStore.getState().playlists,
        playHistory: read('playHistory', '[]'),
        prefs: {
          qualityPreference: read('qualityPreference', '"auto"'),
          autoplay: read('autoplay', '"on"'),
          eq: read('eq', '{}'),
          smoothTransitions: read('smoothTransitions', '"off"')
        }
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `torsongs-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExported(true)
      setTimeout(() => setExported(false), 3000)
      showToast?.('Backup downloaded', 'success')
    } catch (e) {
      console.error('Export failed:', e)
      showToast?.('Backup failed', 'error')
    }
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-import of the same file
    if (!file) return
    try {
      const backup = JSON.parse(await file.text())
      if (backup?.app !== 'torsongs' || !backup.v) throw new Error('Not a Torsongs backup')
      // Write through to localStorage (source of truth) then refresh React state
      if (Array.isArray(backup.likedSongs)) localStorage.setItem('likedSongs', JSON.stringify(backup.likedSongs))
      if (backup.playlists && typeof backup.playlists === 'object') localStorage.setItem('playlists', JSON.stringify({ state: { playlists: backup.playlists }, version: 0 }))
      if (Array.isArray(backup.playHistory)) localStorage.setItem('playHistory', JSON.stringify(backup.playHistory))
      for (const [k, v] of Object.entries(backup.prefs || {})) {
        if (typeof v === 'string') localStorage.setItem(k, v)
        else localStorage.setItem(k, JSON.stringify(v))
      }
      onImportLibrary?.(backup)
      showToast?.('Library restored', 'success')
    } catch (e) {
      console.error('Import failed:', e)
      showToast?.('Invalid backup file', 'error')
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1">
      <button
        onClick={handleExport}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-800/70 hover:bg-zinc-700 text-zinc-200 transition-colors flex-1 justify-center"
        title="Download a JSON backup of your library"
      >
        {exported ? <Check size={14} className="text-emerald-400" /> : <Download size={14} />}
        Backup
      </button>
      <button
        onClick={() => fileRef.current?.click()}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-zinc-800/70 hover:bg-zinc-700 text-zinc-200 transition-colors flex-1 justify-center"
        title="Restore from a Torsongs backup file"
      >
        <Upload size={14} />
        Restore
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleImportFile} />
    </div>
  )
}