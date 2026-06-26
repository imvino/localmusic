import { useState } from 'react'
import { Mic2 } from 'lucide-react'

const ROLE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'composer', label: 'Composers' },
  { id: 'singer', label: 'Singers' },
  { id: 'actor', label: 'Actors' },
  { id: 'director', label: 'Directors' },
  { id: 'lyricist', label: 'Lyricists' },
]

const ROLE_LABELS = {
  composer: 'Composer',
  singer: 'Singer',
  actor: 'Actor',
  director: 'Director',
  lyricist: 'Lyricist',
}

function ArtistCard({ artist, onClick }) {
  const roleTag = artist.roles?.length
    ? artist.roles.map(r => ROLE_LABELS[r] || r).join(', ')
    : ''

  return (
    <div onClick={onClick} className="group cursor-pointer flex flex-col items-center gap-3 p-3 rounded-2xl hover:bg-zinc-800/40 transition-colors">
      <div className="w-full aspect-square rounded-full overflow-hidden bg-zinc-800 shadow-xl">
        {artist.profileUrl ? (
          <img
            src={artist.profileUrl}
            alt={artist.name}
            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-700 to-zinc-900">
            <Mic2 size={36} className="text-zinc-500" />
          </div>
        )}
      </div>
      <div className="text-center w-full">
        <p className="text-sm font-semibold text-white group-hover:text-[#fc3c44] transition-colors truncate">{artist.name}</p>
        <p className="text-xs text-zinc-500">{roleTag || `${artist.songs.length} songs`}</p>
      </div>
    </div>
  )
}

export default function ArtistsView({ artists, onArtistClick }) {
  const [activeFilter, setActiveFilter] = useState('all')

  const filtered = activeFilter === 'all'
    ? artists
    : artists.filter(a => a.roles?.includes(activeFilter))

  return (
    <div className="p-8 pb-10">
      <h1 className="text-3xl font-black text-white mb-4">Artists</h1>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap mb-6">
        {ROLE_FILTERS.map(f => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeFilter === f.id
                ? 'bg-[#fc3c44] text-white'
                : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map(artist => (
          <ArtistCard key={artist.name} artist={artist} onClick={() => onArtistClick(artist)} />
        ))}
      </div>
    </div>
  )
}
