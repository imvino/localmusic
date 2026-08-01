import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Disc, Download, Loader2, ChevronDown } from 'lucide-react'
import { useDownloadStore } from '../stores/downloadStore'
import MetaTags from '../components/MetaTags'
import { getiTunesArtwork, decodeHtmlEntities, getArtistImageUrl } from '../utils'
import { useAlbum, useArtist, usePlaylist } from '../hooks/useApi'
import { queryClient } from '../App'
import { hasCustomAlbums, getAlbumsTabLabel, ARTIST_CONFIG } from '../artist-config'

const API_BASE = import.meta.env.VITE_API_URL
const isProduction = import.meta.env.MODE === 'production'

export default function DiscoverDetailView({ onSongClick, showToast, currentSong, isPlaying, sidebarOpen }) {
  const { id, slug } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { addDownload, updateDownload, removeDownload, getDownloadBySongId } = useDownloadStore()
  const downloads = useDownloadStore(state => state.downloads)
  const scrollPositionRef = useRef(0)
  const [downloading, setDownloading] = useState(null)
  const [downloadingAlbum, setDownloadingAlbum] = useState({}) // { albumId: boolean }
  const [activeTab, setActiveTab] = useState('songs')
  const [songsSortBy, setSongsSortBy] = useState('date')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [albumsLanguageFilter, setAlbumsLanguageFilter] = useState('all')
  const isAlbum = location.pathname.includes('/album/')
  const isArtist = location.pathname.includes('/artist/')
  const isPlaylist = location.pathname.includes('/playlist/')
  const hasCustomAlbumsOverride = isArtist && hasCustomAlbums(id)
  const artistConfig = ARTIST_CONFIG.customAlbums[id]
  const [albumsSortBy, setAlbumsSortBy] = useState('date')
  const [albumsSortDirection, setAlbumsSortDirection] = useState('desc')
  const [customAlbums, setCustomAlbums] = useState(null)
  const [apiAlbums, setApiAlbums] = useState(null)
  const [iTunesArtwork, setITunesArtwork] = useState(null)
  const meta = location.state?.[isAlbum ? 'album' : isArtist ? 'artist' : 'playlist']
  // Use slug from URL as album name, fallback to state
  const albumName = slug ? slug.replace(/-/g, ' ') : location.state?.albumName

  // Use TanStack Query hooks based on route type
  const { data: albumData, isLoading: albumLoading } = useAlbum(isAlbum ? id : null, albumName)
  const { data: artistData, isLoading: artistLoading } = useArtist(isArtist ? id : null, 50, 'all')
  const { data: playlistData, isLoading: playlistLoading } = usePlaylist(isPlaylist ? id : null)

  const data = albumData || artistData || playlistData
  const loading = albumLoading || artistLoading || playlistLoading

  // Process songs with imageUrl
  const rawSongs = data?.topSongs || data?.songs || []
  
  // Extract distinct languages from songs
  const distinctLanguages = useMemo(() => {
    const languages = new Set()
    rawSongs.forEach(song => {
      const lang = song.more_info?.language || song.language
      if (lang) {
        languages.add(lang)
      }
    })
    return Array.from(languages).sort()
  }, [rawSongs])
  
  // Filter songs by language
  const filteredSongs = rawSongs.filter(song => {
    if (languageFilter === 'all') return true
    const songLanguage = song.more_info?.language || song.language
    if (!songLanguage) return true
    return songLanguage.toLowerCase() === languageFilter.toLowerCase()
  })
  
  const songs = filteredSongs.map(song => ({
    ...song,
    imageUrl: song.image?.find(img => img.quality === '500x500')?.url ||
              song.image?.find(img => img.quality === '150x150')?.url
  }))
  // Use custom albums for artists with overrides in albums tab, otherwise use API albums
  const rawAlbums = hasCustomAlbumsOverride && activeTab === 'albums' ? (customAlbums || []) : (data?.topAlbums || [])
  
  // For Mix tab: filter API albums to exclude duplicates by ID with custom albums
  const customAlbumIds = useMemo(() => {
    if (!customAlbums) return new Set()
    return new Set(customAlbums.map(album => album.id))
  }, [customAlbums])
  
  const mixAlbums = useMemo(() => {
    if (!apiAlbums) return []
    return apiAlbums.filter(album => !customAlbumIds.has(album.id))
  }, [apiAlbums, customAlbumIds])
  
  // Use mixAlbums for Mix tab, otherwise use rawAlbums
  const displayAlbums = activeTab === 'mix' ? mixAlbums : rawAlbums
  
  // Extract distinct languages from albums
  const distinctAlbumLanguages = useMemo(() => {
    const languages = new Set()
    displayAlbums.forEach(album => {
      const lang = album.language
      if (lang) {
        languages.add(lang)
      }
    })
    return Array.from(languages).sort()
  }, [displayAlbums])
  
  // Filter albums by language
  const albums = displayAlbums.filter(album => {
    if (albumsLanguageFilter === 'all') return true
    const albumLanguage = album.language
    if (!albumLanguage) return true
    return albumLanguage.toLowerCase() === albumsLanguageFilter.toLowerCase()
  })

  // Save scroll position when component unmounts
  useEffect(() => {
    return () => {
      scrollPositionRef.current = window.scrollY
    }
  }, [])

  // Restore scroll position when loading completes
  useEffect(() => {
    if (!loading && scrollPositionRef.current > 0) {
      window.scrollTo(0, scrollPositionRef.current)
      scrollPositionRef.current = 0 // Reset after restoring
    }
  }, [loading, id])

  // Fetch iTunes artwork when data is loaded
  useEffect(() => {
    if (data && data.name) {
      const fetchArtwork = async () => {
        const artistName = isArtist ? data.name : (data.artists?.[0]?.name || data.artist?.name)
        const albumName = isAlbum ? data.name : (isPlaylist ? data.name : null)
        
        if (albumName || artistName) {
          const artwork = await getiTunesArtwork(albumName || artistName, artistName)
          setITunesArtwork(artwork)
        }
      }
      fetchArtwork()
    }
  }, [data, isAlbum, isArtist])

  // Load custom albums for artists with overrides
  useEffect(() => {
    if (hasCustomAlbumsOverride && artistConfig) {
      fetch(`${API_BASE}/api/composer-albums/${id}`)
        .then(res => res.json())
        .then(data => {
          // Transform custom albums to match API format, filtering out not-found albums
          const transformedAlbums = data.albums
            .filter(album => album.found)
            .map(album => ({
              id: album.id,
              name: album.title,
              year: album.year,
              image: album.image ? [{ quality: '150x150', url: album.image }] : [],
              songCount: album.songCount || 0,
              playCount: 0,
              isLocal: album.isLocal || false,
              totalTracks: album.totalTracks || null
            }))
          setCustomAlbums(transformedAlbums)
        })
        .catch(err => {
          console.error('Failed to load custom albums:', err)
        })
    }
  }, [hasCustomAlbumsOverride, id, artistConfig])

  // Store API albums separately for artists with custom overrides
  useEffect(() => {
    if (hasCustomAlbumsOverride && artistData?.topAlbums) {
      setApiAlbums(artistData.topAlbums)
    }
  }, [hasCustomAlbumsOverride, artistData])

  const handleDownload = async (song, e) => {
    e.stopPropagation()
    try {
      setDownloading(song.id)
      const res = await fetch(`${API_BASE}/api/download-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id })
      })
      const resp = await res.json()
      if (resp.success && resp.downloadId) {
        // Add to download store
        const albumDisplayName = (
          song.album?.name || (isAlbum ? (data?.name || meta?.name) : meta?.name) || resp?.albumName || 'Unknown Album'
        )
        addDownload(resp.downloadId, song.id, song.name, albumDisplayName)
        
        // Connect to SSE for progress updates
        const eventSource = new EventSource(`${API_BASE}/api/download-progress/${resp.downloadId}`)
        
        eventSource.onmessage = (event) => {
          const progress = JSON.parse(event.data)
          updateDownload(resp.downloadId, progress)

          if (progress.status === 'complete') {
            eventSource.close()
            
            // Invalidate queries to refresh local badge
            if (isAlbum) {
              queryClient.invalidateQueries({ queryKey: ['album', id] })
            } else if (isArtist) {
              queryClient.invalidateQueries({ queryKey: ['artist', id] })
            } else if (isPlaylist) {
              queryClient.invalidateQueries({ queryKey: ['playlist', id] })
            }
            
            // Clear progress after a delay
            setTimeout(() => {
              removeDownload(resp.downloadId)
              setDownloading(null)
            }, 2000)
          } else if (progress.status === 'error') {
            eventSource.close()
            setDownloading(null)
          }
        }

        eventSource.onerror = () => {
          eventSource.close()
          removeDownload(resp.downloadId)
          setDownloading(null)
        }
      } else {
        alert('Failed to download: ' + (resp.error || 'Unknown error'))
        setDownloading(null)
      }
    } catch (err) {
      console.error('Download error:', err)
      alert('Failed to download song')
      setDownloading(null)
    }
  }

  const handleDownloadAlbum = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation()
    if (e && e.preventDefault) e.preventDefault()
    if (!isAlbum) return;

    try {
      setDownloadingAlbum(prev => ({ ...prev, [id]: true }))
      const res = await fetch(`${API_BASE}/api/download-album`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ albumId: id })
      })
      const resp = await res.json()
      if (resp.success && resp.downloadId) {
        // Add to download store
        const albumDisplayName = (data?.name || meta?.name || 'Unknown')
        addDownload(resp.downloadId, id, `Album: ${albumDisplayName}`, albumDisplayName)
        
        // Connect to SSE for progress updates
        const eventSource = new EventSource(`${API_BASE}/api/download-progress/${resp.downloadId}`)

        eventSource.onmessage = (event) => {
          const progress = JSON.parse(event.data)
          updateDownload(resp.downloadId, progress)

          if (progress.status === 'complete') {
            eventSource.close()
            // Update local state to mark all songs as downloaded
            setSongs(prevSongs => 
              prevSongs.map(s => ({ ...s, isLocal: true }))
            )
            // Invalidate album cache to refresh local badge
            queryClient.invalidateQueries({ queryKey: ['album', id] })
            // Clear progress after a delay
            setTimeout(() => {
              removeDownload(resp.downloadId)
              setDownloadingAlbum(prev => {
                const newDownloading = { ...prev }
                delete newDownloading[id]
                return newDownloading
              })
            }, 2000)
          } else if (progress.status === 'error') {
            eventSource.close()
            setDownloadingAlbum(prev => {
              const newDownloading = { ...prev }
              delete newDownloading[id]
              return newDownloading
            })
          }
        }

        eventSource.onerror = () => {
          eventSource.close()
          removeDownload(resp.downloadId)
          setDownloadingAlbum(prev => {
            const newDownloading = { ...prev }
            delete newDownloading[id]
            return newDownloading
          })
        }
      } else {
        alert('Failed to start album download: ' + (resp.error || 'Unknown error'))
        setDownloadingAlbum(prev => {
          const newDownloading = { ...prev }
          delete newDownloading[id]
          return newDownloading
        })
      }
    } catch (err) {
      console.error('Download error:', err)
      alert('Failed to start album download')
      setDownloadingAlbum(prev => {
        const newDownloading = { ...prev }
        delete newDownloading[id]
        return newDownloading
      })
    }
  }

  const handlePlay = async (song, index) => {
    try {
      console.log('Fetching song details for:', song.id)
      // Fetch the song details to get the playable stream URL
      const res = await fetch(`${API_BASE}/api/song/${song.id}`)
      const result = await res.json()
      
      console.log('Song API response:', result)
      
      if (result.success && result.data) {
        // Try to use the stream URL if available
        if (result.data.streamUrl) {
          console.log('Playing with stream URL:', result.data.streamUrl)
          // Use the displayed songs order (songs) instead of sorted order for the queue
          const displayIndex = index !== undefined ? index : songs.findIndex(s => s.id === song.id)
          onSongClick({
            id: song.id,
            name: song.name,
            album: song.album?.name || meta?.name,
            albumId: result.data.albumId || song.album?.id || (isAlbum ? id : null),
            artist: song.artists?.primary?.[0]?.name,
            streamUrl: result.data.streamUrl,
            imageUrl: song.image?.find(img => img.quality === '500x500')?.url ||
                       song.image?.find(img => img.quality === '150x150')?.url,
            isStream: true
          }, songs, displayIndex)
        } else if (result.data.previewUrl) {
          console.log('Opening preview URL:', result.data.previewUrl)
          // Fallback: open preview page in new tab
          window.open(result.data.previewUrl, '_blank')
        } else {
          console.log('No stream URL or preview URL available')
          if (showToast) {
            showToast('Audio streaming not available. Please use the download button instead.', 'warning')
          }
        }
      } else {
        console.log('API returned error:', result)
        if (showToast) {
          showToast('Failed to load song. API rate limit exceeded.', 'error')
        }
      }
    } catch (err) {
      console.error('Failed to fetch song stream URL:', err)
      if (showToast) {
        showToast('Failed to load song. Please try again.', 'error')
      }
    }
  }

  // Sorting functions
  const sortSongs = (songsToSort, sortBy) => {
    const sorted = [...songsToSort]
    switch (sortBy) {
      case 'date':
        return sorted.sort((a, b) => (b.year || 0) - (a.year || 0))
      case 'name':
        return sorted.sort((a, b) => a.name.localeCompare(b.name))
      default:
        return sorted
    }
  }

  const sortAlbums = (albumsToSort, sortBy, direction = 'desc') => {
    const sorted = [...albumsToSort]
    
    switch (sortBy) {
      case 'date':
        return sorted.sort((a, b) => {
          // Treat "TBA" as newest (9999) for sorting
          const getYearValue = (year) => {
            if (year === 'TBA' || year === 'TBA') return 9999
            return parseInt(year) || 0
          }
          const diff = getYearValue(b.year) - getYearValue(a.year)
          return direction === 'asc' ? -diff : diff
        })
      case 'name':
        return sorted.sort((a, b) => {
          const comparison = a.name.localeCompare(b.name)
          return direction === 'asc' ? comparison : -comparison
        })
      default:
        return sorted
    }
  }

  const sortedSongs = sortSongs(songs, songsSortBy)
  const sortedAlbums = sortAlbums(albums, albumsSortBy, albumsSortDirection)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-zinc-500" size={32} />
      </div>
    )
  }

  const imageUrl = data?.image?.find(img => img.quality === '500x500')?.url ||
                   data?.image?.find(img => img.quality === '150x150')?.url ||
                   meta?.image?.find(img => img.quality === '500x500')?.url ||
                   meta?.image?.find(img => img.quality === '150x150')?.url

    const metaTitle = data?.name || meta?.name;
  const metaDescription = data?.description || `Listen to ${metaTitle} on Torsongs.`;
  const metaImage = iTunesArtwork || imageUrl;
  const metaUrl = window.location.href;
  const metaType = isAlbum ? 'music.album' : isArtist ? 'music.musician' : 'music.playlist';

  let structuredData = null;
  if (data) {
    if (isAlbum) {
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'MusicAlbum',
        'name': data.name,
        'byArtist': Array.isArray(data.artists) ? data.artists.map(a => ({ '@type': 'MusicGroup', 'name': a.name })) : (data.artists ? [{ '@type': 'MusicGroup', 'name': data.artists.name }] : []),
        'image': imageUrl,
        'numTracks': data.songCount,
        'track': {
          '@type': 'ItemList',
          'itemListElement': songs.map((song, index) => ({
            '@type': 'ListItem',
            'position': index + 1,
            'item': {
              '@type': 'MusicRecording',
              'name': song.name,
              'duration': `PT${Math.floor(song.duration / 60)}M${song.duration % 60}S`,
            }
          }))
        }
      };
    } else if (isArtist) {
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'MusicGroup',
        'name': data.name,
        'description': data.bio,
        'image': imageUrl,
      };
    } else if (isPlaylist) {
      structuredData = {
        '@context': 'https://schema.org',
        '@type': 'MusicPlaylist',
        'name': data.name,
        'numTracks': data.songCount,
        'image': imageUrl,
        'track': {
          '@type': 'ItemList',
          'itemListElement': songs.map((song, index) => ({
            '@type': 'ListItem',
            'position': index + 1,
            'item': {
              '@type': 'MusicRecording',
              'name': song.name,
              'duration': `PT${Math.floor(song.duration / 60)}M${song.duration % 60}S`,
            }
          }))
        }
      };
    }
  }

  return (
    <div className="p-4 md:p-8 pb-32">
      <MetaTags
        title={metaTitle}
        description={metaDescription}
        image={metaImage}
        url={metaUrl}
        type={metaType}
        structuredData={structuredData}
      />
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={20} />
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4 md:gap-6 mb-8">
        <div className="w-32 md:w-48 h-32 md:h-48 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0 shadow-lg">
          {imageUrl ? (
            <img src={imageUrl} alt={data?.name || meta?.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600">
              <Disc size={48} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 text-center md:text-left">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-white">{data?.name || meta?.name}</h1>
            
          </div>
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
          
          {isAlbum && !isProduction && (
            <button
              onClick={(e) => handleDownloadAlbum(e)}
              disabled={downloadingAlbum[id] || songs.length === 0}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full text-sm font-medium transition-colors disabled:opacity-50"
            >
              {(() => {
                const albumDl = Object.values(downloads).find(dl => dl.songId === id && dl.songName.startsWith('Album:'))
                return downloadingAlbum[id] && albumDl ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    {albumDl.currentSong && albumDl.totalSongs ? (
                      <span>{albumDl.currentSong}/{albumDl.totalSongs} songs ({albumDl.progress}%)</span>
                    ) : (
                      <span>{albumDl.progress}% - {albumDl.current}</span>
                    )}
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download Album
                  </>
                )
              })()}
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation - Only for artists */}
      {isArtist && (
        <div className="flex items-center gap-6 mb-6 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('songs')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'songs'
                ? 'text-white border-b-2 border-[#fc3c44]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Popular Songs
          </button>
          <button
            onClick={() => setActiveTab('albums')}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === 'albums'
                ? 'text-white border-b-2 border-[#fc3c44]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {getAlbumsTabLabel(id)}
          </button>
          {hasCustomAlbumsOverride && (
            <button
              onClick={() => setActiveTab('mix')}
              className={`pb-3 text-sm font-medium transition-colors ${
                activeTab === 'mix'
                  ? 'text-white border-b-2 border-[#fc3c44]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Mix Tap
            </button>
          )}
        </div>
      )}

      {/* Content based on tab or type */}
      {isArtist ? (
        <>
          {activeTab === 'songs' && (
            <div className="space-y-4">
              {/* Sort and Language Dropdowns */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-zinc-400 text-sm">{sortedSongs.length} songs</p>
                <div className="flex items-center gap-2">
                  {distinctLanguages.length > 0 && (
                    <div className="relative">
                      <select
                        value={languageFilter}
                        onChange={(e) => setLanguageFilter(e.target.value)}
                        className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                      >
                        <option value="all">All Languages</option>
                        {distinctLanguages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                  )}
                  <div className="relative">
                    <select
                      value={songsSortBy}
                      onChange={(e) => setSongsSortBy(e.target.value)}
                      className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                    >
                      <option value="date">Date</option>
                      <option value="name">Name</option>
                    </select>
                    <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Songs List */}
              <div className="space-y-2">
                {sortedSongs.map((song, index) => (
                  <div
                    key={song.id}
                    onClick={() => handlePlay(song, index)}
                    className={`flex items-center gap-4 p-3 rounded-lg transition-colors cursor-pointer group ${
                      currentSong?.id === song.id && isPlaying
                        ? 'bg-zinc-800/80 border border-[#fc3c44]/30'
                        : 'hover:bg-zinc-800/50'
                    }`}
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
                      <h3 className="text-white font-medium truncate">{decodeHtmlEntities(song.name)}</h3>
                      <p className="text-zinc-400 text-sm truncate">
                        {song.artists?.primary?.map((a, idx) => (
                          <span key={idx}>
                            {a.id ? (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    navigate(`/discover/artist/${a.id}`)
                                  }}
                                  className="hidden md:inline hover:text-[#fc3c44] hover:underline transition-colors"
                                >
                                  {a.name}
                                </button>
                                <span className="md:hidden">{a.name}</span>
                              </>
                            ) : (
                              <span>{a.name}</span>
                            )}
                            {idx < (song.artists?.primary?.length || 0) - 1 && ', '}
                          </span>
                        ))}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const dl = getDownloadBySongId(song.id)
                        return dl && dl.status !== 'complete' && (
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-zinc-700 rounded-full h-1.5">
                              <div 
                                className="bg-[#fc3c44] h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${dl.progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-zinc-400">{dl.progress}%</span>
                          </div>
                        )
                      })()}
                      {!isProduction && song.isLocal && (
                        <span className="hidden md:inline bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
                          LOCAL
                        </span>
                      )}
                      <div className="text-zinc-500 text-sm">{Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
                    </div>
                    {!isProduction && (
                    <button
                      onClick={(e) => handleDownload(song, e)}
                      disabled={downloading === song.id || getDownloadBySongId(song.id)?.status === 'downloading'}
                      className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-zinc-700 rounded-full disabled:opacity-50 text-zinc-400 hover:text-white"
                      title="Download 320kbps MP3"
                    >
                      {downloading === song.id || getDownloadBySongId(song.id)?.status === 'downloading' ? (
                        <Loader2 size={16} className="animate-spin text-[#fc3c44]" />
                      ) : (
                        <Download size={16} />
                      )}
                    </button>
                    )}
                  </div>
                ))}
              </div>

            </div>
          )}

          {activeTab === 'albums' && (
            <div className="space-y-4">
              {/* Sort and Language Dropdowns */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-zinc-400 text-sm">{sortedAlbums.length} albums</p>
                <div className="flex items-center gap-2">
                  {distinctAlbumLanguages.length > 0 && (
                    <div className="relative">
                      <select
                        value={albumsLanguageFilter}
                        onChange={(e) => setAlbumsLanguageFilter(e.target.value)}
                        className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                      >
                        <option value="all">All Languages</option>
                        {distinctAlbumLanguages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                  )}
                  <div className="relative">
                    <select
                      value={`${albumsSortBy}-${albumsSortDirection}`}
                      onChange={(e) => {
                        const [sortBy, direction] = e.target.value.split('-')
                        setAlbumsSortBy(sortBy)
                        setAlbumsSortDirection(direction)
                      }}
                      className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                    >
                      {hasCustomAlbumsOverride ? (
                        <>
                          <option value="date-desc">Date (Newest)</option>
                          <option value="date-asc">Date (Oldest)</option>
                          <option value="name-asc">Name (A-Z)</option>
                          <option value="name-desc">Name (Z-A)</option>
                        </>
                      ) : (
                        <>
                          <option value="date-desc">Date (Newest)</option>
                          <option value="date-asc">Date (Oldest)</option>
                          <option value="name-asc">Name (A-Z)</option>
                          <option value="name-desc">Name (Z-A)</option>
                        </>
                      )}
                    </select>
                    <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Albums Grid */}
              <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 ${sidebarOpen ? 'lg:grid-cols-6' : 'lg:grid-cols-8'}`}>
                {sortedAlbums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => {
                      const slug = (album.name || album.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      navigate(`/discover/album/${album.id}/${slug}`, { state: { album } });
                    }}
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
                      {!isProduction && album.isLocal && album.totalTracks && (
                        <div className={`hidden md:block absolute top-2 left-2 text-white text-xs px-2 py-1 rounded font-medium ${album.songCount === album.totalTracks ? 'bg-green-500' : 'bg-red-500'}`}>
                          {`${album.songCount}/${album.totalTracks}`}
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

          {activeTab === 'mix' && (
            <div className="space-y-4">
              {/* Sort and Language Dropdowns */}
              <div className="flex items-center justify-between gap-4">
                <p className="text-zinc-400 text-sm">{sortedAlbums.length} albums</p>
                <div className="flex items-center gap-2">
                  {distinctAlbumLanguages.length > 0 && (
                    <div className="relative">
                      <select
                        value={albumsLanguageFilter}
                        onChange={(e) => setAlbumsLanguageFilter(e.target.value)}
                        className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                      >
                        <option value="all">All Languages</option>
                        {distinctAlbumLanguages.map(lang => (
                          <option key={lang} value={lang}>{lang}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                    </div>
                  )}
                  <div className="relative">
                    <select
                      value={`${albumsSortBy}-${albumsSortDirection}`}
                      onChange={(e) => {
                        const [sortBy, direction] = e.target.value.split('-')
                        setAlbumsSortBy(sortBy)
                        setAlbumsSortDirection(direction)
                      }}
                      className="appearance-none bg-zinc-800 text-white text-sm px-4 py-2 pr-8 rounded-lg border border-zinc-700 focus:outline-none focus:border-zinc-600 cursor-pointer"
                    >
                      <>
                        <option value="date-desc">Date (Newest)</option>
                        <option value="date-asc">Date (Oldest)</option>
                        <option value="name-asc">Name (A-Z)</option>
                        <option value="name-desc">Name (Z-A)</option>
                      </>
                    </select>
                    <ChevronDown size={16} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Albums Grid */}
              <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 ${sidebarOpen ? 'lg:grid-cols-6' : 'lg:grid-cols-8'}`}>
                {sortedAlbums.map(album => (
                  <button
                    key={album.id}
                    onClick={() => {
                      const slug = (album.name || album.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                      navigate(`/discover/album/${album.id}/${slug}`, { state: { album } });
                    }}
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
              className={`flex items-center gap-4 p-3 rounded-lg transition-colors cursor-pointer group ${
                currentSong?.id === song.id && isPlaying
                  ? 'bg-zinc-800/80 border border-[#fc3c44]/30'
                  : 'hover:bg-zinc-800/50'
              }`}
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
                <h3 className="text-white font-medium truncate">{decodeHtmlEntities(song.name)}</h3>
                <p className="text-zinc-400 text-sm truncate">
                  {song.artists?.primary?.map((a, idx) => (
                    <span key={idx}>
                      {a.id ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/discover/artist/${a.id}`)
                            }}
                            className="hidden md:inline hover:text-[#fc3c44] hover:underline transition-colors"
                          >
                            {a.name}
                          </button>
                          <span className="md:hidden">{a.name}</span>
                        </>
                      ) : (
                        <span>{a.name}</span>
                      )}
                      {idx < (song.artists?.primary?.length || 0) - 1 && ', '}
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {(() => {
                  const dl = getDownloadBySongId(song.id)
                  return dl && dl.status !== 'complete' && (
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-zinc-700 rounded-full h-1.5">
                        <div 
                          className="bg-[#fc3c44] h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-zinc-400">{dl.progress}%</span>
                    </div>
                  )
                })()}
                {!isProduction && song.isLocal && (
                  <span className="hidden md:inline bg-green-500 text-white text-xs px-2 py-0.5 rounded font-medium">
                    LOCAL
                  </span>
                )}
                <div className="text-zinc-500 text-sm">{Math.floor(song.duration / 60)}:{(song.duration % 60).toString().padStart(2, '0')}</div>
              </div>
              {!isProduction && (
              <button
                onClick={(e) => handleDownload(song, e)}
                disabled={downloading === song.id || getDownloadBySongId(song.id)?.status === 'downloading'}
                className="hidden md:block opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-zinc-700 rounded-full disabled:opacity-50 text-zinc-400 hover:text-white"
                title="Download 320kbps MP3"
              >
                {downloading === song.id || getDownloadBySongId(song.id)?.status === 'downloading' ? (
                  <Loader2 size={16} className="animate-spin text-[#fc3c44]" />
                ) : (
                  <Download size={16} />
                )}
              </button>
              )}
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
