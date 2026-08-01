import { useState, useEffect } from 'react'
import { Disc, ListMusic, Loader2, Download, Play } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import MetaTags from '../components/MetaTags'
import HorizontalScroll from '../components/HorizontalScroll'
import { getiTunesArtwork, decodeHtmlEntities } from '../utils'
import { useJioFooterDetails, useJioFeaturedPlaylists, useJioNewReleases } from '../hooks/useApi'

const API_BASE = import.meta.env.VITE_API_URL
const isProduction = import.meta.env.MODE === 'production'

// Helper to format play counts
function formatPlayCount(count) {
  const num = parseInt(count) || 0
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return num.toString()
}

export default function DiscoverView({ onSongClick }) {
  const navigate = useNavigate()
  const [downloadProgress, setDownloadProgress] = useState({})
  const [iTunesArtwork, setITunesArtwork] = useState(null)
  const appUrl = import.meta.env.VITE_APP_URL

  // Fetch JioSaavn data
  const { data: footerData, isLoading: footerLoading } = useJioFooterDetails()
  const { data: featuredPlaylistsData, isLoading: playlistsLoading } = useJioFeaturedPlaylists()
  const { data: newReleasesData, isLoading: songsLoading } = useJioNewReleases()

  const loading = footerLoading || playlistsLoading || songsLoading

  // Process top artists
  const topArtists = (footerData?.artist || []).slice(0, 6).map(artist => ({
    id: artist.id,
    name: artist.title,
    image: artist.image || '',
    views: '0'
  }))

  // Process top playlists from footer
  const topPlaylists = (footerData?.playlist || []).slice(0, 15).map(playlist => ({
    id: playlist.id,
    name: playlist.title,
    image: playlist.image || '',
    songCount: 0
  }))

  // Process featured playlists
  const featuredPlaylists = (featuredPlaylistsData || []).slice(0, 10).map(playlist => ({
    id: playlist.id,
    name: playlist.title,
    image: playlist.image || '',
    songCount: playlist.more_info?.song_count || 0
  }))

  // Process new releases (songs)
  const newSongs = (newReleasesData || []).slice(0, 10).map(song => ({
    id: song.id,
    name: decodeHtmlEntities(song.title),
    artist: decodeHtmlEntities(song.subtitle || ''),
    album: decodeHtmlEntities(song.more_info?.album || ''),
    image: song.image || '',
    playCount: song.play_count || 0,
    type: song.type
  }))

  // Fetch iTunes artwork
  useEffect(() => {
    if (newSongs.length > 0) {
      getiTunesArtwork(newSongs[0].name, newSongs[0].artist).then(setITunesArtwork)
    }
  }, [newSongs])

  const handleArtistClick = (artist) => {
    navigate(`/discover/artist/${artist.id}`, { state: { artist } })
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

  return (
    <div className="p-4 md:p-8 pb-32">
      <MetaTags
        title="Discover Tamil Music"
        description="Discover the latest and trending Tamil music, new releases, featured playlists, and top artists on Torsongs."
        image={iTunesArtwork}
        url={window.location.href}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          'url': appUrl,
          'name': 'Torsongs',
          'potentialAction': {
            '@type': 'SearchAction',
            'target': `${appUrl}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />
      <h1 className="text-2xl font-bold text-white mb-8">Discover Music</h1>

      {/* Top Artists */}
      <HorizontalScroll
        title="Top Artists"
        items={topArtists}
        renderItem={(artist) => (
          <ArtistCard artist={artist} onArtistClick={handleArtistClick} />
        )}
        emptyMessage="No top artists found"
      />

      {/* Top Songs */}
      <HorizontalScroll
        title="Top Songs"
        items={newSongs}
        renderItem={(song, index) => (
          <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} />
        )}
        emptyMessage="No top songs found"
      />

      {/* Featured Playlists */}
      <HorizontalScroll
        title="Featured Playlists"
        icon={ListMusic}
        items={featuredPlaylists}
        renderItem={(playlist) => (
          <PlaylistCard playlist={playlist} onPlaylistClick={handlePlaylistClick} />
        )}
        emptyMessage="No featured playlists found"
      />

      {/* Top Playlists */}
      <HorizontalScroll
        title="Top Playlists"
        icon={ListMusic}
        items={topPlaylists}
        renderItem={(playlist) => (
          <PlaylistCard playlist={playlist} onPlaylistClick={handlePlaylistClick} />
        )}
        emptyMessage="No top playlists found"
      />
    </div>
  )
}

function ArtistCard({ artist, onArtistClick }) {
  const handleClick = () => {
    if (onArtistClick) {
      onArtistClick(artist)
    }
  }

  return (
    <div onClick={handleClick} className="flex flex-col items-center gap-3 w-20 md:w-24 cursor-pointer group">
      <div className="w-20 md:w-24 h-20 md:h-24 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0 shadow-lg">
        {artist.image ? (
          <img src={artist.image} alt={artist.name} className={`w-full h-full group-hover:scale-105 transition-transform ${artist.image.includes('logo_512x512') ? 'object-contain p-4' : 'object-cover'}`} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Disc size={32} />
          </div>
        )}
      </div>
      <div className="text-center w-full">
        <h3 className="text-xs font-medium text-white truncate group-hover:text-[#fc3c44] transition-colors">{artist.name}</h3>
      </div>
    </div>
  )
}

function SongCard({ song, onSongClick, downloadProgress }) {
  const imageUrl = song.image || ''
  const progress = downloadProgress?.[song.id]

  const handlePlay = async () => {
    try {
      // Fetch the song details to get the playable stream URL
      const res = await fetch(`${API_BASE}/api/song/${song.id}`)
      const result = await res.json()
      
      if (result.success && result.data) {
        if (result.data.streamUrl) {
          // Create a song object with the stream URL
          const songWithStream = {
            id: song.id,
            name: song.name,
            artist: song.artist,
            album: song.album,
            albumId: result.data.albumId || song.albumId,
            streamUrl: result.data.streamUrl,
            imageUrl: imageUrl,
            isStream: true
          }
          // Call the parent's onSongClick directly with the song object
          // This bypasses the DiscoverView's handleSongClick wrapper
          if (onSongClick) {
            onSongClick(songWithStream)
          }
        } else {
          console.log('No stream URL available for song:', song.id)
        }
      }
    } catch (err) {
      console.error('Failed to fetch song stream URL:', err)
    }
  }

  const handleDownload = async (e) => {
    e.stopPropagation()
    try {
      const res = await fetch(`${API_BASE}/api/download-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ songId: song.id })
      })
      const data = await res.json()
      if (data.success && data.downloadId) {
        const eventSource = new EventSource(`${API_BASE}/api/download-progress/${data.downloadId}`)
        
        eventSource.onmessage = (event) => {
          const progress = JSON.parse(event.data)
          setDownloadProgress(prev => ({
            ...prev,
            [song.id]: progress
          }))

          if (progress.status === 'complete') {
            eventSource.close()
            setTimeout(() => {
              setDownloadProgress(prev => {
                const newProgress = { ...prev }
                delete newProgress[song.id]
                return newProgress
              })
            }, 2000)
          } else if (progress.status === 'error') {
            eventSource.close()
          }
        }

        eventSource.onerror = () => {
          eventSource.close()
        }
      }
    } catch (err) {
      console.error('Download error:', err)
    }
  }

  return (
    <div className="w-32 md:w-40 flex-shrink-0 bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800 relative group">
        {imageUrl ? (
          <img src={imageUrl} alt={song.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Disc size={32} />
          </div>
        )}
        {progress && progress.status !== 'complete' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-4">
            <div className="w-full mb-2">
              <div className="w-full bg-zinc-700 rounded-full h-2">
                <div 
                  className="bg-[#fc3c44] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
            <p className="text-white text-xs text-center">{progress.progress}%</p>
          </div>
        )}
        <div className={`absolute inset-0 bg-black/50 transition-opacity flex items-center justify-center gap-2 ${progress ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={handlePlay}
            className="rounded-full p-2 bg-[#fc3c44] hover:bg-[#e6353d] text-white transition-colors cursor-pointer"
            title="Play"
          >
            <Play size={16} fill="currentColor" />
          </button>
          {!isProduction && (
          <button
            onClick={handleDownload}
            className="rounded-full p-2 bg-zinc-700 hover:bg-zinc-600 text-white transition-colors cursor-pointer"
            title="Download"
          >
            {progress?.status === 'downloading' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          </button>
          )}
        </div>
      </div>
      <h3 className="text-xs font-medium text-white truncate">{decodeHtmlEntities(song.name)}</h3>
      <p className="text-xs text-zinc-400 truncate">{song.artist}</p>
      <p className="text-xs text-zinc-500 mt-1">{formatPlayCount(song.playCount)} plays</p>
    </div>
  )
}

function PlaylistCard({ playlist, onPlaylistClick }) {
  const imageUrl = playlist.image || ''

  const handleClick = () => {
    if (onPlaylistClick) {
      onPlaylistClick(playlist)
    }
  }

  return (
    <div onClick={handleClick} className="w-32 md:w-40 flex-shrink-0 bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt={playlist.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <ListMusic size={32} />
          </div>
        )}
      </div>
      <h3 className="text-xs font-medium text-white truncate">{playlist.name}</h3>
      <p className="text-xs text-zinc-400 truncate">{playlist.songCount ? `${playlist.songCount} songs` : 'Playlist'}</p>
    </div>
  )
}
