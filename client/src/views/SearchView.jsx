import { Search, Mic2, Disc3, Music, ListMusic, ChevronDown, Clock3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import MetaTags from '../components/MetaTags'
import TrackMenu from '../components/TrackMenu'
import ArtImage from '../components/ArtImage'
import { useSearch } from '../hooks/useApi'
import { decodeHtmlEntities, formatDuration, getImageSrc } from '../utils'

// Browse tiles on the search landing — quick genre/mood jumps, Spotify style
const BROWSE_TILES = [
  { label: 'Tamil Hits', query: 'tamil hits', classes: 'bg-gradient-to-br from-rose-500 to-orange-600' },
  { label: 'Melody', query: 'melody songs', classes: 'bg-gradient-to-br from-indigo-500 to-violet-700' },
  { label: 'Devotional', query: 'devotional', classes: 'bg-gradient-to-br from-amber-500 to-yellow-700' },
  { label: 'Party', query: 'party songs', classes: 'bg-gradient-to-br from-fuchsia-500 to-pink-700' },
  { label: 'Workout', query: 'workout songs', classes: 'bg-gradient-to-br from-emerald-500 to-teal-700' },
  { label: 'Retro Classics', query: 'old songs', classes: 'bg-gradient-to-br from-sky-500 to-blue-700' },
  { label: 'Focus', query: 'relaxing', classes: 'bg-gradient-to-br from-slate-500 to-zinc-700' },
  { label: 'A.R. Rahman', query: 'ar rahman', classes: 'bg-gradient-to-br from-red-500 to-rose-800' },
  { label: 'Anirudh', query: 'anirudh', classes: 'bg-gradient-to-br from-purple-500 to-indigo-800' },
]

export default function SearchView({ query, onSongClick, onAlbumClick, onArtistClick, showToast, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio }) {
  const navigate = useNavigate()
  const appUrl = import.meta.env.VITE_APP_URL
  const [visibleSongs, setVisibleSongs] = useState(5)
  const [visibleAlbums, setVisibleAlbums] = useState(4)
  const [visibleArtists, setVisibleArtists] = useState(5)
  const [visiblePlaylists, setVisiblePlaylists] = useState(5)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [debouncedQuery, setDebouncedQuery] = useState(query)
  const [recentSearches, setRecentSearches] = useState(() => {
    try { return JSON.parse(localStorage.getItem('recentSearches')) || [] } catch { return [] }
  })
  const [tab, setTab] = useState('all')

  // Debounce — query prop tracks the input live; the API only fires after
  // a 300ms pause instead of per keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300)
    return () => clearTimeout(t)
  }, [query])

  const recordSearch = (term) => {
    const q = term.trim()
    if (!q) return
    setRecentSearches(prev => {
      const next = [q, ...prev.filter(s => s.toLowerCase() !== q.toLowerCase())].slice(0, 8)
      try { localStorage.setItem('recentSearches', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }

  const clearRecents = () => {
    setRecentSearches([])
    try { localStorage.removeItem('recentSearches') } catch { /* ignore */ }
  }

  const runRecent = (term) => {
    navigate(`/search?q=${encodeURIComponent(term)}`)
  }

  // Handle responsive album and artist counts
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      setVisibleAlbums(mobile ? 4 : 12)
      setVisibleArtists(mobile ? 5 : 13)
    }

    window.addEventListener('resize', handleResize)
    handleResize() // Set initial value

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Use TanStack Query for search (debounced — input stays instant)
  const { data: onlineResults, isLoading: loading, error } = useSearch(debouncedQuery)


  if (!query.trim()) {
    return (
      <div className="p-4 md:p-8 w-full">
        <div className="flex flex-col items-center text-center py-8 w-full">
          <Search size={56} className="text-zinc-700 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Search Music</h2>
          <p className="text-sm text-zinc-500 mb-8">Find songs, albums, and artists online</p>
        </div>

        {recentSearches.length > 0 && (
          <div className="w-full max-w-md mx-auto mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Clock3 size={14} className="text-zinc-500" /> Recent searches
              </h3>
              <button
                onClick={clearRecents}
                className="text-xs text-zinc-500 hover:text-white transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {recentSearches.map(term => (
                <button
                  key={term}
                  onClick={() => runRecent(term)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/60 transition-colors text-left group"
                >
                  <Clock3 size={14} className="text-zinc-600 shrink-0" />
                  <span className="text-sm text-zinc-300 group-hover:text-white truncate flex-1">{term}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Browse tiles — Spotify-style landing */}
        <h3 className="text-sm font-semibold text-zinc-300 max-w-md mx-auto mb-3 px-1">Browse</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 max-w-md mx-auto gap-3">
          {BROWSE_TILES.map(({ label, query, classes }) => (
            <button
              key={label}
              onClick={() => runRecent(query)}
              className={`rounded-lg p-4 h-20 flex items-end text-left font-bold text-white/90 text-sm leading-tight transition-transform hover:scale-[1.03] active:scale-95 ${classes}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Determine if we have results
  const hasResults = onlineResults && (
    onlineResults.topResult ||
    onlineResults.songs?.length ||
    onlineResults.albums?.length ||
    onlineResults.artists?.length ||
    onlineResults.playlists?.length ||
    onlineResults.localAlbums?.length ||
    onlineResults.localSongs?.length
  )

  if (!loading && !hasResults && !error) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-zinc-400">
          No results for <span className="text-white font-medium">"{query}"</span>
        </p>
      </div>
    )
  }

    const metaTitle = query ? `Search results for "${query}"` : 'Search';

  return (
    <div className="p-4 md:p-8 pb-32">
      <MetaTags
        title={metaTitle}
        description={`Search for songs, albums, artists, and playlists on Torsongs.`}
        url={window.location.href}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          'url': appUrl,
          'potentialAction': {
            '@type': 'SearchAction',
            'target': `${appUrl}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-white">
          Results for <span className="text-zinc-400 font-normal">"{query}"</span>
        </h1>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {[['all', 'All'], ['songs', 'Songs'], ['albums', 'Albums'], ['artists', 'Artists'], ['playlists', 'Playlists']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${tab === key ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-zinc-400">Searching...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg mb-6">
          <p className="text-red-400">{error?.message || 'Search failed'}</p>
        </div>
      )}

      {/* Online Search Results */}
      {onlineResults && !loading && (
        <>
          {/* FROM YOUR LIBRARY — local collection matches ride on top */}
          {(tab === 'all' || tab === 'songs' || tab === 'albums') && (onlineResults.localAlbums?.length > 0 || onlineResults.localSongs?.length > 0) && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Disc3 size={18} className="text-[#fc3c44]" /> From your library
              </h2>
              {onlineResults.localAlbums?.length > 0 && (
                <div className="flex gap-3 md:gap-4 flex-wrap mb-4">
                  {onlineResults.localAlbums.map(album => (
                    <button
                      key={album.id}
                      onClick={() => navigate(`/library/album/${album.id}`)}
                      className="flex flex-col gap-2 group w-20 md:w-24"
                    >
                      <ArtImage
                        image={album.image}
                        alt={album.name}
                        className="w-20 md:w-24 h-20 md:h-24 rounded-xl"
                        imgClassName="group-hover:scale-105 transition-transform"
                        iconSize={24}
                        fallback={Disc3}
                      />
                      <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-left w-24 truncate leading-snug">
                        {decodeHtmlEntities(album.name)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {onlineResults.localSongs?.length > 0 && (
                <div className="flex flex-col gap-0.5">
                  {onlineResults.localSongs.map((song, index) => (
                    <div
                      key={song.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSongClick({ ...song, isLocal: true }, onlineResults.localSongs, index)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSongClick({ ...song, isLocal: true }, onlineResults.localSongs, index) } }}
                      className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors text-left w-full group cursor-pointer"
                    >
                      <ArtImage
                        image={song.image}
                        alt={song.name}
                        className="w-8 md:w-10 h-8 md:h-10 rounded-lg"
                        iconSize={14}
                        fallback={Music}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{decodeHtmlEntities(song.name)}</p>
                        <p className="text-xs text-zinc-500 truncate">{song.artist}{song.album ? ` · ${decodeHtmlEntities(song.album)}` : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* TOP RESULT */}
          {tab === 'all' && onlineResults.topResult && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Music size={18} className="text-[#fc3c44]" /> Top Result
              </h2>
              <button
                className="flex flex-col md:flex-row items-center md:items-start gap-4 p-4 bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors w-full group overflow-hidden"
                onClick={() => {
                  recordSearch(query)
                  if (onlineResults.topResult.type === 'song') {
                    onSongClick({
                      ...onlineResults.topResult,
                      isStream: true,
                      streamUrl: onlineResults.topResult.downloadUrl?.[0]?.url
                    })
                  } else if (onlineResults.topResult.type === 'album') {
                    onAlbumClick(onlineResults.topResult)
                  } else if (onlineResults.topResult.type === 'artist') {
                    onArtistClick?.(onlineResults.topResult)
                  } else if (onlineResults.topResult.type === 'playlist') {
                    navigate(`/discover/playlist/${onlineResults.topResult.id}`, { state: { playlist: onlineResults.topResult } })
                  }
                }}
              >
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-zinc-800 shadow flex-shrink-0">
                  <ArtImage
                    image={onlineResults.topResult.image}
                    alt={onlineResults.topResult.name}
                    className="w-16 h-16 md:w-20 md:h-20"
                    iconSize={24}
                    fallback={Music}
                  />
                </div>
                <div className="flex-1 min-w-0 text-left w-full">
                  <p className="text-base font-medium text-white truncate">
                    {decodeHtmlEntities(onlineResults.topResult.name)}
                  </p>
                  <p className="text-sm text-zinc-500 truncate">
                    {onlineResults.topResult.type === 'song'
                      ? `${onlineResults.topResult.artists?.primary?.map(a => a.name).join(', ')} · ${decodeHtmlEntities(onlineResults.topResult.album?.name)}`
                      : `${onlineResults.topResult.artists?.primary?.map(a => a.name).join(', ')} · ${onlineResults.topResult.year}`
                    }
                  </p>
                  <p className="text-xs text-zinc-600 mt-1 capitalize">
                    {onlineResults.topResult.type}
                  </p>
                </div>
              </button>
            </section>
          )}

          {/* SONGS */}
          {(tab === 'all' || tab === 'songs') && onlineResults?.songs?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Music size={18} className="text-[#fc3c44]" /> Songs
              </h2>
              <div className="flex flex-col gap-0.5">
                {onlineResults.songs.slice(0, visibleSongs).map((song, index) => (
                  <div
                    key={song.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      recordSearch(query)
                      onSongClick({
                        ...song
                      }, onlineResults.songs, index)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        recordSearch(query)
                        onSongClick({ ...song }, onlineResults.songs, index)
                      }
                    }}
                    className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors text-left w-full group cursor-pointer"
                  >
                    <ArtImage
                      image={song.image}
                      alt={song.name}
                      className="w-8 md:w-10 h-8 md:h-10 rounded-lg"
                      iconSize={14}
                      fallback={Music}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{decodeHtmlEntities(song.name)}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {song.artists?.primary?.map(a => a.name).join(', ')} · {decodeHtmlEntities(song.album?.name)}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500 flex-shrink-0">{formatDuration(song.duration)}</span>
                    <div onClick={e => e.stopPropagation()}>
                      <TrackMenu
                        song={song}
                        likedSongs={likedSongs}
                        onLikeToggle={onLikeToggle}
                        onPlayNext={onPlayNext}
                        onAddToQueue={onAddToQueue}
                        onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio}
                        showToast={showToast}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {onlineResults.songs.length > visibleSongs && (
                <button
                  onClick={() => setVisibleSongs(prev => Math.min(prev + 5, onlineResults.songs.length))}
                  className="mt-3 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  Load more
                  <ChevronDown size={16} />
                </button>
              )}
            </section>
          )}

          {/* ALBUMS */}
          {(tab === 'all' || tab === 'albums') && onlineResults?.albums?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Disc3 size={18} className="text-[#fc3c44]" /> Albums
              </h2>
              <div className="flex gap-3 md:gap-4 flex-wrap">
                {onlineResults.albums.slice(0, visibleAlbums).map(album => (
                  <button
                    key={album.id}
                    onClick={() => {
                      recordSearch(query)
                      const slug = (album.name || album.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      navigate(`/discover/album/${album.id}/${slug}`, { state: { album, albumName: album.name || album.title } });
                    }}
                    className="flex flex-col gap-2 group w-20 md:w-24"
                  >
                    <div className="w-20 md:w-24 h-20 md:h-24 rounded-xl overflow-hidden bg-zinc-800 shadow">
                      <ArtImage
                        image={album.image}
                        alt={album.name}
                        className="w-20 md:w-24 h-20 md:h-24 rounded-xl"
                        imgClassName="group-hover:scale-105 transition-transform"
                        iconSize={24}
                        fallback={Music}
                      />
                    </div>
                    <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-left w-24 truncate leading-snug">
                      {decodeHtmlEntities(album.name || album.title)}
                    </span>
                  </button>
                ))}
              </div>
              {onlineResults.albums.length > visibleAlbums && (
                <button
                  onClick={() => setVisibleAlbums(prev => Math.min(prev + (isMobile ? 4 : 12), onlineResults.albums.length))}
                  className="mt-3 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  Load more
                  <ChevronDown size={16} />
                </button>
              )}
            </section>
          )}

          {/* ARTISTS */}
          {(tab === 'all' || tab === 'artists') && onlineResults?.artists?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Mic2 size={18} className="text-[#fc3c44]" /> Artists
              </h2>
              <div className="flex gap-3 md:gap-5 flex-wrap">
                {onlineResults.artists.slice(0, visibleArtists).map(artist => (
                  <button
                    key={artist.id}
                    onClick={() => { recordSearch(query); onArtistClick(artist) }}
                    className="flex flex-col items-center gap-2 group w-16 md:w-20"
                  >
                    <div className="w-16 md:w-20 h-16 md:h-20 rounded-full overflow-hidden bg-zinc-800 shadow">
                      <ArtImage
                        image={artist.image}
                        alt={artist.name}
                        className="w-16 md:w-20 h-16 md:h-20 rounded-full"
                        imgClassName={`group-hover:scale-105 transition-transform ${getImageSrc(artist.image).includes('logo_512x512') ? 'object-contain p-3' : 'object-cover'}`}
                        iconSize={24}
                        fallback={Mic2}
                      />
                    </div>
                    <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-center leading-snug w-full truncate">
                      {decodeHtmlEntities(artist.name)}
                    </span>
                  </button>
                ))}
              </div>
              {onlineResults.artists.length > visibleArtists && (
                <button
                  onClick={() => setVisibleArtists(prev => Math.min(prev + (isMobile ? 5 : 13), onlineResults.artists.length))}
                  className="mt-3 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  Load more
                  <ChevronDown size={16} />
                </button>
              )}
            </section>
          )}

          {/* PLAYLISTS */}
          {(tab === 'all' || tab === 'playlists') && onlineResults?.playlists?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <ListMusic size={18} className="text-[#fc3c44]" /> Playlists
              </h2>
              <div className="flex gap-3 md:gap-4 flex-wrap">
                {onlineResults.playlists.slice(0, visiblePlaylists).map(playlist => (
                  <button
                    key={playlist.id}
                    onClick={() => { recordSearch(query); navigate(`/discover/playlist/${playlist.id}`, { state: { playlist } }) }}
                    className="flex flex-col gap-2 group w-20 md:w-24"
                  >
                    <div className="w-20 md:w-24 h-20 md:h-24 rounded-xl overflow-hidden bg-zinc-800 shadow">
                      <ArtImage
                        image={playlist.image}
                        alt={playlist.name}
                        className="w-20 md:w-24 h-20 md:h-24 rounded-xl"
                        imgClassName="group-hover:scale-105 transition-transform"
                        iconSize={24}
                        fallback={ListMusic}
                      />
                    </div>
                    <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-left w-24 truncate leading-snug">
                      {decodeHtmlEntities(playlist.name)}
                    </span>
                  </button>
                ))}
              </div>
              {onlineResults.playlists.length > visiblePlaylists && (
                <button
                  onClick={() => setVisiblePlaylists(prev => Math.min(prev + 5, onlineResults.playlists.length))}
                  className="mt-3 text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  Load more
                  <ChevronDown size={16} />
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
