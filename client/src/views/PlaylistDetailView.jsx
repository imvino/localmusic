import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Play, Shuffle, Music, ArrowUp, ArrowDown, Trash2, Pencil, Share2, Search, X, ArrowUpDown, Check } from 'lucide-react'
import { useState } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { getImageSrc, formatDuration, encodePlaylistShare, haptic, decodeHtmlEntities } from '../utils'
import TrackMenu from '../components/TrackMenu'
import BatchDownloadButton from '../components/BatchDownloadButton'
import SwipeableRow from '../components/SwipeableRow'

const SORT_OPTIONS = [
  { id: 'custom', label: 'Custom order' },
  { id: 'recent', label: 'Recently added' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'title', label: 'Title' },
  { id: 'artist', label: 'Artist' }
]

const sortSongs = (songs, mode) => {
  if (mode === 'custom') return songs
  const arr = [...songs]
  if (mode === 'recent') arr.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
  else if (mode === 'oldest') arr.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0))
  else if (mode === 'title') arr.sort((a, b) => (a.name || a.title || '').localeCompare(b.name || b.title || ''))
  else if (mode === 'artist') arr.sort((a, b) => (a.artist || a.artists?.primary?.[0]?.name || '').localeCompare(b.artist || b.artists?.primary?.[0]?.name || ''))
  return arr
}

