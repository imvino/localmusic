import { useEffect, useState } from 'react'
import { ArrowLeft, Download, Music, Trash2, WifiOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getDownloads, removeDownload, reconcileDownloads } from '../utils/downloads'
import { decodeHtmlEntities, formatTime } from '../utils'

export default function DownloadsView({ onSongClick, showToast }) {
  const navigate = useNavigate()
  const [songs, setSongs] = useState(() => getDownloads())
  const [storage, setStorage] = useState(null) // {used, quota} | 'unavailable'

  // Self-heal: drop registry entries whose audio was evicted from the cache
  useEffect(() => { reconcileDownloads().then(setSongs) }, [])

  // Storage meter — quota + summed audio-downloads cache blob sizes.
  // Degrades to a song count where storage APIs are missing (older Safari).
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const [est, cache] = await Promise.all([
          navigator.storage?.estimate?.().catch(() => null),
          caches.open('audio-downloads')
        ])
        const keys = await cache.keys()
        let used = 0
        for (const req of keys) {
          const res = await cache.match(req)
          const blob = await res?.blob().catch(() => null)
          used += blob?.size || 0
        }
        if (live) setStorage({ used, quota: est?.quota || 0 })
      } catch { if (live) setStorage('unavailable') }
    })()
    return () => { live = false }
  }, [songs.length])

  const fmtMB = (b) => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`

  const remove = async (id) => {
    await removeDownload(id)
    setSongs(getDownloads())
    showToast?.('Removed from downloads')
  }

  return (
    <div className="px-4 pt-4 pb-32">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => navigate(-1)} className="p-1 text-zinc-400 hover:text-white">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-2xl font-bold text-white">Downloads</h1>
        <span className="text-sm text-zinc-500 ml-auto">{songs.length} songs</span>
      </div>

      {!songs.length ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
          <Download size={36} />
          <p className="text-sm">Nothing downloaded yet</p>
          <p className="text-xs text-zinc-600 max-w-56 text-center">
            Use <span className="text-zinc-400">⋯ → Download</span> on any song to keep it for offline playback
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <WifiOff size={14} />
            These play with no network at all
          </div>
          {storage && storage !== 'unavailable' && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                <span>Offline storage</span>
                <span>{fmtMB(storage.used)}{storage.quota ? ` of ${fmtMB(storage.quota)}` : ''} used</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, storage.quota ? (storage.used / storage.quota) * 100 : 2)}%` }}
                />
              </div>
            </div>
          )}
          <div className="divide-y divide-zinc-800/60">
            {songs.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 group">
                <button
                  onClick={() => onSongClick(s, songs)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className="w-12 h-12 rounded bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {s.imageUrl
                      ? <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />
                      : <Music size={18} className="text-zinc-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">{decodeHtmlEntities(s.name)}</div>
                    <div className="text-xs text-zinc-500 truncate">{s.artist}{s.duration ? ` · ${formatTime(s.duration)}` : ''}</div>
                  </div>
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                  title="Remove download"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
