import { useState, useEffect, useMemo, useRef } from 'react'
import { Disc, ListMusic, Loader2, Download, Play, History, TrendingUp, UserCheck, Sparkles, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import MetaTags from '../components/MetaTags'
import HorizontalScroll from '../components/HorizontalScroll'
import TrackMenu from '../components/TrackMenu'
import { decodeHtmlEntities, getBestImageUrl, getImageSrc } from '../utils'
import { normalizeArtistName, isContentBlocked, slimSong } from '../utils/sync'
import { capPerArtist, buildMixBuckets, assembleDailyMix } from '../utils/dailyMix'
import { useJioFeaturedPlaylists, useJioNewReleases, useCharts, useTrending, useNewReleaseAlbums, useSongSuggestions } from '../hooks/useApi'
import { useArtistConfig } from '../artist-config'
import { useAppAuth } from '../components/AuthGate'
import { useAuth } from '@clerk/clerk-react'
import { usePlaylistStore } from '../stores/playlistStore'

// ISO week id — two devices generating in the same week MUST converge on
// the same playlist id or sync union-creates a duplicate.
function isoWeekId(d = new Date()) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = (dt.getUTCDay() + 6) % 7 // Mon=0
  dt.setUTCDate(dt.getUTCDate() - day + 3) // Thursday anchors the week
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4))
  const fday = (firstThu.getUTCDay() + 6) % 7
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3)
  const week = 1 + Math.round((dt - firstThu) / (7 * 24 * 3600 * 1000))
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

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

