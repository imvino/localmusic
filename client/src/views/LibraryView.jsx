import { useNavigate } from 'react-router-dom'
import { Heart, ListMusic, Download, BarChart3, ChevronRight, Music } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { getBestImageUrl, decodeHtmlEntities } from '../utils'

export default function LibraryView({ likedSongs }) {
  const navigate = useNavigate()
  const playlists = usePlaylistStore(s => s.playlists)
  const downloads = (() => { try { return JSON.parse(localStorage.getItem('downloads') || '[]') } catch { return [] } })()
  const playlistList = Object.values(playlists).slice(0, 6)

  const Row = ({ icon: Icon, label, sub, to, tint }) => (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-900 active:bg-zinc-800 transition-colors text-left"
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{label}</div>
        {sub && <div className="text-xs text-zinc-500 truncate">{sub}</div>}
      </div>
      <ChevronRight size={18} className="text-zinc-600 shrink-0" />
    </button>
  )

  return (
    <div className="px-4 pt-4 pb-32">
      <h1 className="text-2xl font-bold text-white mb-4">Your Library</h1>

      <div className="bg-zinc-900/60 rounded-xl overflow-hidden divide-y divide-zinc-800/60">
        <Row icon={Heart} label="Liked Songs" sub={`${likedSongs?.size ?? 0} songs`} to="/liked" tint="bg-gradient-to-br from-[#fc3c44] to-[#7c1d26]" />
        <Row icon={Download} label="Downloads" sub={`${downloads.length} available offline`} to="/downloads" tint="bg-gradient-to-br from-emerald-500 to-emerald-800" />
        <Row icon={BarChart3} label="Your Stats" sub="Listening activity" to="/stats" tint="bg-gradient-to-br from-indigo-500 to-indigo-800" />
      </div>

      <div className="flex items-center justify-between mt-6 mb-2 px-1">
        <h2 className="text-lg font-bold text-white">Playlists</h2>
        <button onClick={() => navigate('/playlists')} className="text-sm text-[#fc3c44] font-medium">See all</button>
      </div>
      {playlistList.length ? (
        <div className="bg-zinc-900/60 rounded-xl overflow-hidden divide-y divide-zinc-800/60">
          {playlistList.map(pl => {
            const first = pl.songs?.[0]
            return (
              <button
                key={pl.id}
                onClick={() => navigate(`/playlists/${pl.id}`)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-zinc-900 active:bg-zinc-800 transition-colors text-left"
              >
                <div className="w-11 h-11 rounded-lg bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                  {first?.imageUrl
                    ? <img src={first.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <ListMusic size={18} className="text-zinc-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{decodeHtmlEntities(pl.name)}</div>
                  <div className="text-xs text-zinc-500">{pl.songs?.length || 0} songs</div>
                </div>
                <ChevronRight size={18} className="text-zinc-600 shrink-0" />
              </button>
            )
          })}
        </div>
      ) : (
        <button
          onClick={() => navigate('/playlists')}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 bg-zinc-900/60 rounded-xl text-zinc-500"
        >
          <Music size={28} />
          <span className="text-sm">Create your first playlist</span>
        </button>
      )}
    </div>
  )
}
