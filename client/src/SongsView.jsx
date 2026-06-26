import { Play, Music } from 'lucide-react'

function NameLinks({ value, enriched, onPersonClick, className }) {
  if (!value) return null
  const names = value.replace(/&/g, ',').split(/,\s*/).filter(Boolean)
  return (
    <span className={className}>
      {names.map((raw, i) => {
        const displayName = enriched?.[i]?.name || raw.trim()
        return (
          <span key={i}>
            <button
              onClick={e => { e.stopPropagation(); onPersonClick(displayName) }}
              className="hover:text-white hover:underline transition-colors"
            >
              {displayName}
            </button>
            {i < names.length - 1 && <span className="text-zinc-600">, </span>}
          </span>
        )
      })}
    </span>
  )
}

export default function SongsView({ songs, onSongClick, currentSong, onAlbumClick, onPersonClick }) {
  return (
    <div className="p-8 pb-32">
      <h1 className="text-3xl font-black text-white mb-6">Songs</h1>
      <table className="w-full text-left text-sm text-zinc-400 border-collapse">
        <thead>
          <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider">
            <th className="pb-3 w-10 text-center font-medium">#</th>
            <th className="pb-3 font-medium">Title</th>
            <th className="pb-3 font-medium hidden md:table-cell">Album</th>
            <th className="pb-3 font-medium hidden lg:table-cell text-right pr-4">Time</th>
          </tr>
        </thead>
        <tbody>
          {songs.map((song, i) => {
            const isActive = currentSong?.id === song.id
            const artwork = song.artworkUrl || song.moviePosterUrl
            const singers = song.singers || song.artist || ''
            const lyricists = song.lyricist || ''
            return (
              <tr
                key={song.id}
                onClick={() => onSongClick(song)}
                className={`hover:bg-zinc-800/50 group cursor-pointer transition-colors ${isActive ? 'bg-zinc-800/60' : ''}`}
              >
                <td className="py-2.5 text-center rounded-l-xl">
                  <span className={`group-hover:hidden text-xs ${isActive ? 'text-[#fc3c44]' : ''}`}>
                    {isActive ? '♪' : i + 1}
                  </span>
                  <Play size={13} className="hidden group-hover:inline-block mx-auto text-white fill-white" />
                </td>
                <td className="py-2.5">
                  <div className="flex items-center gap-3">
                    {artwork ? (
                      <img
                        src={artwork}
                        alt={song.album}
                        className="w-9 h-9 rounded-lg object-cover shadow flex-shrink-0"
                        onError={e => { e.target.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <Music size={14} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${isActive ? 'text-[#fc3c44]' : 'text-white'}`}>
                        {song.title}
                      </p>
                      <div className="text-xs text-zinc-500 truncate leading-relaxed">
                        <NameLinks value={singers} enriched={song.singersEnriched} onPersonClick={onPersonClick} />
                        {singers && lyricists && <span className="text-zinc-700 mx-1">·</span>}
                        {lyricists && (
                          <span className="text-zinc-600">
                            <NameLinks value={lyricists} enriched={song.lyricistEnriched} onPersonClick={onPersonClick} />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2.5 hidden md:table-cell">
                  <button
                    onClick={e => { e.stopPropagation(); onAlbumClick(song) }}
                    className="truncate max-w-[200px] hover:text-white hover:underline transition-colors text-left"
                  >
                    {song.album}
                  </button>
                </td>
                <td className="py-2.5 hidden lg:table-cell text-right pr-4 rounded-r-xl text-xs">
                  {song.length}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
