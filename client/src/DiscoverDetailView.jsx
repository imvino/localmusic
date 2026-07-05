import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Disc, Download, Loader2, ChevronDown } from 'lucide-react'

const API_BASE = '/api'

export default function DiscoverDetailView({ onSongClick, selectedLanguages }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [data, setData] = useState(null)
  const [songs, setSongs] = useState([])
  const [albums, setAlbums] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [downloadingAlbum, setDownloadingAlbum] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [songsSortBy, setSongsSortBy] = useState('popular')
  const [albumsSortBy, setAlbumsSortBy] = useState('popular')
  const isAlbum = location.pathname.includes('/album/')
  const isArtist = location.pathname.includes('/artist/')
  const isPlaylist = location.pathname.includes('/playlist/')
  const meta = location.state?.[isAlbum ? 'album' : isArtist ? 'artist' : 'playlist']

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        let endpoint
        if (isAlbum) {
          endpoint = `${API_BASE}/album/${id}`
        } else if (isArtist) {
          const langParam = selectedLanguages && selectedLanguages.length > 0 ? selectedLanguages.join(',') : 'all'
          endpoint = `${API_BASE}/artist/${id}?limit=50&language=${langParam}`
        } else {
          endpoint = `${API_BASE}/playlist/${id}`
        }
        const res = await fetch(endpoint)
        const result = await res.json()

        if (result.success) {
          setData(result.data)
          // For artists, songs are in topSongs or songs array
          setSongs(result.data.topSongs || result.data.songs || [])
          setAlbums(result.data.topAlbums || [])
        } else {
          setError('Failed to load data')
        }
      } catch (err) {
        console.error('Fetch error:', err)
        setError('Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, isAlbum, isArtist, selectedLanguages])

  const handleDownload = async (song, e) => {
    e.stopPropagation()
    try {
      setDownloading(song.id)
      const res = await fetch(`${API_BASE}/download-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id })
      })
      const data = await res.json()
      if (data.success) {
        alert(`Song downloaded successfully! Saved as: ${data.filename}`)
      } else {
        alert('Failed to download: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('Download error:', err)
      alert('Failed to download song')
    } finally {
      setDownloading(null)
    }
  }

  const handleDownloadAlbum = async () => {
    if (!isAlbum) return;
    
    try {
      setDownloadingAlbum(true)
      const res = await fetch(`${API_BASE}/download-album`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: id })
      })
      const data = await res.json()
      if (data.success) {
        alert('Album download started in background. Check terminal for progress.')
      } else {
        alert('Failed to start album download: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('Download error:', err)
      alert('Failed to start album download')
    } finally {
      // Keep it showing as downloading for a bit since it's in background
      setTimeout(() => setDownloadingAlbum(false), 5000)
    }
  }

  const handlePlay = (song) => {
    if (onSongClick && song.downloadUrl) {
      const streamUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url ||
                       song.downloadUrl?.find(d => d.quality === '160kbps')?.url
      if (streamUrl) {
        onSongClick({
          id: song.id,
          name: song.name,
          album: song.album?.name || meta?.name,
          artist: song.artists?.primary?.[0]?.name,
          streamUrl: streamUrl,
          imageUrl: song.image?.find(img => img.quality === '500x500')?.url ||
                     song.image?.find(img => img.quality === '150x150')?.url
        })
      }
    }
  }

  // Sorting functions
  const sortSongs = (songsToSort, sortBy) => {
    const sorted = [...songsToSort]
    switch (sortBy) {
      case 'popular':
        return sorted.sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      case 'date':
        return sorted.sort((a, b) => (b.year || 0) - (a.year || 0))
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      default:
        return sorted
    }
  }

  const sortAlbums = (albumsToSort, sortBy) => {
    const sorted = [...albumsToSort]
    switch (sortBy) {
      case 'popular':
        return sorted.sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      case 'date':
        return sorted.sort((a, b) => (b.year || 0) - (a.year || 0))
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      default:
        return sorted
    }
  }

  const sortedSongs = sortSongs(songs, songsSortBy)
  const sortedAlbums = sortAlbums(albums, albumsSortBy)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-zinc-500" size={32} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-zinc-500">{error}</p>
      </div>
    )
  }

  const imageUrl = data?.image?.find(img => img.quality === '500x500')?.url ||
                   data?.image?.find(img => img.quality === '150x150')?.url ||
                   meta?.image?.find(img => img.quality === '500x500')?.url ||
                   meta?.image?.find(img => img.quality === '150x150')?.url

  return (
    <div className="p-8 pb-32">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={20} />
        Back
      </button>

      {/* Header */}
      <div className="flex items-center gap-6 mb-8">
        <div className="w-48 h-48 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 shadow-lg">
          {imageUrl ? (
            <img src={imageUrl} alt={data?.name || meta?.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Disc size={48} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-white mb-2">{data?.name || meta?.name}</h1>
          <p className="text-zinc-400 mb-2">{isAlbum ? 'Album' : isArtist ? 'Artist' : 'Playlist'}</p>
          
          {isAlbum && (
            <>
              {data?.artists && data.artists.length > 0 && (
                <p className="text-zinc-300 text-sm mb-1">
                  {data.artists.map((a, idx) => (
                    <span key={idx}>
                      {a.id ? (
                        <button
                          onClick={() => navigate(`/discover/artist/${a.id}`)}
                          className="hover:text-[#fc3c44] hover:underline transition-colors"
                        >
                          {a.name}
                        </button>
                      ) : (
                        <span>{a.name}</span>
                      )}
                      {idx < data.artists.length - 1 && ', '}
                    </span>
                  ))}
                </p>
              )}
              {data?.composers && data.composers.length > 0 && (
                <p className="text-zinc-400 text-sm mb-1">
                  Composer: {data.composers.map((c, idx) => (
                    <span key={idx}>
                      {c.id ? (
                        <button
                          onClick={() => navigate(`/discover/artist/${c.id}`)}
                          className="hover:text-[#fc3c44] hover:underline transition-colors"
                        >
                          {c.name || c}
                        </button>
                      ) : (
                        <span>{c.name || c}</span>
                      )}
                      {idx < data.composers.length - 1 && ', '}
                    </span>
                  ))}
                </p>
              )}
              <div className="flex items-center gap-4 text-zinc-500 text-sm mb-2">
                {data?.year && <span>{data.year}</span>}
                {data?.songCount && <span>{data.songCount} songs</span>}
                {data?.totalDuration && (
                  <span>{Math.floor(data.totalDuration / 60)}:{(data.totalDuration % 60).toString().padStart(2, '0')}</span>
                )}
                {data?.playCount && data.playCount > 0 && (
                  <span>{data.playCount.toLocaleString()} plays</span>
                )}
              </div>
              {data?.copyright && (
                <p className="text-zinc-600 text-xs mb-4">{data.copyright}</p>
              )}
            </>
          )}
          
          {data?.description && <p className="text-zinc-500 text-sm line-clamp-2">{data.description}</p>}
          
          {isAlbum && (
            <button
              onClick={handleDownloadAlbum}
              disabled={downloadingAlbum || songs.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full text-sm font-medium transition-colors disabled:opacity-50"
            >
              {downloadingAlbum ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Download Album
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation - Only for artists */}
      {isArtist && (
        <div className="flex items-center gap-6 mb-6 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'overview'
                ? 'text-white border-b-2 border-[#fc3c44]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('songs')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'songs'
                ? 'text-white border-b-2 border-[#fc3c44]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Songs
          </button>
          <button
            onClick={() => setActiveTab('albums')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'albums'
                ? 'text-white border-b-2 border-[#fc3c44]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Albums
          </button>
        </div>
      )}

      {/* Content based on tab or type */}
      {isArtist ? (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top 10 Songs */}
              <section>
                <h2 className="text-lg font-bold text-white mb-4">Top 10 Songs</h2>
                <div className="space-y-2">
                  {songs.slice(0, 10).map((song, index) => (
                    <div
                      key={song.id}
                      onClick={() => handlePlay(song)}
                      className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                    >
                      <span className="text-zinc-500 w-6 text-center">{index + 1}</span>
                      <div className="w-12 h-12 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
                        {song.image?.[0]?.url ? (
                          <img src={song.image[0].url} alt={song.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-zinc-600">
                            <Disc size={16} />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">{song.name}</h3>
                        <p className="text-zinc-400 text-sm truncate">
                          {song.artists?.primary?.map((a, idx) => (
                            <span key={idx}>
                              {a.id ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/discover/artist/${a.id}`)
                                  }}
                                  className="hover:text-[#fc3c44] hover:underline transition-colors"
                                >
                                  {a.name}
                                </button>
                              ) : (
                                <span>{a.name}</span>
                              )}
                              {idx < (song.artists?.primary?.length || 0) - 1 && ', '}
                            </span>
                          ))}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {song.isLocal && (
                          <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
                            LOCAL
                          </span>
                        )}
                        <div className="text-zinc-500 text-sm">{Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
                      </div>
                      <button
                        onClick={(e) => handleDownload(song, e)}
                        disabled={downloading === song.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-zinc-700 rounded-full disabled:opacity-50 text-zinc-400 hover:text-white"
                        title="Download 320kbps MP3"
                      >
                        {downloading === song.id ? (
                          <Loader2 size={16} className="animate-spin text-[#fc3c44]" />
                        ) : (
                          <Download size={16} />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Artist Bio */}
              {data?.bio && (
                <section>
                  <h2 className="text-lg font-bold text-white mb-4">About</h2>
                  <p className="text-zinc-400 text-sm leading-relaxed">{data.bio}</p>
                </section>
              )}

              {/* Similar Artists */}
              {data?.similarArtists && data.similarArtists.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-white mb-4">Similar Artists</h2>
                  <div className="flex gap-4 flex-wrap">
                    {data.similarArtists.slice(0, 8).map(artist => (
                      <button
                        key={artist.id}
                        onClick={() => navigate(`/discover/artist/${artist.id}`)}
                        className="flex flex-col items-center gap-2 group w-20"
                      >
                        <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 shadow">
                          {artist.image?.[0]?.url ? (
                            <img
                              src={artist.image[0].url}
                              alt={artist.name}
                              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Disc size={24} className="text-zinc-500" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-zinc-300 group-hover:text-white transition-colors text-center leading-snug w-full truncate">
                          {artist.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === 'songs' && (
            <div className="space-y-4">
              {/* Sort Dropdown */}
              <div className="flex items-center justify-between">
                <p className="text-zinc-400 text-sm">{sortedSongs.length} songs</p>
                <div className="relative">
                  <select
                    value={songsSortBy}
                    onChange={(e) => setSongsSortBy(e.target.value)}
                    className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                  >
                    <option value="popular">Popular</option>
                    <option value="date">Date</option>
                    <option value="name">Name</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* Songs List */}
              <div className="space-y-2">
                {sortedSongs.map((song, index) => (
                  <div
                    key={song.id}
                    onClick={() => handlePlay(song)}
                    className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer group"
                  >
                    <span className="text-zinc-500 w-6 text-center">{index + 1}</span>
                    <div className="w-12 h-12 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
                      {song.image?.[0]?.url ? (
                        <img src={song.image[0].url} alt={song.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-600">
                          <Disc size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium truncate">{song.name}</h3>
                      <p className="text-zinc-400 text-sm truncate">
                        {song.artists?.primary?.map((a, idx) => (
                          <span key={idx}>
                            {a.id ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate(`/discover/artist/${a.id}`)
                                }}
                                className="hover:text-[#fc3c44] hover:underline transition-colors"
                              >
                                {a.name}
                              </button>
                            ) : (
                              <span>{a.name}</span>
                            )}
                            {idx < (song.artists?.primary?.length || 0) - 1 && ', '}
                          </span>
                        ))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {song.isLocal && (
                        <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
                          LOCAL
                        </span>
                      )}
                      <div className="text-zinc-500 text-sm">{Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
                    </div>
                    <button
                      onClick={(e) => handleDownload(song, e)}
                      disabled={downloading === song.id}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-zinc-700 rounded-full disabled:opacity-50 text-zinc-400 hover:text-white"
                      title="Download 320kbps MP3"
                    >
                      {downloading === song.id ? (
                        <Loader2 size={16} className="animate-spin text-[#fc3c44]" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                  </div>
                ))}
              </div>

            </div>
          )}

          {activeTab === 'albums' && (
            <div className="space-y-4">
              {/* Sort Dropdown */}
              <div className="flex items-center justify-between">
                <p className="text-zinc-400 text-sm">{sortedAlbums.length} albums</p>
                <div className="relative">
                  <select
                    value={albumsSortBy}
                    onChange={(e) => setAlbumsSortBy(e.target.value)}
                    className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                  >
                    <option value="popular">Popular</option>
                    <option value="date">Date</option>
                    <option value="name">Name</option>
                  </select>
                  <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* Albums Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {sortedAlbums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => navigate(`/discover/album/${album.id}`, { state: { album } })}
                    className="flex flex-col gap-2 group"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow relative">
                      {album.image?.[0]?.url ? (
                        <img
                          src={album.image[0].url}
                          alt={album.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc size={32} className="text-zinc-600" />
                        </div>
                      )}
                      {album.isLocal && (
                        <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded font-medium">
                          LOCAL
                        </div>
                      )}
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-medium text-white truncate">{album.name}</h3>
                      <p className="text-xs text-zinc-500">{album.year}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Original songs list for albums and playlists */
        <div className="space-y-2">
          {songs.map((song, index) => (
            <div
              key={song.id}
              onClick={() => handlePlay(song)}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-zinc-800/50 transition-colors cursor-pointer group"
            >
              <span className="text-zinc-500 w-6 text-center">{index + 1}</span>
              <div className="w-12 h-12 rounded overflow-hidden bg-zinc-800 flex-shrink-0">
                {song.image?.[0]?.url ? (
                  <img src={song.image[0].url} alt={song.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600">
                    <Disc size={16} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-medium truncate">{song.name}</h3>
                <p className="text-zinc-400 text-sm truncate">
                  {song.artists?.primary?.map((a, idx) => (
                    <span key={idx}>
                      {a.id ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/discover/artist/${a.id}`)
                          }}
                          className="hover:text-[#fc3c44] hover:underline transition-colors"
                        >
                          {a.name}
                        </button>
                      ) : (
                        <span>{a.name}</span>
                      )}
                      {idx < (song.artists?.primary?.length || 0) - 1 && ', '}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {song.isLocal && (
                  <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
                    LOCAL
                  </span>
                )}
                <div className="text-zinc-500 text-sm">{Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
              </div>
              <button
                onClick={(e) => handleDownload(song, e)}
                disabled={downloading === song.id}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-zinc-700 rounded-full disabled:opacity-50 text-zinc-400 hover:text-white"
                title="Download 320kbps MP3"
              >
                {downloading === song.id ? (
                  <Loader2 size={16} className="animate-spin text-[#fc3c44]" />
                ) : (
                  <Download size={16} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {songs.length === 0 && (
        <p className="text-zinc-500 text-center py-8">No songs found</p>
      )}
    </div>
  )
}
