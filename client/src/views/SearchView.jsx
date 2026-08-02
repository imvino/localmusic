import { Search, Mic2, Disc3, Music, ListMusic, ChevronDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import MetaTags from '../components/MetaTags'
import { useSearch } from '../hooks/useApi'
import { decodeHtmlEntities, getBestImageUrl, getArtistImageUrl, formatDuration } from '../utils'

export default function SearchView({ query, onSongClick, onAlbumClick, onArtistClick }) {
  const navigate = useNavigate()
  const appUrl = import.meta.env.VITE_APP_URL
  const [visibleSongs, setVisibleSongs] = useState(5)
  const [visibleAlbums, setVisibleAlbums] = useState(4)
  const [visibleArtists, setVisibleArtists] = useState(5)
  const [visiblePlaylists, setVisiblePlaylists] = useState(5)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

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

  // Use TanStack Query for search
  const { data: onlineResults, isLoading: loading, error } = useSearch(query)


  if (!query.trim()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <Search size={56} className="text-zinc-700 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Search Music</h2>
        <p className="text-sm text-zinc-500">Find songs, albums, and artists online</p>
      </div>
    )
  }

  // Determine if we have results
  const hasOnlineResults = onlineResults && (
    onlineResults.topResult ||
    onlineResults.songs?.length ||
    onlineResults.albums?.length ||
    onlineResults.artists?.length ||
    onlineResults.playlists?.length
  )

  if (!loading && !hasOnlineResults && !error) {
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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">
          Results for <span className="text-zinc-400 font-normal">"{query}"</span>
        </h1>
      </div>

      {loading && (
        <div className="flex items-center justify-center min-h-[40vh]">
          <p className="text-zinc-400">Searching...</p>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Online Search Results */}
      {onlineResults && !loading && (
        <>
          {/* TOP RESULT */}
          {onlineResults.topResult && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Music size={18} className="text-[#fc3c44]" /> Top Result
              </h2>
              <button
                className="flex flex-col md:flex-row items-center md:items-start gap-4 p-4 bg-zinc-900 rounded-xl hover:bg-zinc-800 transition-colors w-full group overflow-hidden"
                onClick={() => {
                  if (onlineResults.topResult.type === 'song') {
                    onSongClick({
                      ...onlineResults.topResult,
                      isStream: true,
                      streamUrl: onlineResults.topResult.downloadUrl?.[0]?.url
                    })
                  } else if (onlineResults.topResult.type === 'album') {
                    onAlbumClick(onlineResults.topResult)
                  }
                }}
              >
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-zinc-800 shadow flex-shrink-0">
                  {getBestImageUrl(onlineResults.topResult.image) ? (
                    <img
                      src={getBestImageUrl(onlineResults.topResult.image)}
                      alt={onlineResults.topResult.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music size={24} className="text-zinc-600" />
                    </div>
                  )}
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
          {onlineResults?.songs?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Music size={18} className="text-[#fc3c44]" /> Songs
              </h2>
              <div className="flex flex-col gap-0.5">
                {onlineResults.songs.slice(0, visibleSongs).map((song, index) => (
                  <button
                    key={song.id}
                    onClick={() => onSongClick({
                      ...song
                    }, onlineResults.songs, index)}
                    className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 md:py-2.5 rounded-xl hover:bg-zinc-800/60 transition-colors text-left w-full group"
                  >
                    {getBestImageUrl(song.image) ? (
                      <img
                        src={getBestImageUrl(song.image)}
                        alt={song.name}
                        className="w-8 md:w-10 h-8 md:h-10 rounded-lg object-cover shadow flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 md:w-10 h-8 md:h-10 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                        <Music size={14} className="text-zinc-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{decodeHtmlEntities(song.name)}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {song.artists?.primary?.map(a => a.name).join(', ')} · {decodeHtmlEntities(song.album?.name)}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-500 flex-shrink-0">{formatDuration(song.duration)}</span>
                  </button>
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
          {onlineResults?.albums?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Disc3 size={18} className="text-[#fc3c44]" /> Albums
              </h2>
              <div className="flex gap-3 md:gap-4 flex-wrap">
                {onlineResults.albums.slice(0, visibleAlbums).map(album => (
                  <button
                    key={album.id}
                    onClick={() => {
                      const slug = (album.name || album.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      navigate(`/discover/album/${album.id}/${slug}`, { state: { album, albumName: album.name || album.title } });
                    }}
                    className="flex flex-col gap-2 group w-20 md:w-24"
                  >
                    <div className="w-20 md:w-24 h-20 md:h-24 rounded-xl overflow-hidden bg-zinc-800 shadow">
                      {getBestImageUrl(album.image) ? (
                        <img
                          src={getBestImageUrl(album.image)}
                          alt={album.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={24} className="text-zinc-600" />
                        </div>
                      )}
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
          {onlineResults?.artists?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <Mic2 size={18} className="text-[#fc3c44]" /> Artists
              </h2>
              <div className="flex gap-3 md:gap-5 flex-wrap">
                {onlineResults.artists.slice(0, visibleArtists).map(artist => (
                  <button
                    key={artist.id}
                    onClick={() => onArtistClick(artist)}
                    className="flex flex-col items-center gap-2 group w-16 md:w-20"
                  >
                    <div className="w-16 md:w-20 h-16 md:h-20 rounded-full overflow-hidden bg-zinc-800 shadow">
                      {getArtistImageUrl(artist.image) ? (
                        <img
                          src={getArtistImageUrl(artist.image)}
                          alt={artist.name}
                          className={`w-full h-full group-hover:scale-105 transition-transform ${getArtistImageUrl(artist.image).includes('logo_512x512') ? 'object-contain p-3' : 'object-cover'}`}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Mic2 size={24} className="text-zinc-500" />
                        </div>
                      )}
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
          {onlineResults?.playlists?.length > 0 && (
            <section className="mb-8">
              <h2 className="flex items-center gap-2 text-lg font-bold text-white mb-4">
                <ListMusic size={18} className="text-[#fc3c44]" /> Playlists
              </h2>
              <div className="flex gap-3 md:gap-4 flex-wrap">
                {onlineResults.playlists.slice(0, visiblePlaylists).map(playlist => (
                  <button
                    key={playlist.id}
                    onClick={() => navigate(`/discover/playlist/${playlist.id}`, { state: { playlist } })}
                    className="flex flex-col gap-2 group w-20 md:w-24"
                  >
                    <div className="w-20 md:w-24 h-20 md:h-24 rounded-xl overflow-hidden bg-zinc-800 shadow">
                      {getBestImageUrl(playlist.image) ? (
                        <img
                          src={getBestImageUrl(playlist.image)}
                          alt={playlist.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ListMusic size={24} className="text-zinc-600" />
                        </div>
                      )}
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
