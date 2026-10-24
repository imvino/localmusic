import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { ArrowLeft, Disc, Play, Shuffle, Loader2, Music } from 'lucide-react'
import TrackMenu from '../components/TrackMenu'
import ArtImage from '../components/ArtImage'
import BatchDownloadButton from '../components/BatchDownloadButton'
import { decodeHtmlEntities, getImageSrc, getSongArtwork } from '../utils'

const API_BASE = import.meta.env.VITE_API_URL

// Local album detail — songs come from the server's music-library index
// (dev/LAN: the owner's disk). Reuses the shared TrackMenu + row patterns.
export default function LocalAlbumView({ onSongClick, onShufflePlay, showToast, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, currentSong, isPlaying }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const stateAlbum = location.state?.album

  const [album, setAlbum] = useState(stateAlbum || null)
  const [loading, setLoading] = useState(!stateAlbum)

  useEffect(() => {
    if (stateAlbum) return
    let live = true
    Promise.all([
      fetch(`${API_BASE}/api/albums/${id}/songs`).then(r => r.ok ? r.json() : Promise.reject()),
      fetch(`${API_BASE}/api/albums`).then(r => r.ok ? r.json() : Promise.reject())
    ]).then(([songs, all]) => {
      if (!live) return
      const meta = (all || []).find(a => a.id === id)
      setAlbum(meta ? { ...meta, songs: songs || [] } : { id, name: 'Album', songs: songs || [] })
      setLoading(false)
    }).catch(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const artistName = useMemo(() => {
    const parts = (album?.localPath || '').split('/').filter(Boolean)
    return parts[parts.length - 2] || 'Unknown Artist'
  }, [album])

  const songs = album?.songs || []
  const artwork = useMemo(() => {
    if (!album) return ''
    const fromSongs = songs.map(s => s.imageUrl || getImageSrc(s.image)).find(Boolean)
    return fromSongs || ''
  }, [album, songs])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-zinc-500" size={32} />
      </div>
    )
  }

  if (!album || songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-3">
        <Disc size={40} />
        <p className="text-sm">Album not found in your collection</p>
      </div>
    )
  }

  const handleShuffle = () => onShufflePlay?.(songs)

  return (
    <div className="p-4 md:p-8 pb-32">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors mb-4">
        <ArrowLeft size={18} /> Back
      </button>

      <div className="flex flex-col md:flex-row gap-6 md:items-end mb-8">
        <ArtImage
          image={artwork}
          alt={album.name}
          className="w-40 h-40 md:w-52 md:h-52 rounded-xl shadow-2xl shrink-0"
          iconSize={56}
          fallback={Disc}
          rounded="rounded-xl"
        />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">
            {album.year ? `${album.year} · ` : ''}Album{album.totalTracks ? ` · ${album.totalTracks} tracks` : ''}
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight">{decodeHtmlEntities(album.name)}</h1>
          <p className="text-zinc-400 mt-2 truncate">{artistName}</p>
          <p className="text-sm text-zinc-500 mt-1">{songs.length} songs</p>

          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => onSongClick(songs[0], songs, 0)}
              className="flex items-center gap-2 rounded-full bg-[#fc3c44] hover:bg-[#e6353d] text-white font-semibold px-6 py-3 transition-colors touch-target"
            >
              <Play size={18} fill="currentColor" /> Play
            </button>
            {onShufflePlay && (
              <button
                onClick={handleShuffle}
                className="flex items-center gap-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 transition-colors touch-target"
              >
                <Shuffle size={18} /> Shuffle
              </button>
            )}
            <BatchDownloadButton songs={songs} compact />
          </div>
        </div>
      </div>

      <div className="space-y-1">
        {songs.map((song, index) => (
          <div
            key={song.id}
            role="button"
            tabIndex={0}
            onClick={() => onSongClick(song, songs, index)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSongClick(song, songs, index) } }}
            className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors group cursor-pointer ${
              currentSong?.id === song.id && isPlaying ? 'bg-zinc-800/80 border border-[#fc3c44]/30' : 'hover:bg-zinc-800/50'
            }`}
          >
            <span className="text-zinc-500 w-5 text-center text-sm shrink-0">{index + 1}</span>
            <ArtImage
              image={song.imageUrl || song.image}
              alt={song.name}
              className="w-10 h-10 rounded"
              iconSize={16}
              fallback={Music}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{decodeHtmlEntities(song.name)}</div>
              <div className="text-xs text-zinc-500 truncate">{artistName}</div>
            </div>
            <div onClick={e => e.stopPropagation()}>
              <TrackMenu
                song={{ ...song, imageUrl: song.imageUrl || getImageSrc(song.image), isLocal: true, artist: artistName, albumId: album.id, album: album.name }}
                likedSongs={likedSongs}
                onLikeToggle={onLikeToggle}
                onPlayNext={onPlayNext}
                onAddToQueue={onAddToQueue}
                onGoToAlbum={onGoToAlbum}
                onSongRadio={onSongRadio}
                showToast={showToast}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}