export default function PlaylistDetailView({ onSongClick, onShufflePlay, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, onHideSong, onHideArtist, likedSongs, onLikeToggle, currentSong, isPlaying, showToast }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const playlist = usePlaylistStore(s => s.playlists[id])
  const removeSong = usePlaylistStore(s => s.removeSong)
  const moveSong = usePlaylistStore(s => s.moveSong)
  const renamePlaylist = usePlaylistStore(s => s.renamePlaylist)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [sortMode, setSortMode] = useState('custom')
  const [sortOpen, setSortOpen] = useState(false)
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)

  const finishDrag = () => {
    if (dragIdx != null && dropIdx != null && dropIdx !== dragIdx) {
      moveSong(playlist.id, dragIdx, dropIdx)
    }
    setDragIdx(null)
    setDropIdx(null)
  }

  if (!playlist) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-zinc-500 gap-3">
        <Music size={40} />
        <p className="text-sm">Playlist not found</p>
        <button onClick={() => navigate('/playlists')} className="text-[#fc3c44] text-sm hover:underline">
          Back to playlists
        </button>
      </div>
    )
  }

  const art = playlist.songs.map(s => getImageSrc(s.image)).find(Boolean)
  const commitRename = () => {
    if (name.trim()) renamePlaylist(playlist.id, name)
    setEditing(false)
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <button onClick={() => navigate('/playlists')} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Playlists
      </button>

      <div className="flex items-end gap-5 mb-8">
        <div className="w-32 h-32 md:w-44 md:h-44 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0 shadow-xl">
          {art
            ? <img src={art} alt="" className="w-full h-full object-cover" />
            : <Music size={48} className="text-zinc-600" />}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Playlist</div>
          {editing ? (
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false) }}
              className="bg-zinc-800 text-2xl font-bold text-white rounded px-2 py-1 outline-none mb-2 w-full"
            />
          ) : (
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-2 flex items-center gap-2">
              <span className="truncate">{playlist.name}</span>
              <button onClick={() => { setEditing(true); setName(playlist.name) }} className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0">
                <Pencil size={16} />
              </button>
            </h1>
          )}
          <p className="text-sm text-zinc-400 mb-4">{playlist.songs.length} song{playlist.songs.length === 1 ? '' : 's'}</p>
          {playlist.songs.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onSongClick(playlist.songs[0], playlist.songs, 0)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-semibold rounded-full transition-colors touch-target"
              >
                <Play size={16} className="fill-white" /> Play
              </button>
              <button
                onClick={() => onShufflePlay(playlist.songs)}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-full transition-colors touch-target"
              >
                <Shuffle size={16} /> Shuffle
              </button>
              <BatchDownloadButton songs={playlist.songs} compact />
              <button
                onClick={async () => {
                  haptic()
                  const remote = playlist.songs.filter(s => !s.isLocal)
                  if (remote.length < playlist.songs.length) {
                    showToast?.(`${playlist.songs.length - remote.length} local file(s) can't be shared — skipped`, 'warning')
                  }
                  if (remote.length > 100) showToast?.('Shared playlists are capped at 100 songs', 'warning')
                  if (!remote.length) { showToast?.('Nothing shareable — all songs are local files', 'error'); return }
                  // Whole playlist travels inside the link — recipient previews/imports it
                  const url = `${window.location.origin}/shared/${encodePlaylistShare(playlist.name, playlist.songs)}`
                  try {
                    if (navigator.share) await navigator.share({ title: playlist.name, text: `Playlist: ${playlist.name}`, url })
                    else { await navigator.clipboard.writeText(url); showToast?.('Playlist link copied', 'success') }
                  } catch { /* dismissed */ }
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold rounded-full transition-colors touch-target"
              >
                <Share2 size={16} /> Share
              </button>
            </div>
          )}
        </div>
      </div>

      {playlist.songs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500 gap-3">
          <Music size={36} />
          <p className="text-sm">Empty playlist — add songs from any ••• menu</p>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-end gap-1 mb-2">
            <div className="relative">
              <button
                onClick={() => setSortOpen(o => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortMode !== 'custom' ? 'text-[#fc3c44] bg-[#fc3c44]/10' : 'text-zinc-500 hover:text-white'}`}
                title="Sort playlist"
              >
                <ArrowUpDown size={14} />
                {SORT_OPTIONS.find(o => o.id === sortMode)?.label}
              </button>
              {sortOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setSortOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                    {SORT_OPTIONS.map(o => (
                      <button
                        key={o.id}
                        onClick={() => { setSortMode(o.id); setSortOpen(false) }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 text-sm transition-colors ${sortMode === o.id ? 'text-[#fc3c44]' : 'text-zinc-300 hover:bg-zinc-800'}`}
                      >
                        {o.label}
                        {sortMode === o.id && <Check size={14} />}
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
                  placeholder="Find in playlist"
                  className="bg-transparent text-sm text-white placeholder-zinc-500 outline-none flex-1 min-w-0"
                />
                <button onClick={() => { setFilter(''); setFilterOpen(false) }} className="text-zinc-500 hover:text-white shrink-0" aria-label="Close filter">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button onClick={() => setFilterOpen(true)} className="p-2 text-zinc-500 hover:text-white transition-colors" title="Find in playlist" aria-label="Find in playlist">
                <Search size={16} />
              </button>
            )}
          </div>
          {(() => {
            const q = filter.trim().toLowerCase()
            const filtered = q
              ? playlist.songs.filter(s => (s.name || s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q))
              : playlist.songs
            const shown = sortSongs(filtered, sortMode)
            if (q && shown.length === 0) {
              return <p className="text-sm text-zinc-500 text-center py-10">No matches for “{filter.trim()}”</p>
            }
            // Reorder (drag + arrows) only in custom order on the unfiltered
            // list — sorted/filtered indices don't map to playlist.songs.
            const reorderable = !q && sortMode === 'custom'
            return shown.map((song, shownIdx) => {
            const i = playlist.songs.indexOf(song)
            const isCurrent = currentSong?.id === song.id
            return (
              <SwipeableRow
                key={`${i}-${song.id}`}
                className={`group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer ${dragIdx === i ? 'opacity-40' : ''} ${dropIdx === i && dragIdx !== i ? 'border-t-2 border-[#fc3c44]' : 'border-t-2 border-transparent'}`}
                draggable={reorderable}
                onDragStart={reorderable ? (e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setDragIdx(i) }) : undefined}
                onDragOver={reorderable ? (e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropIdx !== i) setDropIdx(i) }) : undefined}
                onDrop={reorderable ? (e => { e.preventDefault(); finishDrag() }) : undefined}
                onDragEnd={reorderable ? finishDrag : undefined}
                onClick={() => onSongClick(song, shown, shownIdx)} // plays the filtered subset, Spotify-style
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
                <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
                  {reorderable && (
                    <>
                      <button onClick={e => { e.stopPropagation(); moveSong(playlist.id, i, i - 1) }} disabled={i === 0} className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30" title="Move up">
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={e => { e.stopPropagation(); moveSong(playlist.id, i, i + 1) }} disabled={i === playlist.songs.length - 1} className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30" title="Move down">
                        <ArrowDown size={14} />
                      </button>
                    </>
                  )}
                  <button onClick={e => { e.stopPropagation(); removeSong(playlist.id, song.id) }} className="p-1.5 text-zinc-500 hover:text-red-400" title="Remove">
                    <Trash2 size={14} />
                  </button>
                </div>
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
            })
          })()}
        </div>
      )}
    </div>
  )
}