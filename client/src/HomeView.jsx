import { Play, Music } from 'lucide-react'
import { getGreeting } from './utils'

function AlbumCard({ album, onClick }) {
  return (
    <div onClick={onClick} className="group cursor-pointer flex flex-col gap-2">
      <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-lg">
        {album.artworkUrl ? (
          <img
            src={album.artworkUrl}
            alt={album.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music size={36} className="text-zinc-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-end justify-end p-3">
          <button className="w-10 h-10 rounded-full bg-[#fc3c44] flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200">
            <Play size={16} className="text-white fill-white ml-0.5" />
          </button>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-white truncate leading-snug">{album.name}</p>
        <p className="text-xs text-zinc-500">{album.year || 'Unknown'}</p>
      </div>
    </div>
  )
}

export default function HomeView({ albums, onAlbumClick }) {
  const totalSongs = albums.reduce((n, a) => n + a.songs.length, 0)
  const quickAlbums = albums.slice(0, 6)
  const recentAlbums = albums.slice(0, 12)

  return (
    <div className="p-8 pb-10">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-white mb-1">{getGreeting()}</h1>
        <p className="text-sm text-zinc-500">{albums.length} albums · {totalSongs} songs</p>
      </div>

      {/* Quick access grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-10">
        {quickAlbums.map(album => (
          <button
            key={album.name}
            onClick={() => onAlbumClick(album)}
            className="flex items-center gap-3 bg-zinc-800/50 hover:bg-zinc-700/60 rounded-xl overflow-hidden transition-colors text-left h-16 group"
          >
            {album.artworkUrl ? (
              <img
                src={album.artworkUrl}
                alt={album.name}
                className="w-16 h-16 object-cover flex-shrink-0"
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="w-16 h-16 bg-zinc-700 flex items-center justify-center flex-shrink-0">
                <Music size={20} className="text-zinc-500" />
              </div>
            )}
            <span className="text-sm font-semibold text-white truncate pr-3 leading-snug">{album.name}</span>
          </button>
        ))}
      </div>

      {/* Recently Added */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white">Recently Added</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
          {recentAlbums.map(album => (
            <AlbumCard key={album.name} album={album} onClick={() => onAlbumClick(album)} />
          ))}
        </div>
      </div>
    </div>
  )
}
