import { Search, Mic2, Disc3, Music } from 'lucide-react'

export default function SearchView({ query, songs, albums, artists, onSongClick, onAlbumClick, onArtistClick }) {
  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <Search size={56} className="text-zinc-700 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Search your library</h2>
        <p className="text-sm text-zinc-500">Find songs, albums, and artists</p>
      </div>
    )
  }

  const q = query.toLowerCase()
  const matchedSongs = songs.filter(s =>
    s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
  )
  const matchedAlbums = albums.filter(a =>
    a.name?.toLowerCase().includes(q) || a.composer?.toLowerCase().includes(q)
  )
  const matchedArtists = artists.filter(a => a.name?.toLowerCase().includes(q))

  if (!matchedSongs.length && !matchedAlbums.length && !matchedArtists.length) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-zinc-400">
          No results for <span className="text-white font-medium">"{query}"</span>
        </p>
      </div>
    )
  }

  return (
    <div className="p-8 pb-32">
      <h1 className="text-2xl font-bold text-white mb-6">
        Results for <span className="text-zinc-400 font-normal">"{query}"</span>
      </h1>

      {matchedArtists.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
            <Mic2 size={18} className="text-[#fc3c44]" /> Artists
          </h2>
          <div className="flex gap-5 flex-wrap">
            {matchedArtists.slice(0, 6).map(a => (
              <button
                key={a.name}
                onClick={() => onArtistClick(a)}
                className="flex flex-col items-center gap-2 group w-20"
              >
                <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 shadow">
                  {a.profileUrl ? (
                    <img src={a.profileUrl} alt={a.name} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform" onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Mic2 size={24} className="text-zinc-500" /></div>
                  )}
                </div>
                <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-center leading-snug w-full truncate">{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {matchedAlbums.length > 0 && (
        <section className="mb-8">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
            <Disc3 size={18} className="text-[#fc3c44]" /> Albums
          </h2>
          <div className="flex gap-4 flex-wrap">
            {matchedAlbums.slice(0, 8).map(a => (
              <button key={a.name} onClick={() => onAlbumClick(a)} className="flex flex-col gap-2 group w-24">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-zinc-800 shadow">
                  {a.artworkUrl ? (
                    <img src={a.artworkUrl} alt={a.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={e => { e.target.style.display = 'none' }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Music size={24} className="text-zinc-600" /></div>
                  )}
                </div>
                <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-left w-24 truncate leading-snug">{a.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {matchedSongs.length > 0 && (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
            <Music size={18} className="text-[#fc3c44]" /> Songs
          </h2>
          <div className="flex flex-col gap-0.5">
            {matchedSongs.slice(0, 25).map(song => (
              <button
                key={song.id}
                onClick={() => onSongClick(song)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors text-left w-full group"
              >
                {(song.artworkUrl || song.moviePosterUrl) ? (
                  <img
                    src={song.artworkUrl || song.moviePosterUrl}
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
                  <p className="text-sm font-medium text-white truncate">{song.title}</p>
                  <p className="text-xs text-zinc-500 truncate">{song.artist} · {song.album}</p>
                </div>
                <span className="text-xs text-zinc-500 flex-shrink-0">{song.length}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
