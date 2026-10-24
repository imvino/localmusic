import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Mic2, Music } from 'lucide-react'
import { decodeHtmlEntities, getBestImageUrl } from '../utils'

const API_BASE = import.meta.env.VITE_API_URL

export default function LyricsModal({ song, onClose }) {
  const { data, isLoading } = useQuery({
    queryKey: ['lyrics', song?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/lyrics/${song.id}`)
      const json = await res.json()
      return json?.success ? json.data : null
    },
    enabled: !!song?.id,
    staleTime: 10 * 60 * 1000,
    retry: 1
  })

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!song) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 shrink-0">
          <div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden shrink-0">
            {getBestImageUrl(song.image)
              ? <img src={getBestImageUrl(song.image)} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"><Music size={16} className="text-zinc-600" /></div>}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{decodeHtmlEntities(song.name || song.title)}</div>
            <div className="text-xs text-zinc-500 truncate">{song.artist || song.artists?.primary?.[0]?.name || ''}</div>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white transition-colors touch-target">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#fc3c44] rounded-full animate-spin" />
            </div>
          ) : data?.lyrics ? (
            <pre className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
              {data.lyrics}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
              <Mic2 size={32} />
              <p className="text-sm">Lyrics unavailable for this song</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}