import { useState, useEffect, useMemo } from 'react'
import { Disc, ListMusic, Loader2, Download, Play, History, TrendingUp, UserCheck, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import MetaTags from '../components/MetaTags'
import HorizontalScroll from '../components/HorizontalScroll'
import TrackMenu from '../components/TrackMenu'
import { decodeHtmlEntities, getBestImageUrl, getImageSrc } from '../utils'
import { normalizeArtistName } from '../utils/sync'
import { useJioFeaturedPlaylists, useJioNewReleases, useCharts, useTrending, useNewReleaseAlbums, useSongSuggestions } from '../hooks/useApi'
import { useArtistConfig } from '../artist-config'
import { useAppAuth } from '../components/AuthGate'

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

export default function DiscoverView({ onSongClick, showToast, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, contentLanguages }) {
  const navigate = useNavigate()
  const [downloadProgress, setDownloadProgress] = useState({})
  const appUrl = import.meta.env.VITE_APP_URL
  // Personalization is a member feature — guests get generic editorial rails
  // only (charts/new releases/artists), like Spotify's logged-out browse.
  const { isSignedIn } = useAppAuth()

  // Content-language preference (Settings → Content languages): rails whose
  // items carry a `language` field keep only matching items; items without
  // a language stay (can't be classified). Empty pref = no filtering.
  const langPrefs = useMemo(() => new Set((contentLanguages || []).map(l => l.toLowerCase())), [contentLanguages])
  const matchLang = (item) => {
    if (!langPrefs.size) return true
    const l = (item?.language || item?.more_info?.language || '').toLowerCase()
    return !l || langPrefs.has(l)
  }

  // Recently played from local play history (unique songs, newest first)
  const [recentlyPlayed] = useState(() => {
    try {
      const history = JSON.parse(localStorage.getItem('playHistory') || '[]')
      const seen = new Set()
      return history.filter(s => !seen.has(s.id) && seen.add(s.id)).slice(0, 15)
    } catch { return [] }
  })

  // Spotify-style "Made for you" mixes — pure play-history math, no server.
  // playCounts (durable map, survives the history cap, counts repeats) is
  // the source; playHistory is the fallback for entries predating it.
  const mixes = useState(() => {
    try {
      const pc = (() => { try { return JSON.parse(localStorage.getItem('playCounts') || '{}') } catch { return {} } })()
      const counts = new Map()
      const oldest = new Map()
      for (const [id, e] of Object.entries(pc)) {
        if (!e?.id) continue
        counts.set(id, { ...e, count: e.count || 1 })
      }
      const raw = JSON.parse(localStorage.getItem('playHistory') || '[]')
      for (const s of raw) {
        if (!s?.id) continue
        if (!counts.has(s.id)) counts.set(s.id, { ...s, count: 0 })
        const e = counts.get(s.id)
        if (!pc[s.id]) e.count++ // pre-playCounts entries still count
        if (!oldest.has(s.id) || (s.ts || 0) < oldest.get(s.id)) oldest.set(s.id, s.ts || 0)
      }
      const onRepeat = [...counts.values()].filter(e => e.count >= 2)
        .sort((a, b) => b.count - a.count).slice(0, 15)
      const rewindCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
      const rewind = [...counts.values()].filter(e => oldest.get(e.id) < rewindCutoff)
        .sort((a, b) => b.count - a.count).slice(0, 15)
      return { onRepeat, rewind }
    } catch { return { onRepeat: [], rewind: [] } }
  })[0]

  // Fetch artist config and JioSaavn data
  const { config: artistConfig, loading: configLoading } = useArtistConfig()
  const { data: featuredPlaylistsData, isLoading: playlistsLoading } = useJioFeaturedPlaylists()
  const { data: newReleasesData, isLoading: songsLoading } = useJioNewReleases()
  const { data: charts } = useCharts()
  const { data: trending } = useTrending()
  const { data: newAlbums } = useNewReleaseAlbums()

  // "Because you listened to X" — suggestions seeded by the most recent play
  const seedSong = isSignedIn ? recentlyPlayed[0] : null
  const { data: becauseYouListened } = useSongSuggestions(seedSong?.id)

  // "New from artists you follow" — trending items carry `artists` as an
  // array of {name} objects; match normalized names against the synced
  // followedArtists localStorage list (featured-artist noise accepted).
  const followedRail = useMemo(() => {
    if (!isSignedIn || !trending?.length) return []
    try {
      const followed = JSON.parse(localStorage.getItem('followedArtists') || '[]')
      const names = new Set(followed.map(a => normalizeArtistName(a?.name)).filter(Boolean))
      if (!names.size) return []
      return trending.filter(item =>
        (item.artists || []).some(a => names.has(normalizeArtistName(typeof a === 'object' ? a?.name : a)))
      ).slice(0, 15)
    } catch { return [] }
  }, [isSignedIn, trending])

  // Daily mixes — cluster playCounts by normalized artist → top-3 by total
  // count. Each mix seeds from the user's OWN top-played songs for that
  // artist, then tops up via ONE suggestions call per mix (never the heavy
  // /api/artist/:id endpoint). Cache keyed by date → refreshes daily.
  const mixClusters = useMemo(() => {
    if (!isSignedIn) return []
    try {
      const pc = JSON.parse(localStorage.getItem('playCounts') || '{}')
      const byArtist = new Map()
      for (const e of Object.values(pc)) {
        if (!e?.id || !e.artist) continue
        const key = normalizeArtistName(e.artist)
        if (!key) continue
        if (!byArtist.has(key)) byArtist.set(key, { name: e.artist, songs: [], total: 0 })
        const c = byArtist.get(key)
        c.songs.push(e)
        c.total += e.count || 1
      }
      return [...byArtist.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .map(c => ({ name: c.name, seeds: c.songs.sort((x, y) => (y.count || 0) - (x.count || 0)).slice(0, 10) }))
    } catch { return [] }
  }, [isSignedIn])

  const mixSeedIds = mixClusters.map(m => m.seeds[0]?.id).filter(Boolean)
  const { data: mixSuggestions } = useQuery({
    queryKey: ['daily-mixes', new Date().toISOString().slice(0, 10), mixSeedIds.join(',')],
    queryFn: async () => {
      const out = {}
      for (const id of mixSeedIds.slice(0, 3)) {
        try {
          const res = await fetch(`${API_BASE}/api/songs/${id}/suggestions`)
          const json = await res.json()
          out[id] = json?.success ? (json.data || []) : []
        } catch { out[id] = [] }
      }
      return out
    },
    enabled: isSignedIn && mixSeedIds.length > 0,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1
  })

  const dailyMixes = mixClusters.map((cluster, i) => {
    const seen = new Set(cluster.seeds.map(s => s.id))
    const fill = (mixSuggestions?.[cluster.seeds[0]?.id] || [])
      .filter(s => s?.id && !seen.has(s.id) && seen.add(s.id))
      .slice(0, Math.max(0, 20 - cluster.seeds.length))
    return {
      title: `Daily Mix ${i + 1} — ${cluster.name}`,
      songs: [...cluster.seeds, ...fill]
    }
  }).filter(m => m.songs.length > 0)

  const loading = configLoading || playlistsLoading || songsLoading

  // Process top artists from config
  const artistIds = Object.keys(artistConfig.customAlbums || {})
  const topArtists = artistIds.map(artistId => {
    const artistInfo = artistConfig.customAlbums[artistId]
    return {
      id: artistId,
      name: artistInfo.name,
      image: artistInfo.image || '',
      views: '0'
    }
  })

  // Process featured playlists
  const featuredPlaylists = (featuredPlaylistsData || []).slice(0, 10).map(playlist => ({
    id: playlist.id,
    name: playlist.title,
    image: playlist.image || '',
    songCount: playlist.more_info?.song_count || 0
  }))

  // Process new releases (songs) — language-filtered before slicing so a
  // pref for e.g. Telugu doesn't just empty a Tamil-heavy rail
  const newSongs = (newReleasesData || []).filter(matchLang).slice(0, 10).map(song => ({
    id: song.id,
    name: decodeHtmlEntities(song.title),
    artist: decodeHtmlEntities(song.subtitle || ''),
    album: decodeHtmlEntities(song.more_info?.album || ''),
    image: getImageSrc(song.image),
    playCount: song.play_count || 0,
    type: song.type
  }))


  const handleArtistClick = (artist) => {
    navigate(`/discover/artist/${artist.id}`, { state: { artist } })
  }

  const handlePlaylistClick = (playlist) => {
    navigate(`/discover/playlist/${playlist.id}`, { state: { playlist } })
  }

  const handleAlbumClick = (album) => {
    const slug = (album.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    navigate(`/discover/album/${album.id}/${slug}`, { state: { albumName: album.name } })
  }

  const handleEntityClick = (item) => {
    if (item.type === 'playlist' || item.songCount !== undefined) handlePlaylistClick(item)
    else handleAlbumClick(item)
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 pb-32">
        <div className="h-8 w-48 bg-zinc-800 rounded-md animate-pulse mb-8" />
        {[0, 1, 2].map(rail => (
          <div key={rail} className="mb-8">
            <div className="h-5 w-36 bg-zinc-800 rounded animate-pulse mb-4" />
            <div className="flex gap-4 overflow-hidden">
              {[0, 1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="w-32 md:w-40 flex-shrink-0 bg-zinc-900/50 rounded-lg p-3">
                  <div className="aspect-square rounded-md bg-zinc-800 animate-pulse mb-3" />
                  <div className="h-3 w-4/5 bg-zinc-800 rounded animate-pulse mb-2" />
                  <div className="h-3 w-3/5 bg-zinc-800 rounded animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 pb-32">
      <MetaTags
        title="Discover Tamil Music"
        description="Discover the latest and trending Tamil music, new releases, featured playlists, and top artists on Torsongs."
        image={newSongs[0]?.image || ''}
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

      {/* Recently Played — member-only personalization */}
      {isSignedIn && recentlyPlayed.length > 0 && (
        <HorizontalScroll
          title="Recently Played"
          icon={History}
          items={recentlyPlayed}
          renderItem={(song) => (
            <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* Because you listened — personalized suggestions from play history */}
      {isSignedIn && becauseYouListened?.length > 0 && seedSong && (
        <HorizontalScroll
          title={`Because you listened to ${decodeHtmlEntities(seedSong.name || '')}`}
          icon={History}
          items={becauseYouListened.slice(0, 15)}
          renderItem={(song) => (
            <SongCard song={{ ...song, name: decodeHtmlEntities(song.name || song.title || ''), artist: decodeHtmlEntities(song.artists?.primary?.[0]?.name || song.artist || ''), image: song.image }} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* On Repeat — your most-played songs */}
      {isSignedIn && mixes.onRepeat.length > 0 && (
        <HorizontalScroll
          title="On Repeat"
          icon={TrendingUp}
          items={mixes.onRepeat}
          renderItem={(song) => (
            <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* Repeat Rewind — old favorites resurfaced */}
      {isSignedIn && mixes.rewind.length > 0 && (
        <HorizontalScroll
          title="Repeat Rewind"
          icon={History}
          items={mixes.rewind}
          renderItem={(song) => (
            <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* New from artists you follow — member-only personalized rail */}
      {isSignedIn && followedRail.length > 0 && (
        <HorizontalScroll
          title="New from artists you follow"
          icon={UserCheck}
          items={followedRail}
          renderItem={(album) => (
            <EntityCard item={album} onClick={() => handleAlbumClick(album)} subtitle={album.year || 'Album'} />
          )}
          emptyMessage=""
        />
      )}

      {/* Daily Mixes — artist-clustered from your own play counts */}
      {isSignedIn && dailyMixes.map(mix => (
        <HorizontalScroll
          key={mix.title}
          title={mix.title}
          icon={Sparkles}
          items={mix.songs}
          renderItem={(song) => (
            <SongCard song={{ ...song, name: decodeHtmlEntities(song.name || song.title || ''), artist: decodeHtmlEntities(song.artists?.primary?.[0]?.name || song.artist || ''), image: song.image }} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} showToast={showToast} />
          )}
          emptyMessage=""
        />
      ))}

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
          <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} showToast={showToast} />
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

      {/* Charts (editorial playlists) */}
      {charts?.length > 0 && (
        <HorizontalScroll
          title="Charts"
          icon={ListMusic}
          items={charts.filter(matchLang)}
          renderItem={(chart) => (
            <EntityCard item={chart} onClick={() => handleEntityClick(chart)} subtitle={chart.songCount ? `${chart.songCount} songs` : 'Chart'} />
          )}
          emptyMessage=""
        />
      )}

      {/* Trending albums */}
      {trending?.length > 0 && (
        <HorizontalScroll
          title="Trending Albums"
          items={trending.filter(matchLang)}
          renderItem={(album) => (
            <EntityCard item={album} onClick={() => handleAlbumClick(album)} subtitle={album.year || 'Album'} />
          )}
          emptyMessage=""
        />
      )}

      {/* New release albums */}
      {newAlbums?.length > 0 && (
        <HorizontalScroll
          title="New Releases"
          items={newAlbums.filter(matchLang)}
          renderItem={(album) => (
            <EntityCard item={album} onClick={() => handleAlbumClick(album)} subtitle={album.year || 'Album'} />
          )}
          emptyMessage=""
        />
      )}
    </div>
  )
}

function EntityCard({ item, onClick, subtitle }) {
  const imageUrl = getImageSrc(item.image)
  const [failed, setFailed] = useState(false)
  return (
    <div onClick={onClick} className="w-32 md:w-40 flex-shrink-0 bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800">
        {imageUrl && !failed ? (
          <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-600">
            <Disc size={32} />
          </div>
        )}
      </div>
      <h3 className="text-xs font-medium text-white truncate">{decodeHtmlEntities(item.name)}</h3>
      <p className="text-xs text-zinc-400 truncate">{subtitle}</p>
    </div>
  )
}

function ArtistCard({ artist, onArtistClick }) {
  const handleClick = () => {
    if (onArtistClick) {
      onArtistClick(artist)
    }
  }

  const imageUrl = getImageSrc(artist.image)
  const [failed, setFailed] = useState(false)

  return (
    <div onClick={handleClick} className="flex flex-col items-center gap-3 w-20 md:w-24 cursor-pointer group">
      <div className="w-20 md:w-24 h-20 md:h-24 rounded-full overflow-hidden bg-zinc-800 flex-shrink-0 shadow-lg">
        {imageUrl && !failed ? (
          <img src={imageUrl} alt={artist.name} className={`w-full h-full group-hover:scale-105 transition-transform ${imageUrl.includes('logo_512x512') ? 'object-contain p-4' : 'object-cover'}`} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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

function SongCard({ song, onSongClick, downloadProgress, setDownloadProgress, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, showToast }) {
  const imageUrl = getImageSrc(song.image) || getImageSrc(song.imageUrl)
  const [failed, setFailed] = useState(false)
  const progress = downloadProgress?.[song.id]

  const handlePlay = () => {
    // Deterministic stream URL is built in handleSongSelect — no blocking fetch
    if (onSongClick) {
      onSongClick({
        ...song,
        albumId: song.album?.id || song.albumId,
        imageUrl,
        isStream: true
      })
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
    <div
      onClick={handlePlay}
      className="w-32 md:w-40 flex-shrink-0 bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer"
    >
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800 relative group">
        {imageUrl && !failed ? (
          <img src={imageUrl} alt={song.name} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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
        {/* Touch: always-visible ⋯ chip (invisible hover overlays are
            unhittable on mobile); Desktop: hover overlay with all actions */}
        <div className="absolute top-1.5 right-1.5 md:hidden">
          <TrackMenu
            song={song}
            likedSongs={likedSongs}
            onLikeToggle={onLikeToggle}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio}
            showToast={showToast}
            triggerClass="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
          />
        </div>
        <div className={`absolute inset-0 bg-black/50 transition-opacity hidden md:flex items-center justify-center gap-2 ${progress ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}`}>
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
      <h3 className="text-xs font-medium text-white truncate">{decodeHtmlEntities(song.name)}</h3>
      <p className="text-xs text-zinc-400 truncate">{song.artist}</p>
      {Number(song.playCount) > 0 && (
        <p className="text-xs text-zinc-500 mt-1">{formatPlayCount(song.playCount)} plays</p>
      )}
    </div>
  )
}

function PlaylistCard({ playlist, onPlaylistClick }) {
  const imageUrl = getImageSrc(playlist.image)
  const [failed, setFailed] = useState(false)

  const handleClick = () => {
    if (onPlaylistClick) {
      onPlaylistClick(playlist)
    }
  }

  return (
    <div onClick={handleClick} className="w-32 md:w-40 flex-shrink-0 bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-800/50 transition-colors cursor-pointer">
      <div className="aspect-square rounded-md overflow-hidden mb-3 bg-zinc-800">
        {imageUrl && !failed ? (
          <img src={imageUrl} alt={playlist.name} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
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
