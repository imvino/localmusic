import { useState } from 'react'
import { Download, Loader2, Check } from 'lucide-react'
import { downloadSongs, getDownloads } from '../utils/downloads'

// Header "Download" button for albums/playlists/liked songs — batch-downloads
// the whole collection for offline (Spotify's one-tap download parity).
export default function BatchDownloadButton({ songs, label = 'Download', compact = false, onDone }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // 0-100 while running
  const [allDone, setAllDone] = useState(() => {
    if (!songs?.length) return false
    const list = getDownloads()
    return songs.every(s => s?.id && list.some(d => d.id === s.id))
  })

  if (!songs?.length) return null

  const run = async () => {
    if (busy) return
    setBusy(true)
    setProgress(0)
    try {
      const res = await downloadSongs(songs, {
        onProgress: (done, total) => setProgress(Math.round((done / total) * 100))
      })
      setAllDone(res.failed === 0 && res.done > 0)
      onDone?.(res)
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  if (allDone && !busy) {
    return (
      <button
        className={`flex items-center gap-2 rounded-full bg-zinc-800 text-emerald-400 font-semibold transition-colors touch-target ${
          compact ? 'px-4 py-2 text-sm' : 'px-6 py-3'
        }`}
        disabled
        title="All songs downloaded"
      >
        <Check size={compact ? 16 : 18} /> {compact ? 'Saved' : 'Downloaded'}
      </button>
    )
  }

  return (
    <button
      onClick={run}
      disabled={busy}
      className={`flex items-center gap-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold transition-colors touch-target disabled:opacity-70 ${
        compact ? 'px-4 py-2 text-sm' : 'px-6 py-3'
      }`}
      title="Download all for offline"
    >
      {busy ? <Loader2 size={compact ? 16 : 18} className="animate-spin" /> : <Download size={compact ? 16 : 18} />}
      {busy && progress !== null ? `Downloading ${progress}%` : label}
    </button>
  )
}