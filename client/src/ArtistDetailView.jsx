import { Play, Shuffle, ChevronLeft, Music } from 'lucide-react'
import { parseDownloads, resolveNames } from './utils'

const ROLE_LABEL = {
  composer: 'Composer',
  singer: 'Singer',
  actor: 'Actor',
  director: 'Director',
  lyricist: 'Lyricist',
}

export default function ArtistDetailView({ artist, albums, onBack, onSongClick, onAlbumClick, currentSong }) {
  if (!artist) return null

  const artistAlbums = albums.filter(a => artist.albumNames?.includes(a.name))

  const topSongs = [...artist.songs]
    .sort((a, b) => parseDownloads(b.downloads) - parseDownloads(a.downloads))
    .slice(0, 10)

  const primaryRole = artist.roles?.[0] || 'composer'
  const roleLabel = ROLE_LABEL[primaryRole] || 'Artist'
  const allRoles = artist.roles?.map(r => ROLE_LABEL[r] || r).join(', ') || ''

  return (
    <div>
      {/* Hero */}
      <div className="relative h-72 overflow-hidden">
        {artist.profileUrl ? (
          <img
            src={artist.profileUrl}
            alt={artist.name}
            className="w-full h-full object-cover object-top"
            style={{ filter: 'blur(55px) brightness(0.35) saturate(1.5)', transform: 'scale(1.3)' }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-zinc-700 to-zinc-950" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-black/20 to-transparent" />

        {/* Back */}
        <button
          onClick={onBack}
          className="absolute top-5 left-6 flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft size={20} />
          Artists
        </button>

        {/* Artist info */}
        <div className="absolute bottom-6 left-8 flex items-end gap-5">
          {artist.profileUrl ? (
            <img
              src={artist.profileUrl}
              alt={artist.name}
              className="w-28 h-28 rounded-full object-cover object-top shadow-2xl ring-2 ring-white/10 flex-shrink-0"
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-28 h-28 rounded-full bg-zinc-700 shadow-2xl flex-shrink-0 flex items-center justify-center">
              <Music size={40} className="text-zinc-500" />
            </div>
          )}
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">{allRoles || roleLabel}</p>
            <h1 className="text-4xl font-black text-white leading-tight">{artist.name}</h1>
            <p className="text-sm text-zinc-400 mt-1.5">
              {artist.songs.length} song{artist.songs.length !== 1 ? 's' : ''} · {artistAlbums.length} album{artistAlbums.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-8 py-5 flex items-center gap-4">
        <button
          onClick={() => topSongs[0] && onSongClick(topSongs[0])}
          className="w-12 h-12 rounded-full bg-[#fc3c44] flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
          <Play size={20} className="text-white fill-white ml-1" />
        </button>
        <button className="w-10 h-10 rounded-full border border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors">
          <Shuffle size={16} />
        </button>
      </div>

      <div className="px-8 pb-32">
        {/* Top Songs */}
        <h2 className="text-xl font-bold text-white mb-3">Top Songs</h2>
        <div className="flex flex-col gap-0.5 mb-10">
          {topSongs.map((song, i) => (
            <button
              key={song.id}
              onClick={() => onSongClick(song)}
              className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors text-left w-full group"
            >
              <span className="w-5 text-center text-sm text-zinc-500 group-hover:hidden">{i + 1}</span>
              <Play size={13} className="w-5 hidden group-hover:block text-white fill-white shrink-0" />
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
                <p className={`text-sm font-medium truncate ${currentSong?.id === song.id ? 'text-[#fc3c44]' : 'text-white'}`}>
                  {song.title}
                </p>
                <p className="text-xs text-zinc-500 truncate">{resolveNames(song.singers, song.singersEnriched).join(', ') || song.artist}</p>
              </div>
              <span className="text-xs text-zinc-500 flex-shrink-0">{song.length}</span>
            </button>
          ))}
        </div>

        {/* Albums */}
        {artistAlbums.length > 0 && (
          <>
            <h2 className="text-xl font-bold text-white mb-4">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {artistAlbums.map(album => (
                <div key={album.name} onClick={() => onAlbumClick(album)} className="group cursor-pointer">
                  <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 mb-2 shadow-lg">
                    {album.artworkUrl ? (
                      <img
                        src={album.artworkUrl}
                        alt={album.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Music size={30} className="text-zinc-600" />
                      </div>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{album.name}</p>
                  <p className="text-xs text-zinc-500">{album.year}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
