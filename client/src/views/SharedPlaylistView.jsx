import { useParams, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Play, ListPlus, Music, ArrowLeft } from 'lucide-react'
import { decodePlaylistShare, getImageSrc, formatDuration } from '../utils'
import { usePlaylistStore } from '../stores/playlistStore'
import { useAppAuth } from '../components/AuthGate'

// /shared/:data — a whole playlist encoded in the URL. Preview it, play it,
// or save it into your own local playlists (importPlaylist → persisted).
export default function SharedPlaylistView({ onSongClick, showToast }) {
  const { data } = useParams()
  const navigate = useNavigate()
  const importPlaylist = usePlaylistStore(s => s.importPlaylist)
  const { requireAuth } = useAppAuth()
  const [saved, setSaved] = useState(false)

  const decoded = useMemo(() => decodePlaylistShare(data), [data])

  if (!decoded || decoded.songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-zinc-500 gap-3">
        <Music size={40} />
        <p className="text-sm">This playlist link is invalid or empty</p>
        <button onClick={() => navigate('/discover')} className="text-[#fc3c44] text-sm hover:underline">
          Back to Discover
        </button>
      </div>
    )
  }

  const { name, songs } = decoded
  const art = songs.map(s => getImageSrc(s.image)).find(Boolean)

  const handleSave = () => {
    requireAuth(() => {
      importPlaylist(name, songs)
      setSaved(true)
      showToast?.('Playlist saved to your library', 'success')
    }, () => showToast?.('Sign in to save playlists'))
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-end gap-5 mb-8">
        <div className="w-32 h-32 md:w-44 md:h-44 rounded-xl bg-zinc-800 overflow-hidden flex items-center justify-center shrink-0 shadow-xl">
          {art ? <img src={art} alt="" className="w-full h-full object-cover" /> : <Music size={48} className="text-zinc-600" />}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Shared Playlist</div>
          <h1 className="text-2xl md:text-4xl font-bold text-white mb-2 truncate">{name}</h1>
          <p className="text-sm text-zinc-400 mb-4">{songs.length} song{songs.length === 1 ? '' : 's'}</p>
          {decoded.droppedLocal > 0 && (
            <p className="text-xs text-amber-500/80 -mt-3 mb-4">{decoded.droppedLocal} local file{decoded.droppedLocal === 1 ? '' : 's'} not included — they only exist on the sender's device</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => onSongClick(songs[0], songs, 0)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-semibold rounded-full transition-colors touch-target"
            >
              <Play size={16} className="fill-white" /> Play
            </button>
            <button
              onClick={handleSave}
              disabled={saved}
              className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white text-sm font-semibold rounded-full transition-colors touch-target"
            >
              <ListPlus size={16} /> {saved ? 'Saved' : 'Save to Library'}
            </button>
          </div>
        </div>
      </div>

      <div>
        {songs.map((song, i) => (
          <button
            key={`${i}-${song.id}`}
            onClick={() => onSongClick(song, songs, i)}
            className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors w-full text-left"
          >
            <span className="w-6 text-xs text-center text-zinc-600 shrink-0">{i + 1}</span>
            <div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden shrink-0">
              {getImageSrc(song.image) && <img src={getImageSrc(song.image)} alt="" className="w-full h-full object-cover" loading="lazy" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-200 truncate">{song.name}</div>
              <div className="text-xs text-zinc-500 truncate">{song.artist}</div>
            </div>
            <span className="text-xs text-zinc-500 shrink-0 hidden sm:block">{formatDuration(song.duration)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
