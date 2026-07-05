import { useState, useEffect } from 'react'
import { TrendingUp, Disc, ListMusic, BarChart3, Loader2, Plus, Download } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const API_BASE = '/api'

export default function DiscoverView({ onSongClick, selectedLanguages }) {
  const navigate = useNavigate()
  const [trending, setTrending] = useState([])
  const [newReleases, setNewReleases] = useState([])
  const [featuredPlaylists, setFeaturedPlaylists] = useState([])
  const [charts, setCharts] = useState([])
  const [youtubeTrending, setYoutubeTrending] = useState([])
  const [spotifyTrending, setSpotifyTrending] = useState([])
  const [trendingLimit, setTrendingLimit] = useState(10)
  const [newReleasesLimit, setNewReleasesLimit] = useState(10)
  const [featuredLimit, setFeaturedLimit] = useState(10)
  const [chartsLimit, setChartsLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(null)
  const [error, setError] = useState(null)

  const getLanguageParam = () => {
    return selectedLanguages.length > 0 ? selectedLanguages.join(',') : 'tamil'
  }

  const fetchData = async (limitOverride = null) => {
    try {
      setLoading(true)
      const tLimit = limitOverride?.trending || trendingLimit
      const nrLimit = limitOverride?.newReleases || newReleasesLimit
      const fLimit = limitOverride?.featured || featuredLimit
      const cLimit = limitOverride?.charts || chartsLimit
      const langParam = getLanguageParam()

      const [trendingRes, newReleasesRes, featuredRes, chartsRes, youtubeRes, spotifyRes] = await Promise.all([
        fetch(`${API_BASE}/trending?language=${langParam}&limit=${tLimit}`),
        fetch(`${API_BASE}/new-releases?language=${langParam}&limit=${nrLimit}`),
        fetch(`${API_BASE}/featured-playlists?language=${langParam}&limit=${fLimit}`),
        fetch(`${API_BASE}/charts?language=${langParam}&limit=${cLimit}`),
        fetch(`${API_BASE}/trending-youtube?limit=20`),
        fetch(`${API_BASE}/trending-spotify?limit=20`)
      ])

      const [trendingData, newReleasesData, featuredData, chartsData, youtubeData, spotifyData] = await Promise.all([
        trendingRes.json(),
        newReleasesRes.json(),
        featuredRes.json(),
        chartsRes.json(),
        youtubeRes.json(),
        spotifyRes.json()
      ])

      setTrending(trendingData.data || [])
      setNewReleases(newReleasesData.data || [])
      setFeaturedPlaylists(featuredData.data || [])
      setCharts(chartsData.data || [])
      setYoutubeTrending(youtubeData.data || [])
      setSpotifyTrending(spotifyData.data || [])
    } catch (err) {
      console.error('Failed to fetch discovery data:', err)
      setError('Failed to load discovery data')
    } finally {
      setLoading(false)
    }
  }

  const fetchSection = async (section, newLimit) => {
    try {
      setLoadingMore(section)
      const langParam = getLanguageParam()
      let endpoint = ''
      if (section === 'trending') endpoint = `${API_BASE}/trending?language=${langParam}&limit=${newLimit}`
      else if (section === 'newReleases') endpoint = `${API_BASE}/new-releases?language=${langParam}&limit=${newLimit}`
      else if (section === 'featured') endpoint = `${API_BASE}/featured-playlists?language=${langParam}&limit=${newLimit}`
      else if (section === 'charts') endpoint = `${API_BASE}/charts?language=${langParam}&limit=${newLimit}`

      const res = await fetch(endpoint)
      const data = await res.json()

      if (section === 'trending') setTrending(data.data || [])
      else if (section === 'newReleases') setNewReleases(data.data || [])
      else if (section === 'featured') setFeaturedPlaylists(data.data || [])
      else if (section === 'charts') setCharts(data.data || [])
    } catch (err) {
      console.error(`Failed to load more ${section}:`, err)
    } finally {
      setLoadingMore(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedLanguages])

  const handleLoadMore = async (section) => {
    let newLimit
    if (section === 'trending') {
      newLimit = trendingLimit + 10
      setTrendingLimit(newLimit)
    } else if (section === 'newReleases') {
      newLimit = newReleasesLimit + 10
      setNewReleasesLimit(newLimit)
    } else if (section === 'featured') {
      newLimit = featuredLimit + 10
      setFeaturedLimit(newLimit)
    } else if (section === 'charts') {
      newLimit = chartsLimit + 10
      setChartsLimit(newLimit)
    }
    await fetchSection(section, newLimit)
  }

  const handleAlbumClick = (album) => {
    navigate(`/discover/album/${album.id}`, { state: { album } })
  }

  const handlePlaylistClick = (playlist) => {
    navigate(`/discover/playlist/${playlist.id}`, { state: { playlist } })
  }

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

  return (
    <div className="p-8 pb-32">
      <h1 className="text-2xl font-bold text-white mb-6">
        {selectedLanguages.length > 0 
          ? `Discover ${selectedLanguages.map(code => code.charAt(0).toUpperCase() + code.slice(1)).join(', ')} Music`
          : 'Discover Tamil Music'}
      </h1>

      {/* YouTube Trending Tamil */}
      <Section
        title="YouTube Trending Tamil"
        icon={TrendingUp}
        items={youtubeTrending}
        renderItem={(item) => (
          <SongCard song={item} onSongClick={onSongClick} />
        )}
        emptyMessage="No YouTube trending songs found"
      />

      {/* Spotify Trending Tamil */}
      <Section
        title="Spotify Trending Tamil"
        icon={TrendingUp}
        items={spotifyTrending}
        renderItem={(item) => (
          <SongCard song={item} onSongClick={onSongClick} />
        )}
        emptyMessage="No Spotify trending songs found"
      />

      {/* New Tamil Songs */}
      <Section
        title="New Tamil Songs"
        icon={TrendingUp}
        items={trending}
        renderItem={(item) => (
          <SongCard song={item} onSongClick={onSongClick} />
        )}
        emptyMessage="No new songs found"
        onLoadMore={() => handleLoadMore('trending')}
        loadingMore={loadingMore === 'trending'}
        hasMore={trending.length >= trendingLimit}
      />

      {/* Top Music Charts */}
      <Section
        title="Top Music Charts"
        icon={BarChart3}
        items={charts}
        renderItem={(item) => (
          <PlaylistCard playlist={item} onPlaylistClick={handlePlaylistClick} />
        )}
        emptyMessage="No charts found"
        onLoadMore={() => handleLoadMore('charts')}
        loadingMore={loadingMore === 'charts'}
        hasMore={charts.length >= chartsLimit}
      />

      {/* Tamil Music Playlists */}
      <Section
        title="Tamil Music Playlists"
        icon={ListMusic}
        items={featuredPlaylists}
        renderItem={(item) => (
          <PlaylistCard playlist={item} onPlaylistClick={handlePlaylistClick} />
        )}
        emptyMessage="No playlists found"
        onLoadMore={() => handleLoadMore('featured')}
        loadingMore={loadingMore === 'featured'}
        hasMore={featuredPlaylists.length >= featuredLimit}
      />
    </div>
  )
}

function Section({ title, icon: Icon, items, renderItem, emptyMessage, onLoadMore, loadingMore, hasMore }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon size={20} className="text-[#fc3c44]" />
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>
        {items.length > 0 && hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Load more
          </button>
        )}
      </div>
      {items.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {items.map((item, index) => (
            <div key={item.id || index}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-zinc-500 text-sm">{emptyMessage}</p>
      )}
    </div>
  )
}

function SongCard({ song, onSongClick }) {
  const imageUrl = song.image?.find(img => img.quality === '500x500')?.url ||
                   song.image?.find(img => img.quality === '150x150')?.url ||
                   song.youtubeThumbnail

  const isAvailable = song.availableOnJioSaavn !== false
  const isLocal = song.isLocal === true

  const handlePlay = () => {
    if (!isAvailable) {
      alert('This song is not available on JioSaavn')
      return
    }
    if (onSongClick && song.downloadUrl) {
      const streamUrl = song.downloadUrl?.find(d => d.quality === '320kbps')?.url ||
                       song.downloadUrl?.find(d => d.quality === '160kbps')?.url
      if (streamUrl) {
        onSongClick({
          id: song.id,
          name: song.name,
          album: song.album?.name,
          artist: song.artists?.primary?.[0]?.name,
          streamUrl: streamUrl,
          imageUrl: imageUrl
        })
      }
    }
  }

  const handleDownload = async (e) => {
    e.stopPropagation()
    if (!isAvailable) {
      alert('This song is not available on JioSaavn')
      return
    }
    try {
      const res = await fetch(`${API_BASE}/download-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id })
      })
      const data = await res.json()
      if (data.success) {
        alert('Song downloaded successfully!')
      } else {
        alert('Failed to download: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('Download error:', err)
      alert('Failed to download song')
    }
  }

  return (
    <div className="bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800 relative group">
        {imageUrl ? (
          <img src={imageUrl} alt={song.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Disc size={32} />
          </div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <button
            onClick={handlePlay}
            disabled={!isAvailable}
            className={`rounded-full p-2 transition-colors ${isAvailable ? 'bg-[#fc3c44] hover:bg-[#e6353d] text-white' : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'}`}
            title={isAvailable ? 'Play' : 'Not available on JioSaavn'}
          >
            <Disc size={20} />
          </button>
          <button
            onClick={handleDownload}
            disabled={!isAvailable}
            className={`rounded-full p-2 transition-colors ${isAvailable ? 'bg-zinc-700 hover:bg-zinc-600 text-white' : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'}`}
            title={isAvailable ? 'Download' : 'Not available on JioSaavn'}
          >
            <Download size={20} />
          </button>
        </div>
        {!isAvailable && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded">
            Not on JioSaavn
          </div>
        )}
        {isLocal && (
          <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded font-medium">
            LOCAL
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-white truncate">{song.name}</h3>
      <p className="text-xs text-zinc-400 truncate">{song.artists?.primary?.[0]?.name || song.youtubeArtist || song.album?.name}</p>
    </div>
  )
}

function AlbumCard({ album, onAlbumClick }) {
  const imageUrl = album.image?.find(img => img.quality === '500x500')?.url ||
                   album.image?.find(img => img.quality === '150x150')?.url

  const handleClick = () => {
    if (onAlbumClick) {
      onAlbumClick(album)
    }
  }

  return (
    <div onClick={handleClick} className="bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt={album.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Disc size={32} />
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-white truncate">{album.name}</h3>
      <p className="text-xs text-zinc-400 truncate">{album.year || album.artist}</p>
    </div>
  )
}

function PlaylistCard({ playlist, onPlaylistClick }) {
  const imageUrl = playlist.image?.find(img => img.quality === '500x500')?.url ||
                   playlist.image?.find(img => img.quality === '150x150')?.url

  const handleClick = () => {
    if (onPlaylistClick) {
      onPlaylistClick(playlist)
    }
  }

  return (
    <div onClick={handleClick} className="bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt={playlist.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <ListMusic size={32} />
          </div>
        )}
      </div>
      <h3 className="text-sm font-medium text-white truncate">{playlist.name}</h3>
      <p className="text-xs text-zinc-400 truncate">{playlist.songCount ? `${playlist.songCount} songs` : 'Playlist'}</p>
    </div>
  )
}