export default function DiscoverView({ onSongClick, showToast, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, onHideSong, onHideArtist, contentLanguages, blockCtx, presenceMembers }) {
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

  // Content controls — hidden songs/artists and explicit tracks (when the
  // filter is on) never surface on rails. Trending/chart items carry artists
  // as a bare [{name}] array, so check that shape too.
  const railPass = (item) => {
    if (!blockCtx) return true
    if (isContentBlocked(item, blockCtx)) return false
    const names = (Array.isArray(item?.artists) ? item.artists : [])
      .map(a => normalizeArtistName(typeof a === 'object' ? a?.name : a))
      .filter(Boolean)
    return !names.some(n => blockCtx.hiddenArtists?.[n])
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

  // Editorial moods — server-proxied channel list (curated Tamil fallback
  // baked into the endpoint). Selecting a chip pulls that mood's songs
  // through the existing search funnel; both layers day-cached.
  const { data: moods } = useQuery({
    queryKey: ['moods'],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/moods`)
        const json = await res.json()
        return json?.success ? (json.data || []) : []
      } catch { return [] }
    },
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1
  })
  const [moodSel, setMoodSel] = useState(null)
  const activeMoodQuery = (moodSel ?? moods?.[0])?.query
  const activeMoodName = (moodSel ?? moods?.[0])?.name
  // Upstream mood queries are bare concepts ("Romance") that resolve
  // Hindi-heavy — bias the search with the member's first content-language
  // pref so the rail returns songs they'd actually play. No pref = generic.
  const moodLangBias = langPrefs.size ? [...langPrefs][0] : ''
  const moodSearchQuery = activeMoodQuery
    ? (moodLangBias && !activeMoodQuery.toLowerCase().includes(moodLangBias)
        ? `${moodLangBias} ${activeMoodQuery}` : activeMoodQuery)
    : ''
  const { data: moodSongs } = useQuery({
    queryKey: ['mood-songs', moodSearchQuery],
    queryFn: async () => {
      try {
        const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(moodSearchQuery)}&n=15`)
        const json = await res.json()
        return (json?.data?.songs || []).map(song => ({
          id: song.id,
          name: decodeHtmlEntities(song.title || song.name || ''),
          artist: decodeHtmlEntities(song.subtitle || song.artists?.primary?.[0]?.name || ''),
          album: decodeHtmlEntities(song.more_info?.album || ''),
          image: getImageSrc(song.image),
          language: song.language || song.more_info?.language || '',
          type: song.type
        }))
      } catch { return [] }
    },
    enabled: !!moodSearchQuery,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1
  })

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

  // Daily mixes — top ~9 weighted artists grouped into ≤3 buckets of ~3;
  // each bucket is one mix (lead artist names it, "& more" when multi).
  // Seeds are the member's OWN top songs across the bucket's artists
  // (capPerArtist so none dominates); fill pulls suggestions for up to 3
  // distinct-artist seeds PER MIX (≤9 parallel day-cached calls total).
  // Sparse tail: 1-2 artists → one honest artist-named mix; none → no mix.
  const mixBuckets = useMemo(() => {
    if (!isSignedIn) return []
    try {
      const pc = JSON.parse(localStorage.getItem('playCounts') || '{}')
      const sk = JSON.parse(localStorage.getItem('skipCounts') || '{}')
      return buildMixBuckets(pc, sk)
    } catch { return [] }
  }, [isSignedIn])

  const mixSeedIds = mixBuckets.flatMap(b => b.suggSeeds.map(s => s.id)).filter(Boolean)
  const { data: mixSuggestions } = useQuery({
    queryKey: ['daily-mixes', new Date().toISOString().slice(0, 10), mixSeedIds.join(',')],
    queryFn: async () => {
      const out = {}
      await Promise.all(mixSeedIds.map(async (id) => {
        try {
          const res = await fetch(`${API_BASE}/api/songs/${id}/suggestions`)
          const json = await res.json()
          out[id] = json?.success ? (json.data || []) : []
        } catch { out[id] = [] }
      }))
      return out
    },
    enabled: isSignedIn && mixSeedIds.length > 0,
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1
  })

  const dailyMixes = mixBuckets
    .map((bucket, i) => assembleDailyMix(bucket, mixSuggestions, blockCtx, i))
    .filter(m => m.songs.length > 0)

  // ─── Weekly Mix ───
  // Discover-Weekly analog: a REAL playlist (shows in Playlists/Sidebar,
  // syncs cross-device) refilled wholesale each ISO week. Deterministic id
  // → two devices generating pre-sync converge; the merge layer gives
  // weeklyMix playlists replace-not-union song semantics.
  const { getToken, userId } = useAuth()
  const weekId = useMemo(() => isoWeekId(), [])
  const weeklyMixId = `pl_weekly_${weekId}`
  const weeklyMix = usePlaylistStore(s => s.playlists[weeklyMixId])
  const weeklyGenRef = useRef(false)

  useEffect(() => {
    if (!isSignedIn || weeklyGenRef.current) return
    const existing = usePlaylistStore.getState().playlists[weeklyMixId]
    if (existing?.weeklyMixWeek === weekId && existing.songs?.length) return
    let pc, sk = {}
    try {
      pc = JSON.parse(localStorage.getItem('playCounts') || '{}')
      sk = JSON.parse(localStorage.getItem('skipCounts') || '{}')
    } catch { return }
    const net = (e) => (e.count || 0) - 2 * (sk[e.id]?.count || 0)
    const entries = Object.values(pc).filter(e => e?.id && net(e) >= 2)
    if (entries.length < 3) return // not enough listening history to mix
    weeklyGenRef.current = true
    ;(async () => {
      const sorted = entries.sort((a, b) => net(b) - net(a))
      const seeds = capPerArtist(sorted, 2).slice(0, 10)
      // Suggestions seeded by the top THREE DISTINCT artists — the mix must
      // not collapse into a single-artist echo chamber.
      const topArtists = []
      const seenArtists = new Set()
      for (const s of sorted) {
        const k = normalizeArtistName(s.artist)
        if (k && !seenArtists.has(k)) { seenArtists.add(k); topArtists.push(s) }
        if (topArtists.length >= 3) break
      }
      const suggLists = await Promise.all(topArtists.map(s =>
        fetch(`${API_BASE}/api/songs/${s.id}/suggestions`)
          .then(r => r.json()).then(j => j?.success ? j.data || [] : []).catch(() => [])
      ))
      const ctx = blockCtx || {}
      const seen = new Set(seeds.map(s => s.id))
      const fill = suggLists.flat()
        .filter(s => s?.id && !seen.has(s.id) && seen.add(s.id) && !isContentBlocked(s, ctx))
        .map(s => slimSong(s) || s)
      const songs = capPerArtist(
        [...seeds.map(s => slimSong(s) || s).filter(s => !isContentBlocked(s, ctx)), ...fill],
        3
      ).slice(0, 30)
      const store = usePlaylistStore.getState()
      store.createPlaylistWithId(weeklyMixId, 'Weekly Mix', { weeklyMix: true, weeklyMixWeek: weekId })
      store.replacePlaylistSongs(weeklyMixId, songs, { weeklyMixWeek: weekId })
      window.dispatchEvent(new Event('library:changed')) // push the generated mix
    })()
  }, [isSignedIn, weeklyMixId, weekId, weeklyMix?.weeklyMixWeek, blockCtx])

  // ─── Family activity — opt-in member feed (no data when nobody shares) ───
  const { data: familyActivity } = useQuery({
    queryKey: ['family-activity'],
    queryFn: async () => {
      const token = await getToken()
      if (!token) return []
      const res = await fetch(`${API_BASE}/api/family/activity`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json()
      return json?.success ? (json.data || []) : []
    },
    enabled: isSignedIn,
    staleTime: 60 * 1000,
    retry: 1
  })

  // Live presence — other members' now-playing from /ws/presence (self
  // excluded; entries without a song never render)
  const liveMembers = useMemo(
    () => (presenceMembers || []).filter(m => m?.song?.id && m.userId !== userId),
    [presenceMembers, userId]
  )

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
  const newSongs = (newReleasesData || []).filter(i => matchLang(i) && railPass(i)).slice(0, 10).map(song => ({
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
      {isSignedIn && recentlyPlayed.filter(railPass).length > 0 && (
        <HorizontalScroll
          title="Recently Played"
          icon={History}
          items={recentlyPlayed.filter(railPass)}
          renderItem={(song) => (
            <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* Because you listened — personalized suggestions from play history */}
      {isSignedIn && becauseYouListened?.filter(railPass).length > 0 && seedSong && (
        <HorizontalScroll
          title={`Because you listened to ${decodeHtmlEntities(seedSong.name || '')}`}
          icon={History}
          items={becauseYouListened.filter(railPass).slice(0, 15)}
          renderItem={(song) => (
            <SongCard song={{ ...song, name: decodeHtmlEntities(song.name || song.title || ''), artist: decodeHtmlEntities(song.artists?.primary?.[0]?.name || song.artist || ''), image: song.image }} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* On Repeat — your most-played songs */}
      {isSignedIn && mixes.onRepeat.filter(railPass).length > 0 && (
        <HorizontalScroll
          title="On Repeat"
          icon={TrendingUp}
          items={mixes.onRepeat.filter(railPass)}
          renderItem={(song) => (
            <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* Repeat Rewind — old favorites resurfaced */}
      {isSignedIn && mixes.rewind.filter(railPass).length > 0 && (
        <HorizontalScroll
          title="Repeat Rewind"
          icon={History}
          items={mixes.rewind.filter(railPass)}
          renderItem={(song) => (
            <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
          )}
          emptyMessage=""
        />
      )}

      {/* New from artists you follow — member-only personalized rail */}
      {isSignedIn && followedRail.filter(railPass).length > 0 && (
        <HorizontalScroll
          title="New from artists you follow"
          icon={UserCheck}
          items={followedRail.filter(railPass)}
          renderItem={(album) => (
            <EntityCard item={album} onClick={() => handleAlbumClick(album)} subtitle={album.year || 'Album'} />
          )}
          emptyMessage=""
        />
      )}

      {/* Weekly Mix — a real playlist refilled each ISO week; lives in
          Playlists/Sidebar and syncs like any member playlist */}
      {isSignedIn && weeklyMix?.songs?.filter(railPass).length > 0 && (
        <HorizontalScroll
          title="Weekly Mix"
          icon={Sparkles}
          items={weeklyMix.songs.filter(railPass).slice(0, 15)}
          renderItem={(song) => (
            <SongCard song={{ ...song, name: decodeHtmlEntities(song.name || song.title || ''), artist: decodeHtmlEntities(song.artists?.primary?.[0]?.name || song.artist || ''), image: song.image }} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
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
          items={mix.songs.filter(railPass)}
          renderItem={(song) => (
            <SongCard song={{ ...song, name: decodeHtmlEntities(song.name || song.title || ''), artist: decodeHtmlEntities(song.artists?.primary?.[0]?.name || song.artist || ''), image: song.image }} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
          )}
          emptyMessage=""
        />
      ))}

      {/* Moods — editorial channels; chip row + selected mood's rail */}
      {moods?.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 overflow-x-auto scrollbar-hide">
            <Sparkles size={16} className="text-[#fc3c44] shrink-0" />
            {moods.map(m => (
              <button
                key={m.id}
                onClick={() => setMoodSel(m)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  (moodSel ?? moods[0])?.id === m.id
                    ? 'bg-[#fc3c44] text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
          {(moodSongs || []).filter(i => matchLang(i) && railPass(i)).length > 0 && (
            <HorizontalScroll
              title={activeMoodName ? `${activeMoodName} picks` : 'Mood picks'}
              items={(moodSongs || []).filter(i => matchLang(i) && railPass(i))}
              renderItem={(song) => (
                <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
              )}
              emptyMessage=""
            />
          )}
        </div>
      )}

      {/* Top Artists */}
      <HorizontalScroll
        title="Top Artists"
        items={topArtists.filter(a => !(blockCtx?.hiddenArtists?.[normalizeArtistName(a.name)]))}
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
          <SongCard song={song} onSongClick={onSongClick} downloadProgress={downloadProgress} setDownloadProgress={setDownloadProgress} likedSongs={likedSongs} onLikeToggle={onLikeToggle} onPlayNext={onPlayNext} onAddToQueue={onAddToQueue} onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist} showToast={showToast} />
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
          items={charts.filter(i => matchLang(i) && railPass(i))}
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
          items={trending.filter(i => matchLang(i) && railPass(i))}
          renderItem={(album) => (
            <EntityCard item={album} onClick={() => handleAlbumClick(album)} subtitle={album.year || 'Album'} />
          )}
          emptyMessage=""
        />
      )}

      {/* Listening now — live presence of opted-in members (websocket);
          self is excluded, row disappears when nobody is live */}
      {isSignedIn && liveMembers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
            Listening now
          </h2>
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 divide-y divide-zinc-800/50 max-w-2xl">
            {liveMembers.map((m, i) => (
              <div key={`${m.userId || m.name}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-900/40 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-emerald-300">
                  {decodeHtmlEntities(m.name || 'M').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">
                    <span className="font-medium">{decodeHtmlEntities(m.name || 'Member')}</span>
                    <span className="text-zinc-500"> is listening — </span>
                    {decodeHtmlEntities(m.song?.name || '')}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">{decodeHtmlEntities(m.song?.artist || '')}</div>
                </div>
                {m.song?.image && <img src={m.song.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Family activity — opt-in member feed; hidden entirely when nobody
          shares (privacy boundary is the member's own toggle in Settings) */}
      {isSignedIn && familyActivity?.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
            <Users size={18} className="text-zinc-400" /> Family activity
          </h2>
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 divide-y divide-zinc-800/50 max-w-2xl">
            {familyActivity.slice(0, 8).map((row, i) => (
              <div key={`${row.songId}-${row.ts}-${i}`} className="flex items-center gap-3 px-3 py-2.5">
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-zinc-300">
                  {decodeHtmlEntities(row.memberName || 'M').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white truncate">
                    <span className="font-medium">{row.isYou ? 'You' : decodeHtmlEntities(row.memberName || 'Member')}</span>
                    <span className="text-zinc-500"> played </span>
                    {decodeHtmlEntities(row.song || '')}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {decodeHtmlEntities(row.artist || '')}
                    {row.ts ? ` · ${new Date(row.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
                  </div>
                </div>
                {row.image && <img src={row.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New release albums */}
      {newAlbums?.length > 0 && (
        <HorizontalScroll
          title="New Releases"
          items={newAlbums.filter(i => matchLang(i) && railPass(i))}
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

function SongCard({ song, onSongClick, downloadProgress, setDownloadProgress, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, onHideSong, onHideArtist, showToast }) {
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
            onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist}
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
            onGoToAlbum={onGoToAlbum} onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist}
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
