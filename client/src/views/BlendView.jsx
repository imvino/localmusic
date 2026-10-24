import { useParams, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Play, ListPlus, Music, ArrowLeft, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { decodeBlendShare, getImageSrc, formatDuration } from '../utils'
import { slimSong } from '../utils/sync'
import { usePlaylistStore } from '../stores/playlistStore'
import { useAppAuth } from '../components/AuthGate'

const API_BASE = import.meta.env.VITE_API_URL

// /blend/:data — the friends-and-family Blend stand-in. The URL carries the
// creator's top song ids; the recipient's client batch-resolves them and
// intersects with its own likes/history/counts → "N songs in common" + a
// merged playlist. Guests preview the creator's songs; the overlap readout
// and save are member features (requireAuth → pending action survives the
// post-sign-in sync pull via AuthGate).
export default function BlendView({ onSongClick, showToast, likedSongs }) {
  const { data } = useParams()
  const navigate = useNavigate()
  const importPlaylist = usePlaylistStore(s => s.importPlaylist)
  const { requireAuth, isSignedIn } = useAppAuth()
  const [saved, setSaved] = useState(false)

  const decoded = useMemo(() => decodeBlendShare(data), [data])
  const ids = decoded?.songs.map(s => s.id) || []

  const { data: resolved, isLoading } = useQuery({
    queryKey: ['blend-resolve', ids.join(',')],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/songs?ids=${ids.slice(0, 50).join(',')}`)
      const json = await res.json()
      return json.success ? (json.data || []) : []
    },
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
    retry: 1
  })

  // Recipient's listening ids — likes ∪ playCounts ∪ history. Computed only
  // for members (guests just preview the creator's side).
  const ownIds = useMemo(() => {
    if (!isSignedIn) return new Set()
    try {
      return new Set([
        ...(likedSongs || []),
        ...Object.keys(JSON.parse(localStorage.getItem('playCounts') || '{}')),
        ...(JSON.parse(localStorage.getItem('playHistory') || '[]')).map(s => s?.id).filter(Boolean)
      ])
    } catch { return new Set() }
  }, [isSignedIn, likedSongs])

  const songs = useMemo(() => {
    const list = resolved || []
    const byId = new Map(list.map(s => [s.id, s]))
    // Keep the creator's order; unresolved ids fall back to name-only rows
    return ids.map(id => byId.get(id) || decoded.songs.find(s => s.id === id)).filter(Boolean)
  }, [resolved, ids, decoded])

  const overlapCount = isSignedIn ? songs.filter(s => ownIds.has(s.id)).length : 0

  // Merged playlist = creator's resolved songs ∪ recipient's top playCounts
  // entries (already slim song objects — no second resolve needed).
  const handleSave = () => {
    requireAuth(() => {
      const pc = (() => { try { return JSON.parse(localStorage.getItem('playCounts') || '{}') } catch { return {} } })()
      const ownTop = Object.values(pc).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 50)
      const seen = new Set()
      // slimSong strips downloadUrl/image-array bloat before persistence
      const merged = [...(resolved || []), ...ownTop]
        .map(s => slimSong(s))
        .filter(s => s?.id && !seen.has(s.id) && seen.add(s.id))
      importPlaylist(`Blend — ${decoded.name}`, merged)
      setSaved(true)
      showToast?.('Blend playlist saved to your library', 'success')
    }, () => showToast?.('Sign in to save this Blend'))
  }

  if (!decoded || ids.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-zinc-500 gap-3">
        <Users size={40} />
        <p className="text-sm">This Blend link is invalid or empty</p>
        <button onClick={() => navigate('/discover')} className="text-[#fc3c44] text-sm hover:underline">
          Back to Discover
        </button>
      </div>
    )
  }

  const art = songs.map(s => getImageSrc(s.image)).find(Boolean)

  return (
    <div className="px-4 md:px-8 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-end gap-5 mb-8">
        <div className="w-32 h-32 md:w-44 md:h-44 rounded-xl bg-gradient-to-br from-[#fc3c44] to-purple-800 overflow-hidden flex items-center justify-center shrink-0 shadow-xl">
          {art ? <img src={art} alt="" className="w-full h-full object-cover" /> : <Users size={48} className="text-white/70" />}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Blend</div>
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-2 truncate">You + {decoded.name}</h1>
          <p className="text-sm text-zinc-400 mb-4">
            {songs.length} song{songs.length === 1 ? '' : 's'}
            {isSignedIn
              ? ` · ${overlapCount} in common`
              : ''}
          </p>
          {!isSignedIn && (
            <p className="text-xs text-zinc-500 mb-4">Sign in to see what you have in common</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => songs.length && onSongClick(songs[0], songs, 0)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-semibold rounded-full transition-colors touch-target"
            >
              <Play size={16} className="fill-white" /> Play
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold rounded-full transition-colors touch-target"
            >
              <ListPlus size={16} /> {saved ? 'Saved' : 'Save Blend'}
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#fc3c44] rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          {songs.map((song, i) => {
            const inCommon = isSignedIn && ownIds.has(song.id)
            return (
              <button
                key={`${i}-${song.id}`}
                onClick={() => onSongClick(song, songs, i)}
                className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors w-full text-left"
              >
                <span className="w-6 text-xs text-center text-zinc-600 shrink-0">{i + 1}</span>
                <div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {getImageSrc(song.image)
                    ? <img src={getImageSrc(song.image)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <Music size={14} className="text-zinc-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-zinc-200 truncate">{song.name || song.title}</div>
                  <div className="text-xs text-zinc-500 truncate">{song.artist || song.artists?.primary?.[0]?.name || ''}</div>
                </div>
                {inCommon && (
                  <span className="text-[10px] font-semibold text-[#fc3c44] bg-[#fc3c44]/10 px-2 py-0.5 rounded-full shrink-0">IN COMMON</span>
                )}
                <span className="text-xs text-zinc-500 shrink-0 hidden sm:block">{formatDuration(song.duration)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
