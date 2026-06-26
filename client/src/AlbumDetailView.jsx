import { Play, Shuffle, ChevronLeft, MoreHorizontal, Clock, Music } from 'lucide-react'

function NameLinks({ value, enriched, onPersonClick, className }) {
  if (!value) return null
  const names = value.replace(/&/g, ',').split(/,\s*/).filter(Boolean)
  return (
    <span className={className}>
      {names.map((raw, i) => {
        const displayName = enriched?.[i]?.name || raw.trim()
        return (
          <span key={i}>
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); onPersonClick(displayName) }}
              onKeyDown={e => e.key === 'Enter' && onPersonClick(displayName)}
              className="cursor-pointer hover:text-white hover:underline transition-colors"
            >
              {displayName}
            </span>
            {i < names.length - 1 && <span className="text-zinc-600">, </span>}
          </span>
        )
      })}
    </span>
  )
}

export default function AlbumDetailView({ album, onBack, onSongClick, currentSong, onPersonClick, onYearClick, artists }) {
  if (!album) return null

  const matchedArtist = artists?.find(a =>
    (album.composer || '').toLowerCase().includes(a.name.toLowerCase())
  )

  return (
    <div>
      {/* Header with gradient */}
      <div
        className="relative pt-10 pb-8 px-8"
        style={{ background: 'linear-gradient(180deg, rgba(60,60,60,0.5) 0%, transparent 100%)' }}
      >
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <div className="flex gap-6 items-end">
          {/* Album art */}
          <div className="w-44 h-44 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl bg-zinc-800">
            {album.artworkUrl ? (
              <img
                src={album.artworkUrl}
                alt={album.name}
                className="w-full h-full object-cover"
                onError={e => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music size={48} className="text-zinc-600" />
              </div>
            )}
          </div>

          {/* Album meta */}
          <div className="flex-1 min-w-0 pb-1">
            <p className="text-xs text-zinc-400 uppercase tracking-wider mb-1">Album</p>
            <h1 className="text-3xl font-black text-white leading-tight mb-2">{album.name}</h1>
            <button
              onClick={() => matchedArtist && onPersonClick(matchedArtist.name)}
              className={`text-sm font-semibold mb-1 block ${matchedArtist ? 'text-[#fc3c44] hover:underline' : 'text-zinc-400 cursor-default'}`}
            >
              {album.composer || 'Unknown Artist'}
            </button>
            <p className="text-xs text-zinc-500 mb-2">
              <button
                onClick={() => album.year && onYearClick(album.year)}
                className={album.year ? 'hover:text-white hover:underline transition-colors' : ''}
              >
                {album.year || ''}
              </button>
              {album.year && <span className="mx-1">·</span>}
              {`${album.trackCount} song${album.trackCount !== 1 ? 's' : ''}`}
            </p>

            {/* Starring */}
            {album.starring && (
              <p className="text-xs text-zinc-500 mb-0.5">
                <span className="text-zinc-600">Starring: </span>
                <NameLinks
                  value={album.starring}
                  enriched={album.starringEnriched}
                  onPersonClick={onPersonClick}
                  className="text-zinc-400"
                />
              </p>
            )}

            {/* Lyricist */}
            {album.lyricist && (
              <p className="text-xs text-zinc-500 mb-0.5">
                <span className="text-zinc-600">Lyricist: </span>
                <NameLinks
                  value={album.lyricist}
                  enriched={album.lyricistEnriched}
                  onPersonClick={onPersonClick}
                  className="text-zinc-400"
                />
              </p>
            )}

            {/* Director */}
            {album.director && (
              <p className="text-xs text-zinc-500">
                <span className="text-zinc-600">Director: </span>
                <NameLinks
                  value={album.director}
                  enriched={album.directorEnriched}
                  onPersonClick={onPersonClick}
                  className="text-zinc-400"
                />
              </p>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mt-7">
          <button
            onClick={() => album.songs[0] && onSongClick(album.songs[0])}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#fc3c44] rounded-full text-white text-sm font-semibold hover:bg-red-500 transition-colors shadow-lg"
          >
            <Play size={15} className="fill-white" />
            Play
          </button>
          <button className="flex items-center gap-2 px-6 py-2.5 border border-zinc-600 rounded-full text-white text-sm font-semibold hover:border-zinc-400 transition-colors">
            <Shuffle size={15} />
            Shuffle
          </button>
          <button className="ml-auto text-zinc-500 hover:text-white transition-colors p-2">
            <MoreHorizontal size={20} />
          </button>
        </div>
      </div>

      {/* Track list */}
      <div className="px-8 pb-32">
        <div className="flex items-center gap-4 pb-3 border-b border-zinc-800/60 text-xs text-zinc-600 uppercase tracking-wider mb-1">
          <span className="w-6 text-center">#</span>
          <span className="flex-1">Title</span>
          <Clock size={13} />
        </div>

        {album.songs.map((song, i) => {
          const isActive = currentSong?.id === song.id
          const singers = song.singers || song.artist || ''
          return (
            <div
              key={song.id}
              onClick={() => onSongClick(song)}
              className="flex items-center gap-4 py-2.5 hover:bg-zinc-800/40 rounded-xl transition-colors w-full cursor-pointer group"
            >
              <span className={`w-6 text-center text-sm flex-shrink-0 group-hover:hidden ${isActive ? 'text-[#fc3c44]' : 'text-zinc-500'}`}>
                {isActive ? '♪' : i + 1}
              </span>
              <Play size={13} className="w-6 hidden group-hover:block text-white fill-white flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isActive ? 'text-[#fc3c44]' : 'text-white'}`}>
                  {song.title}
                </p>
                <div className="text-xs text-zinc-500 truncate">
                  <NameLinks value={singers} enriched={song.singersEnriched} onPersonClick={onPersonClick} />
                </div>
              </div>
              <span className="text-xs text-zinc-500 group-hover:hidden flex-shrink-0">{song.length}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
