import { ChevronLeft, Play, Music, TrendingUp } from 'lucide-react'
import { parseDownloads, resolveNames } from './utils'

export default function YearView({ year, songs, albums, onBack, onSongClick, onAlbumClick, currentSong }) {
  if (!year) return null

  const yearAlbums = albums.filter(a => a.year === year)
  const yearSongs = songs.filter(s => s.year === year)
  const topSongs = [...yearSongs]
    .sort((a, b) => parseDownloads(b.downloads) - parseDownloads(a.downloads))
    .slice(0, 15)

  return (
    <div>
      {/* Header */}
      <div
        className="relative pt-10 pb-8 px-8"
        style={{ background: 'linear-gradient(180deg, rgba(80,40,40,0.5) 0%, transparent 100%)' }}
      >
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <div className="flex items-end gap-5">
          <div className="w-44 h-44 flex-shrink-0 rounded-xl bg-gradient-to-br from-zinc-700 to-zinc-900 shadow-2xl flex items-center justify-center">
            <span className="text-5xl font-black text-white">{year}</span>
          </div>
          <div className="pb-1">
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Year</p>
            <h1 className="text-4xl font-black text-white mb-2">{year}</h1>
            <p className="text-sm text-zinc-400">
              {yearAlbums.length} album{yearAlbums.length !== 1 ? 's' : ''} · {yearSongs.length} song{yearSongs.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 pb-32">
        {/* Top Songs */}
        {topSongs.length > 0 && (
          <div className="mb-10">
            <h2 className="flex items-center gap-2 text-xl font-bold text-white mb-4">
              <TrendingUp size={18} className="text-[#fc3c44]" />
              Top Songs of {year}
            </h2>
            <div className="flex flex-col gap-0.5">
              {topSongs.map((song, i) => {
                const isActive = currentSong?.id === song.id
                const artwork = song.artworkUrl || song.moviePosterUrl
                return (
                  <button
                    key={song.id}
                    onClick={() => onSongClick(song)}
                    className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors text-left w-full group"
                  >
                    <span className="w-5 text-center text-sm text-zinc-500 group-hover:hidden">{i + 1}</span>
                    <Play size={13} className="w-5 hidden group-hover:block text-white fill-white shrink-0" />
                    {artwork ? (
                      <img
                        src={artwork}
                        alt={song.album}
                        className="w-10 h-10 rounded-lg object-cover shadow flex-shrink-0"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <Music size={14} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isActive ? 'text-[#fc3c44]' : 'text-white'}`}>
                        {song.title}
                      </p>
                      <p className="text-xs text-zinc-500 truncate">
                        {resolveNames(song.singers, song.singersEnriched).join(', ') || song.artist} · {song.album}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {song.downloads && (
                        <p className="text-xs text-zinc-600">{song.downloads}</p>
                      )}
                      <p className="text-xs text-zinc-500">{song.length}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Albums */}
        {yearAlbums.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Albums of {year}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
              {yearAlbums.map(album => (
                <div
                  key={album.name}
                  onClick={() => onAlbumClick(album)}
                  className="group cursor-pointer"
                >
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-lg mb-2">
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
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-end p-3">
                      <button className="w-10 h-10 rounded-full bg-[#fc3c44] flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200">
                        <Play size={16} className="text-white fill-white ml-0.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold text-white truncate leading-snug">{album.name}</p>
                  <p className="text-xs text-zinc-500">{album.composer || 'Unknown'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
