import { useEffect, useRef, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { X, Mic2, Music, Languages, Loader2 } from 'lucide-react'
import { decodeHtmlEntities, getImageSrc } from '../utils'
import { parseLrc, activeLrcIndex } from '../utils/lrc'

const API_BASE = import.meta.env.VITE_API_URL

// Module-level translation cache — switching songs twice shouldn't re-hit
// the proxy every time
const translationCache = new Map() // `${songId}:${mode}` -> { lines?: string[], text?: string }

export default function LyricsModal({ song, onClose, currentTime, onSeek }) {
  const scrollRef = useRef(null)
  // mode: null | 'rm' (Tanglish romanization) | 'en' (English translation)
  const [mode, setMode] = useState(null)
  const [translating, setTranslating] = useState(false)
  const [translation, setTranslation] = useState(null) // { lines?: [], text?: string }
  const [translateFailed, setTranslateFailed] = useState(false)

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

  // Reset translation state when the song changes
  useEffect(() => {
    setMode(null)
    setTranslation(null)
    setTranslateFailed(false)
  }, [song?.id])

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
    const target = el.getBoundingClientRect().top - container.getBoundingClientRect().top
      + container.scrollTop - container.clientHeight / 2 + el.clientHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [karaoke, activeIdx])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggleTranslate = async (next) => {
    if (next === null || mode === next) {
      setMode(null)
      return
    }
    if (!data) return
    const cacheKey = `${song.id}:${next}`
    const cached = translationCache.get(cacheKey)
    if (cached) {
      setTranslation(cached)
      setMode(next)
      return
    }
    setTranslating(true)
    setTranslateFailed(false)
    try {
      const payload = karaoke
        ? { lines: synced.map(l => l.text) }
        : { text: data.lyrics }
      const res = await fetch(`${API_BASE}/api/translate?lang=${next}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()
      const result = json?.data || null
      if (result) translationCache.set(cacheKey, result)
      setTranslation(result)
      setMode(next)
      if (!result) setTranslateFailed(true)
    } catch {
      setTranslateFailed(true)
    } finally {
      setTranslating(false)
    }
  }

  if (!song) return null

  const translatedLine = (i) => (mode && translation?.lines ? translation.lines[i] : null)
  const showTranslatedPlain = mode && translation?.text

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
          {/* Lyrics mode — one button cycles Original → Tanglish → English.
              Tanglish = romanized sing-along script; English = meaning. */}
          {!isLoading && (karaoke || data?.lyrics) && (
            <button
              onClick={() => toggleTranslate(mode === null ? 'rm' : mode === 'rm' ? 'en' : null)}
              disabled={translating}
              title={
                mode === null ? 'Tanglish — sing-along script (e.g. oruvan oruvan)'
                  : mode === 'rm' ? 'Tanglish on — tap for English'
                  : 'English on — tap for Original'
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors touch-target ${
                mode ? 'bg-[#fc3c44] text-white' : 'bg-zinc-800 text-zinc-300 hover:text-white'
              }`}
            >
              {translating ? <Loader2 size={14} className="animate-spin" /> : <Languages size={14} />}
              {mode === 'rm' ? 'Tanglish' : mode === 'en' ? 'English' : 'Tanglish'}
            </button>
          )}
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
              {synced.map((line, i) => {
                const tLine = translatedLine(i)
                const isActive = i === activeIdx
                return (
                  <div key={i} className={`py-1.5 transition-all duration-300 ${isActive ? 'scale-[1.02] origin-left' : ''}`}>
                    <button
                      onClick={() => onSeek?.(line.time)}
                      className={`block w-full text-left text-lg font-semibold leading-snug transition-colors duration-300 ${
                        isActive ? 'text-white' : i < activeIdx ? 'text-zinc-600' : 'text-zinc-500'
                      }`}
                    >
                      {line.text}
                    </button>
                    {tLine && (
                      <div className={`text-sm leading-snug mt-0.5 transition-colors duration-300 ${
                        isActive ? 'text-[#fc3c44]/90' : i < activeIdx ? 'text-zinc-600/70' : 'text-zinc-500/70'
                      }`}>
                        {tLine}
                      </div>
                    )}
                  </div>
                )
              })}
              {mode && translateFailed && (
                <p className="text-xs text-zinc-600 mt-4">Translation unavailable right now.</p>
              )}
            </div>
          ) : data?.lyrics ? (
            <div className="py-4">
              <pre className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
                {data.lyrics}
              </pre>
              {showTranslatedPlain && (
                <pre className="text-sm text-[#fc3c44]/90 leading-relaxed whitespace-pre-wrap font-sans mt-4 pt-4 border-t border-zinc-800">
                  {translation.text}
                </pre>
              )}
              {mode && !showTranslatedPlain && !translateFailed && (
                <p className="text-xs text-zinc-600 mt-4">No translation found for this song.</p>
              )}
            </div>
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