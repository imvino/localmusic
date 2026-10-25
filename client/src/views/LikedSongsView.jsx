import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Heart, Play, Shuffle, Music, ArrowDownWideNarrow, Search, X } from 'lucide-react'
import { getImageSrc, formatDuration, decodeHtmlEntities } from '../utils'
import TrackMenu from '../components/TrackMenu'
import BatchDownloadButton from '../components/BatchDownloadButton'
import SwipeableRow from '../components/SwipeableRow'

const API_BASE = import.meta.env.VITE_API_URL
const CHUNK = 50

const chunk = (arr, size) => {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function LikedSongsView({ likedSongs, onLikeToggle, onSongClick, onShufflePlay, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, onHideSong, onHideArtist, currentSong, isPlaying, showToast }) {
  // likedSongs serializes oldest-first; display newest-first (Spotify order)
  const orderedIds = useMemo(() => [...likedSongs].reverse(), [likedSongs])

  const chunks = useMemo(() => chunk(orderedIds, CHUNK), [orderedIds])
  const results = useQueries({
    queries: chunks.map(ids => ({
      queryKey: ['songs-batch', ids.join(',')],
      queryFn: async () => {
        const res = await fetch(`${API_BASE}/api/songs?ids=${ids.join(',')}`)
        const json = await res.json()
        return json.success ? json.data : []
      },
      staleTime: 5 * 60 * 1000,
      retry: 1
    }))
  })

  const isLoading = results.some(r => r.isLoading)
  // Re-key by id — upstream order isn't guaranteed to match input order
  const byId = useMemo(() => {
    const map = new Map()
    results.forEach(r => (r.data || []).forEach(s => map.set(s.id, s)))
    return map
  }, [results])

  // Fallback metadata for songs the API can't resolve — local-collection
  // tracks and delisted ids still render (they're the reason this app exists)
  const likedMeta = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('likedMeta') || '{}') } catch { return {} }
  }, [likedSongs])

  const songs = orderedIds.map(id => byId.get(id) || likedMeta[id]).filter(Boolean)

  // Spotify-style sort — custom (liked order) / title / artist / oldest
  const [sort, setSort] = useState('recent')
  const [sortOpen, setSortOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const sortedSongs = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const base = q ? songs.filter(s =>
      (s.name || s.title || '').toLowerCase().includes(q) ||
      (s.artist || s.artists?.primary?.[0]?.name || s.primaryArtists || '').toLowerCase().includes(q)
    ) : songs
    if (sort === 'recent') return base
    const copy = [...base]
    if (sort === 'title') copy.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    if (sort === 'artist') copy.sort((a, b) => (a.artists?.primary?.[0]?.name || a.artist || '').localeCompare(b.artists?.primary?.[0]?.name || b.artist || ''))
    if (sort === 'oldest') copy.reverse()
    return copy
  }, [songs, sort, filter])
  const SORT_OPTIONS = [
    ['recent', 'Recently added'],
    ['oldest', 'Oldest'],
    ['title', 'Title'],
    ['artist', 'Artist']
  ]

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-end gap-5 mb-8">
        <div className="w-32 h-32 md:w-44 md:h-44 rounded-xl bg-gradient-to-br from-[#fc3c44] to-purple-700 flex items-center justify-center shrink-0 shadow-xl">
          <Heart size={56} className="text-white fill-white" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Collection</div>
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-2">Liked Songs</h1>
          <p className="text-sm text-zinc-400 mb-4">{orderedIds.length} song{orderedIds.length === 1 ? '' : 's'}</p>
          {songs.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSongClick(songs[0], songs, 0)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-semibold rounded-full transition-colors touch-target"
              >
                <Play size={16} className="fill-white" /> Play
              </button>
              <button
                onClick={() => onShufflePlay(songs)}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-full transition-colors touch-target"
              >
                <Shuffle size={16} /> Shuffle
              </button>
              <BatchDownloadButton songs={songs} compact />
            </div>
          )}
        </div>
      </div>

      {orderedIds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
          <Heart size={36} />
          <p className="text-sm">No liked songs yet — tap the heart on any song</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-zinc-700 border-t-[#fc3c44] rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          {/* Sort + find controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="relative inline-block">
              <button
                onClick={() => setSortOpen(o => !o)}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800/70 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors"
              >
                <ArrowDownWideNarrow size={13} />
                {SORT_OPTIONS.find(([k]) => k === sort)?.[1]}
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-xl w-44">
                    {SORT_OPTIONS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => { setSort(key); setSortOpen(false) }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors ${sort === key ? 'text-[#fc3c44] font-semibold' : 'text-zinc-300 hover:bg-zinc-800'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            {filterOpen ? (
              <div className="flex items-center gap-2 bg-zinc-800/80 rounded-lg px-3 py-1.5 w-64">
                <Search size={14} className="text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setFilter(''); setFilterOpen(false) } }}
                  placeholder="Find in liked songs"
                  className="bg-transparent text-sm text-white placeholder-zinc-500 outline-none flex-1 min-w-0"
                />
                <button onClick={() => { setFilter(''); setFilterOpen(false) }} className="text-zinc-500 hover:text-white shrink-0" aria-label="Close filter">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => setFilterOpen(true)} className="p-2 text-zinc-500 hover:text-white transition-colors" title="Find in liked songs" aria-label="Find in liked songs">
                <Search size={16} />
              </button>
            )}
          </div>

          {sortedSongs.map((song, i) => {
            const isCurrent = currentSong?.id === song.id
            return (
              <SwipeableRow
                key={song.id}
                className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer"
                onClick={() => onSongClick(song, sortedSongs, i)}
                onSwipeLeft={() => onAddToQueue?.(song)}
                onSwipeRight={() => onLikeToggle?.(song.id, song)}
              >
                <span className={`w-6 text-xs text-center shrink-0 ${isCurrent ? 'text-[#fc3c44] font-semibold' : 'text-zinc-600'}`}>
                  {isCurrent && isPlaying ? '▶' : i + 1}
                </span>
                <div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden shrink-0">
                  {getImageSrc(song.image) && <img src={getImageSrc(song.image)} alt="" className="w-full h-full object-cover" loading="lazy" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm truncate ${isCurrent ? 'text-[#fc3c44] font-medium' : 'text-zinc-200'}`}>
                    {decodeHtmlEntities(song.name || song.title)}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {decodeHtmlEntities(song.artist || song.artists?.primary?.[0]?.name || song.primaryArtists || '')}
                  </div>
                </div>
                <span className="text-xs text-zinc-500 shrink-0 hidden sm:block">
                  {formatDuration(song.duration)}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onLikeToggle?.(song.id, song) }}
                  className="p-1.5 shrink-0"
                  title="Unlike"
                >
                  <Heart size={16} className="fill-[#fc3c44] text-[#fc3c44]" />
                </button>
                <div onClick={e => e.stopPropagation()}>
                  <TrackMenu
                    song={song}
                    likedSongs={likedSongs}
                    onLikeToggle={onLikeToggle}
                    onPlayNext={onPlayNext}
                    onAddToQueue={onAddToQueue}
                    onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist}
                    showToast={showToast}
                  />
                </div>
              </SwipeableRow>
            )
          })}
          {sortedSongs.length === 0 && songs.length > 0 && (
            <p className="text-sm text-zinc-500 text-center py-10">No matches for “{filter.trim()}”</p>
          )}
          {songs.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
              <Music size={36} />
              <p className="text-sm">Couldn't resolve liked songs — the server may be offline</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}