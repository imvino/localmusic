import { useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Mic2, Music } from 'lucide-react'
import { decodeHtmlEntities, getImageSrc } from '../utils'
import { parseLrc, activeLrcIndex } from '../utils/lrc'

const API_BASE = import.meta.env.VITE_API_URL

export default function LyricsModal({ song, onClose, currentTime, onSeek }) {
  const scrollRef = useRef(null)
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

  const synced = useMemo(() => parseLrc(data?.syncedLyrics), [data?.syncedLyrics])
  const karaoke = synced.length > 0 && typeof currentTime === 'number'
  const activeIdx = karaoke ? activeLrcIndex(synced, currentTime) : -1

  // Keep the active line centered — auto-scroll like Apple Music lyrics.
  // Scroll ONLY the lyrics container (scrollIntoView yanks every ancestor),
  // and back off for 5s after the user scrolls manually so it doesn't fight them.
  const userScrollUntil = useRef(0)
  useEffect(() => {
    if (!karaoke || activeIdx < 0 || !scrollRef.current) return
    if (Date.now() < userScrollUntil.current) return
    const container = scrollRef.current
    const el = container.firstElementChild?.children?.[activeIdx]
    if (!el) return
    // rect math — offsetTop is relative to the offsetParent, not the scroller
    const target = el.getBoundingClientRect().top - container.getBoundingClientRect().top
      + container.scrollTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [karaoke, activeIdx])

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
            {getImageSrc(song.image)
              ? <img src={getImageSrc(song.image)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-5 py-4"
          onWheel={() => { userScrollUntil.current = Date.now() + 5000 }}
          onTouchMove={() => { userScrollUntil.current = Date.now() + 5000 }}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#fc3c44] rounded-full animate-spin" />
            </div>
          ) : karaoke ? (
            <div className="py-8">
              {synced.map((line, i) => (
                <button
                  key={i}
                  onClick={() => onSeek?.(line.time)}
                  className={`block w-full text-left py-1.5 text-lg font-semibold leading-snug transition-all duration-300 ${
                    i === activeIdx ? 'text-white scale-[1.02] origin-left' : i < activeIdx ? 'text-zinc-600' : 'text-zinc-500'
                  }`}
                >
                  {line.text}
                </button>
              ))}
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
