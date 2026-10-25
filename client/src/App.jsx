import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Compass, Search, Menu, X, ArrowLeft, Library } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'

import { Analytics } from '@vercel/analytics/react'
import { useHealthCheck } from './hooks/useApi'
import { getConnectionType, getMaxBitrate } from './utils'
import { useAuth } from '@clerk/clerk-react'
import { onCastState, canCast, resolveCastBase, startCast, loadSong, watchCastPlayback, stopCast, isCasting } from './utils/cast'
import Sidebar from './views/Sidebar'
import SearchView from './views/SearchView'
import DiscoverView from './views/DiscoverView'
import DiscoverDetailView from './views/DiscoverDetailView'
import PlayerBar from './views/PlayerBar'
import FullScreenPlayer from './views/FullScreenPlayer'
import DownloadManager from './views/DownloadManager'
import PlaylistsView from './views/PlaylistsView'
import PlaylistDetailView from './views/PlaylistDetailView'
import LikedSongsView from './views/LikedSongsView'
import StatsView from './views/StatsView'
import LibraryView from './views/LibraryView'
import LocalAlbumView from './views/LocalAlbumView'
import DownloadsView from './views/DownloadsView'
import SharedPlaylistView from './views/SharedPlaylistView'
import BlendView from './views/BlendView'
import WrappedView from './views/WrappedView'
import QueueDrawer from './components/QueueDrawer'
import ErrorBoundary from './components/ErrorBoundary'
import UserMenu from './components/UserMenu'
import LyricsModal from './components/LyricsModal'
import { ProtectedRoute, useAppAuth } from './components/AuthGate'
import { useLibrarySync } from './hooks/useLibrarySync'
import usePresence from './hooks/usePresence'
import { usePlaylistStore } from './stores/playlistStore'
import { enableEq, warmEq, setEqGains, ensureGraph, resumeGraph, setNormGainDb, measureRmsDb } from './audio/eq'
import { isDownloaded, downloadUrlFor, reconcileDownloads } from './utils/downloads'
import { getSongArtwork, decodeHtmlEntities, readContentLanguages } from './utils'
import { addTombstone, clearTombstone, slimSong, normalizeArtistName, isContentBlocked, blocklistKeys } from './utils/sync'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
import DMCA from './pages/DMCA'

const API_BASE = import.meta.env.VITE_API_URL
const VERCEL_API_BASE = import.meta.env.VITE_VERCEL_API_URL

// Check if we're in production mode
const isProduction = import.meta.env.MODE === 'production'

// Module-level scroll position storage (persists across component unmounts)
const scrollPositionStorage = new Map()



// Deterministic stream URLs: local files ignore bitrate server-side,
// remote songs route through the proxy so bitrate switching is real.
// Downloaded songs always play their cached 96k copy — works fully offline.
const isLocalSong = (s) => !!(s?.isLocal || s?.audioPath)
const streamUrlFor = (song, bitrate = 96) =>
  isDownloaded(song.id)
    ? downloadUrlFor(song.id)
    : `${API_BASE}/api/stream/${song.id}${isLocalSong(song) ? '' : `?bitrate=${bitrate}`}`

// Fisher-Yates permutation of queue indices, anchor first (or none when <0)
function buildShuffleOrder(queueLength, anchorIndex = -1) {
  const indices = Array.from({ length: queueLength }, (_, i) => i)
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  if (anchorIndex < 0) return indices
  const rest = indices.filter(i => i !== anchorIndex)
  return [anchorIndex, ...rest]
}

const repeatCycle = (r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')

// Starting bitrate for a new track. Metered connections start at 96 (fast
// start, saves data); everything else starts at 160 and upgrades to max once
// buffered — no more degraded first-15-seconds on WiFi.
const startBitrateFor = (maxBitrate, connType) => {
  if (maxBitrate <= 96) return 96
  if (connType === 'cellular' || connType === 'cellular-slow') return 96
  return Math.min(maxBitrate, 160)
}

// Configure QueryClient with 5-minute cache
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

// Configure cache persistence to localStorage
const persister = createSyncStoragePersister({
  storage: localStorage,
})

persistQueryClient({
  queryClient,
  persister,
})

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(() => {
    const saved = parseFloat(localStorage.getItem('volume'))
    return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 0.75
  })
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [shuffleOrder, setShuffleOrder] = useState([])
  const [shufflePos, setShufflePos] = useState(0)
  const [repeat, setRepeat] = useState('off') // 'off' | 'all' | 'one'
  const [queue, setQueue] = useState([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0) // bumps on each recorded play — feeds the sync push deps
  const [likedSongs, setLikedSongs] = useState(() => {
    try {
      const saved = localStorage.getItem('likedSongs')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch {
      return new Set()
    }
  })
  // Saved albums / followed artists — Spotify's collect loop beyond songs.
  // Sets of ids for O(1) checks; object arrays in localStorage for display.
  const [savedAlbums, setSavedAlbums] = useState(() => {
    try { return new Set((JSON.parse(localStorage.getItem('savedAlbums') || '[]')).map(a => a.id)) } catch { return new Set() }
  })
  const [followedArtists, setFollowedArtists] = useState(() => {
    try { return new Set((JSON.parse(localStorage.getItem('followedArtists') || '[]')).map(a => a.id)) } catch { return new Set() }
  })
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('error') // 'error', 'success', 'warning'
  const [isSearchingAlbum, setIsSearchingAlbum] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showFullScreenPlayer, setShowFullScreenPlayer] = useState(false)
  const [qualityPreference, setQualityPreference] = useState(() => {
    const saved = localStorage.getItem('qualityPreference')
    return saved || 'auto'
  })
  const [currentBitrate, setCurrentBitrate] = useState(96)
  // Dual audio elements — crossfade plays the incoming track on the idle
  // element while the audible one fades out. `audible()` ALWAYS resolves the
  // element currently producing sound; every playback mutation must go
  // through it (never `audioRef.current` directly).
  const audioRef = useRef(null)
  const audioBRef = useRef(null)
  const activeElRef = useRef(0) // 0 = audioRef, 1 = audioBRef — mirrors state for handler reads
  const [activeEl, setActiveEl] = useState(0)
  const audible = () => activeElRef.current === 0 ? audioRef.current : audioBRef.current
  const idleEl = () => activeElRef.current === 0 ? audioBRef.current : audioRef.current
  const xfadeRef = useRef(null) // { raf, outEl, inEl, nextIdx, song, bitrate } while a crossfade owns both
  const scrollContainerRef = useRef(null)
  const previousBitrateRef = useRef(96) // last-APPLIED bitrate (updated only inside the switch effect)
  const bitrateSwitchTimeoutRef = useRef(null)
  const lastSwitchAtRef = useRef(0) // downgrade cooldown anchor
  const warmedNextRef = useRef(null) // song id whose stream endpoint was already warmed
  const pendingSeekRef = useRef(null) // position to restore after loadedmetadata (resume)
  const [resumeSession, setResumeSession] = useState(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const [desktopLyricsOpen, setDesktopLyricsOpen] = useState(false)
  const [autoplayEnabled, setAutoplayEnabled] = useState(() => localStorage.getItem('autoplay') !== 'off')
  const queueEpochRef = useRef(0) // bumped on every queue mutation — async ops bail if it moved
  const autoplayAttemptedRef = useRef(false) // one suggestions fetch per queue-end event
  const autoplayToastShownRef = useRef(false) // toast once per continuous chain
  const pendingSuggestionsRef = useRef(null) // { seedId, songs } early-fetched near queue end
  const [sleepTimer, setSleepTimer] = useState(null) // {type:'timer',endsAt} | {type:'eot'} | null
  const sleepTimerRef = useRef(null) // onEnded reads the live value (stale-closure safe)
  const liveQueueRef = useRef(null) // post-await commits read live queue/shuffle state
  const [eqSettings, setEqSettings] = useState(() => {
    try { return { enabled: false, low: 0, mid: 0, high: 0, preset: 'flat', ...JSON.parse(localStorage.getItem('eq') || '{}') } }
    catch { return { enabled: false, low: 0, mid: 0, high: 0, preset: 'flat' } }
  })
  const fadingRef = useRef(false) // true while a volume ramp owns audio.volume
  const fadeRafRef = useRef(null)
  // Private session — device-scoped, never synced; suppresses history/count
  // writes so a shared listening session doesn't pollute personalization.
  const [privateSession, setPrivateSession] = useState(() => localStorage.getItem('privateSession') === 'on')
  // Content languages — Spotify-style persistent pref biasing Discover rails
  const [contentLanguages, setContentLanguages] = useState(readContentLanguages)
  const toggleContentLanguage = (code) => {
    setContentLanguages(prev => {
      const next = prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
      try { localStorage.setItem('contentLanguages', JSON.stringify(next)) } catch { /* quota */ }
      return next
    })
  }
  const privateSessionRef = useRef(privateSession) // handlePlaying reads the live value
  // Play accounting — a "play" only counts after a real listen (30s or half
  // the song, whichever is shorter). countedPlayRef holds the song id once
  // counted so resume/re-buffer/xfade-commit never double-count.
  const countedPlayRef = useRef(null)
  // Offline awareness — navigator.onLine + the health-check signal
  const [isOnline, setIsOnline] = useState(() => navigator.onLine !== false)

  // Mirror live queue/shuffle state — post-await commits must not use
  // pre-await snapshots (user may toggle shuffle mid-fetch)
  useEffect(() => {
    liveQueueRef.current = { queue, shuffle, shuffleOrder, shufflePos }
  }, [queue, shuffle, shuffleOrder, shufflePos])

  useEffect(() => {
    sleepTimerRef.current = sleepTimer
  }, [sleepTimer])

  const currentSongRef = useRef(null)
  useEffect(() => {
    currentSongRef.current = currentSong
  }, [currentSong])

  // Use TanStack Query for health check
  const { data: healthData, isError: healthError } = useHealthCheck(true)
  const serverStatus = healthError ? 'offline' : 'online'

  // Cross-device library sync — likes + playlists follow the signed-in user
  useLibrarySync({ likedSongs, setLikedSongs, savedAlbums, setSavedAlbums, followedArtists, setFollowedArtists, historyVersion })

  // Freemium gate — guests get search + play; personal features require sign-in
  const { requireAuth, isSignedIn } = useAppAuth()

  // ─── Content controls (member- or guest-scoped blocklists) ───
  // Keys switch scope with auth state so member data never leaks into the
  // guest view on a shared device (and vice versa).
  const readKey = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb } catch { return fb } }
  const [hiddenSongs, setHiddenSongs] = useState(() => readKey(blocklistKeys(isSignedIn).hiddenSongs, {}))
  const [hiddenArtists, setHiddenArtists] = useState(() => readKey(blocklistKeys(isSignedIn).hiddenArtists, {}))
  const [explicitFilter, setExplicitFilter] = useState(() => !!readKey(blocklistKeys(isSignedIn).explicitFilter, false))
  const [dataSaver, setDataSaver] = useState(() => !!readKey(blocklistKeys(isSignedIn).dataSaver, false))
  const dataSaverRef = useRef(dataSaver) // bitrate reads inside async handlers need the live value
  // Loudness normalization — on by default; member key syncs, guest key is
  // device-local (same scoping pattern as dataSaver).
  const [normalizeVolume, setNormalizeVolume] = useState(() => {
    const v = readKey(blocklistKeys(isSignedIn).normalizeVolume, null)
    return v === null ? true : !!v
  })
  const normalizeVolRef = useRef(normalizeVolume)
  useEffect(() => { normalizeVolRef.current = normalizeVolume }, [normalizeVolume])
  // The audio graph serves EQ AND normalization — either one being on means
  // elements route through it (default config: normalize ON, EQ OFF).
  const audioGraphOn = () => eqSettings.enabled || normalizeVolRef.current
  // Loudness measurement — rolling ~15s window of 500ms RMS samples,
  // per-song (reset when the audible song changes).
  const rmsWindowRef = useRef([])
  const rmsSongRef = useRef(null)
  useEffect(() => {
    const iv = setInterval(() => {
      if (!normalizeVolRef.current) return
      const el = audible()
      if (!el || el.paused || el.ended) return
      // Freeze during fades — a volume-ramping element must not get
      // re-boosted mid-fade (both the 500ms track-start fade and crossfade).
      if (fadingRef.current || xfadeRef.current) return
      const rms = measureRmsDb(el)
      if (rms === null || rms <= -99) return // not in graph, or digital silence
      if (rmsSongRef.current !== currentSongRef.current?.id) {
        rmsSongRef.current = currentSongRef.current?.id || null
        rmsWindowRef.current = []
      }
      const w = rmsWindowRef.current
      w.push(rms)
      if (w.length > 30) w.shift() // ~15s at 500ms cadence
      const avg = w.reduce((a, b) => a + b, 0) / w.length
      // Target ≈ -20dBFS RMS, clamp ±12dB so quiet masters never blast.
      setNormGainDb(el, Math.max(-12, Math.min(12, -20 - avg)))
    }, 500)
    return () => clearInterval(iv)
  }, [])

  // Re-read scope on sign-in/out and when a sync pull rewrote the keys.
  useEffect(() => {
    const refresh = () => {
      const keys = blocklistKeys(isSignedIn)
      setHiddenSongs(readKey(keys.hiddenSongs, {}))
      setHiddenArtists(readKey(keys.hiddenArtists, {}))
      setExplicitFilter(!!readKey(keys.explicitFilter, false))
      setDataSaver(readKey(keys.dataSaver, false))
      const nv = readKey(keys.normalizeVolume, null)
      setNormalizeVolume(nv === null ? true : !!nv)
      setShareActivity(!!readKey('shareActivity', false))
      setDisplayName(String(readKey('displayName', '') || ''))
    }
    refresh()
    window.addEventListener('library:changed', refresh)
    return () => window.removeEventListener('library:changed', refresh)
  }, [isSignedIn])

  // Always-fresh block context for filters (localStorage is the source of
  // truth — a sync pull may rewrite it between renders).
  const blockedCtx = () => {
    const keys = blocklistKeys(isSignedIn)
    return {
      hiddenSongs: readKey(keys.hiddenSongs, {}),
      hiddenArtists: readKey(keys.hiddenArtists, {}),
      explicitFilter: !!readKey(keys.explicitFilter, false)
    }
  }

  const handleHideSong = (song) => {
    if (!song?.id) return
    const keys = blocklistKeys(isSignedIn)
    const map = readKey(keys.hiddenSongs, {})
    map[song.id] = { ...(slimSong(song) || { id: song.id, name: song.name || song.title }), hiddenAt: Date.now() }
    try { localStorage.setItem(keys.hiddenSongs, JSON.stringify(map)) } catch { /* quota */ }
    if (isSignedIn) clearTombstone('hiddenSongs', song.id)
    setHiddenSongs(map)
    window.dispatchEvent(new Event('library:changed'))
    showToastMessage(`Hidden "${decodeHtmlEntities(song.name || song.title || 'song')}"`, 'success')
  }

  const handleHideArtist = (song) => {
    const raw = song?.artist || song?.artists?.primary?.[0]?.name || song?.primaryArtists || ''
    const key = normalizeArtistName(raw)
    if (!key) return
    const keys = blocklistKeys(isSignedIn)
    const map = readKey(keys.hiddenArtists, {})
    map[key] = { id: key, name: String(raw).split(',')[0], hiddenAt: Date.now() }
    try { localStorage.setItem(keys.hiddenArtists, JSON.stringify(map)) } catch { /* quota */ }
    if (isSignedIn) clearTombstone('hiddenArtists', key)
    setHiddenArtists(map)
    window.dispatchEvent(new Event('library:changed'))
    showToastMessage(`Hidden ${decodeHtmlEntities(String(raw).split(',')[0])}`, 'success')
  }

  const handleUnhideSong = (id) => {
    const keys = blocklistKeys(isSignedIn)
    const map = { ...readKey(keys.hiddenSongs, {}) }
    delete map[id]
    try { localStorage.setItem(keys.hiddenSongs, JSON.stringify(map)) } catch { /* quota */ }
    if (isSignedIn) addTombstone('hiddenSongs', id)
    setHiddenSongs(map)
    window.dispatchEvent(new Event('library:changed'))
  }

  const handleUnhideArtist = (key) => {
    const keys = blocklistKeys(isSignedIn)
    const map = { ...readKey(keys.hiddenArtists, {}) }
    delete map[key]
    try { localStorage.setItem(keys.hiddenArtists, JSON.stringify(map)) } catch { /* quota */ }
    if (isSignedIn) addTombstone('hiddenArtists', key)
    setHiddenArtists(map)
    window.dispatchEvent(new Event('library:changed'))
  }

  const handleExplicitFilterToggle = () => {
    const keys = blocklistKeys(isSignedIn)
    const next = !explicitFilter
    try { localStorage.setItem(keys.explicitFilter, JSON.stringify(next)) } catch { /* quota */ }
    setExplicitFilter(next)
    window.dispatchEvent(new Event('library:changed'))
    showToastMessage(next ? 'Explicit content hidden' : 'Explicit content allowed', 'success')
  }

  const handleDataSaverToggle = () => {
    const keys = blocklistKeys(isSignedIn)
    const next = !dataSaver
    try { localStorage.setItem(keys.dataSaver, JSON.stringify(next)) } catch { /* quota */ }
    dataSaverRef.current = next
    setDataSaver(next)
    // Apply to the ACTIVE song immediately — pin currentBitrate to 96 so the
    // bitrate-switch effect swaps the stream right now, and cap maxBitrate
    // so adaptive upgrades stop until it's toggled off.
    setCurrentSong(prev => {
      if (!prev?.isStream || isLocalSong(prev)) return prev
      const cap = next ? 96 : getMaxBitrate(getConnectionType(), dataSaverRef.current ? 'low-data' : qualityPreference)
      return { ...prev, maxBitrate: cap }
    })
    if (next && currentBitrate > 96) setCurrentBitrate(96)
    showToastMessage(next ? 'Data saver on — streaming at 96kbps' : 'Data saver off', 'success')
  }

  const handleNormalizeToggle = () => {
    const keys = blocklistKeys(isSignedIn)
    const next = !normalizeVolume
    try { localStorage.setItem(keys.normalizeVolume, JSON.stringify(next)) } catch { /* quota */ }
    normalizeVolRef.current = next
    setNormalizeVolume(next)
    if (!next) {
      // Off = flatten to unity — never disconnect a captured source.
      if (audible()) setNormGainDb(audible(), 0)
      if (idleEl()) setNormGainDb(idleEl(), 0)
      rmsWindowRef.current = []
    } else {
      // Graph entry is gesture-safe here — this IS the gesture.
      if (audioGraphOn() && audible()) { ensureGraph(audible()); resumeGraph() }
    }
    window.dispatchEvent(new Event('library:changed')) // members sync the pref
    showToastMessage(next ? 'Normalize volume on' : 'Normalize volume off', 'success')
  }

  // Crossfade — seconds; 0 = off. `crossfade` key is the duration source of
  // truth; `smoothTransitions` stays synced for backward-compat reads.
  const [crossfadeSec, setCrossfadeSec] = useState(() => {
    const v = localStorage.getItem('crossfade')
    if (v !== null) return Number(v) || 0
    return localStorage.getItem('smoothTransitions') === 'on' ? 4 : 0 // migrate
  })
  const xfadeSecRef = useRef(crossfadeSec)
  const smoothTransitions = crossfadeSec > 0
  const handleCrossfadeChange = (sec) => {
    setCrossfadeSec(sec)
    xfadeSecRef.current = sec
    try {
      localStorage.setItem('crossfade', String(sec))
      localStorage.setItem('smoothTransitions', sec > 0 ? 'on' : 'off')
    } catch { /* quota */ }
  }

  // Family activity — opt-in; member-scoped scalars synced via library doc
  const [shareActivity, setShareActivity] = useState(() => !!readKey('shareActivity', false))
  const [displayName, setDisplayName] = useState(() => String(readKey('displayName', '') || ''))
  const handleShareActivityToggle = () => {
    const next = !shareActivity
    try {
      localStorage.setItem('shareActivity', JSON.stringify(next))
      localStorage.setItem('shareActivityAt', JSON.stringify(Date.now())) // LWW anchor for the merge
    } catch { /* quota */ }
    setShareActivity(next)
    window.dispatchEvent(new Event('library:changed'))
    showToastMessage(next ? 'Sharing your activity with family' : 'Activity sharing off', 'success')
  }
  const handleDisplayNameChange = (name) => {
    const v = String(name || '').slice(0, 50)
    try { localStorage.setItem('displayName', JSON.stringify(v)) } catch { /* quota */ }
    setDisplayName(v)
    window.dispatchEvent(new Event('library:changed'))
  }

  // Live presence — "Listening now" on Discover. Publishes this member's
  // now-playing over /ws/presence when shareActivity is on and private
  // session is off (both gates also enforced client-side in the hook).
  const { members: presenceMembers } = usePresence({
    isSignedIn, shareActivity, privateSession, currentSong, isPlaying
  })

  // ─── Chromecast ───
  // The receiver fetches stream URLs itself — they must be LAN-reachable
  // (resolveCastBase). The app stays the session's controller: on the
  // receiver's FINISHED signal it counts the play and loads the next
  // queued song. Cast plays count under the same 30s/50% rules.
  const { getToken } = useAuth()
  const [casting, setCasting] = useState(isCasting())
  const [castAvailable, setCastAvailable] = useState(false)
  const castSongRef = useRef(null) // song currently loaded on the receiver

  useEffect(() => onCastState(setCasting), [])
  useEffect(() => {
    let dead = false
    canCast(getToken).then(ok => { if (!dead) setCastAvailable(ok) })
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const castStreamUrl = (song, base) =>
    `${base}/api/stream/${song.id}${isLocalSong(song) ? '' : `?bitrate=${currentBitrate || 160}`}`

  const loadNextOnReceiver = async () => {
    // FINISHED from the receiver: count the play, advance the pointer,
    // load the next queued song on the device.
    const finished = castSongRef.current
    if (finished?.id) recordPlayStats(finished, finished.duration)
    const nextIdx = getNextQueueIndex()
    if (nextIdx === null) { stopCast(); showToastMessage('Cast queue finished', 'info'); return }
    const nextSong = queue[nextIdx]
    const base = await resolveCastBase(getToken)
    if (!base || !nextSong?.id) { stopCast(); return }
    setQueueIndex(nextIdx)
    setCurrentSong(nextSong)
    castSongRef.current = nextSong
    try {
      await loadSong({
        url: castStreamUrl(nextSong, base),
        title: nextSong.name, artist: nextSong.artist,
        image: getSongArtwork(nextSong), positionSec: 0
      })
    } catch { stopCast(); showToastMessage('Cast device disconnected', 'error') }
  }

  const handleCastToggle = async () => {
    if (casting) { stopCast(); return }
    if (!currentSong?.id) return
    const base = await resolveCastBase(getToken)
    if (!base) { showToastMessage('No reachable API for this device — cast unavailable', 'error'); return }
    try {
      await startCast({
        url: castStreamUrl(currentSong, base),
        title: currentSong.name, artist: currentSong.artist,
        image: getSongArtwork(currentSong),
        positionSec: Math.floor(audible()?.currentTime || 0)
      })
      castSongRef.current = currentSong
      audible()?.pause()
      setIsPlaying(false)
      watchCastPlayback(loadNextOnReceiver, () => {})
      showToastMessage('Casting', 'success')
    } catch (e) {
      if (e?.code !== 'cancel') showToastMessage('Cast failed', 'error')
    }
  }

  // Save/unsave an album (Spotify's "Save to Your Library")
  const handleSaveAlbumToggle = (album) => {
    requireAuth(() => {
      const list = (() => { try { return JSON.parse(localStorage.getItem('savedAlbums') || '[]') } catch { return [] } })()
      setSavedAlbums(prev => {
        const next = new Set(prev)
        let nextList
        if (next.has(album.id)) {
          next.delete(album.id)
          nextList = list.filter(a => a.id !== album.id)
          addTombstone('albums', album.id)
        } else {
          next.add(album.id)
          nextList = [{ id: album.id, name: album.name || '', artist: album.artist || '', image: album.image || '', savedAt: Date.now() }, ...list.filter(a => a.id !== album.id)]
          clearTombstone('albums', album.id)
        }
        try { localStorage.setItem('savedAlbums', JSON.stringify(nextList.slice(0, 2000))) } catch { /* quota */ }
        return next
      })
    }, () => showToastMessage('Sign in to save albums to your library'))
  }

  // Follow/unfollow an artist
  const handleFollowArtistToggle = (artist) => {
    requireAuth(() => {
      const list = (() => { try { return JSON.parse(localStorage.getItem('followedArtists') || '[]') } catch { return [] } })()
      setFollowedArtists(prev => {
        const next = new Set(prev)
        let nextList
        if (next.has(artist.id)) {
          next.delete(artist.id)
          nextList = list.filter(a => a.id !== artist.id)
          addTombstone('artists', artist.id)
        } else {
          next.add(artist.id)
          nextList = [{ id: artist.id, name: artist.name || '', image: artist.image || '', followedAt: Date.now() }, ...list.filter(a => a.id !== artist.id)]
          clearTombstone('artists', artist.id)
        }
        try { localStorage.setItem('followedArtists', JSON.stringify(nextList.slice(0, 2000))) } catch { /* quota */ }
        return next
      })
    }, () => showToastMessage('Sign in to follow artists'))
  }

  // Backup restore — refresh React state from an imported backup file
  const handleImportLibrary = (backup) => {
    if (Array.isArray(backup?.likedSongs)) {
      setLikedSongs(new Set(backup.likedSongs))
      // Restored likes must survive sync: clear any song tombstones and
      // synthesize likedMeta (tombstone-vs-likedAt comparison would
      // otherwise kill them on the next push/pull).
      const meta = (() => { try { return JSON.parse(localStorage.getItem('likedMeta') || '{}') } catch { return {} } })()
      const now = Date.now()
      for (const id of backup.likedSongs) {
        clearTombstone('songs', id)
        if (!meta[id]) meta[id] = { id, name: '', likedAt: now }
      }
      try { localStorage.setItem('likedMeta', JSON.stringify(meta)) } catch { /* quota */ }
    }
    if (Array.isArray(backup?.savedAlbums)) {
      setSavedAlbums(new Set(backup.savedAlbums.map(a => a.id)))
      // Fresh savedAt — a stale ts older than a server tombstone gets
      // re-deleted on the next pull; the restore IS a new save.
      const now = Date.now()
      const restamped = backup.savedAlbums.map(a => ({ ...a, savedAt: now }))
      backup.savedAlbums.forEach(a => a?.id && clearTombstone('albums', a.id))
      try { localStorage.setItem('savedAlbums', JSON.stringify(restamped)) } catch { /* quota */ }
    }
    if (Array.isArray(backup?.followedArtists)) {
      setFollowedArtists(new Set(backup.followedArtists.map(a => a.id)))
      const now = Date.now()
      const restamped = backup.followedArtists.map(a => ({ ...a, followedAt: now }))
      backup.followedArtists.forEach(a => a?.id && clearTombstone('artists', a.id))
      try { localStorage.setItem('followedArtists', JSON.stringify(restamped)) } catch { /* quota */ }
    }
    if (backup?.playlists && typeof backup.playlists === 'object') {
      const now = Date.now()
      const restamped = Object.fromEntries(Object.entries(backup.playlists)
        .map(([id, p]) => [id, {
          ...p, createdAt: now, updatedAt: now,
          songs: (p.songs || []).map(s => ({ ...s, addedAt: now })) // restore = new save, per song
        }]))
      // Restored folders get fresh timestamps + their tombstone cleared —
      // playlist.folderId is preserved so membership returns with the folder.
      const restampedFolders = Object.fromEntries(Object.entries(
        (backup.folders && typeof backup.folders === 'object') ? backup.folders : {}
      ).map(([id, f]) => [id, { ...f, createdAt: now, updatedAt: now }]))
      // setState triggers zustand-persist's own write — no manual LS needed
      usePlaylistStore.setState({ playlists: restamped, folders: restampedFolders })
      Object.keys(restamped).forEach(id => clearTombstone('playlists', id))
      Object.keys(restampedFolders).forEach(id => clearTombstone('folders', id))
    }
  }

  // Function to show toast notifications — each new toast resets the 5s
  // hide timer so rapid messages don't vanish early
  const toastTimerRef = useRef(null)
  const [toastAction, setToastAction] = useState(null)
  const showToastMessage = (message, type = 'error', action = null) => {
    setToastMessage(message)
    setToastType(type)
    setToastAction(action)
    setShowToast(true)
    clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setShowToast(false), 5000)
  }

  // Title bar mirrors now-playing — like Spotify's window title / tab text
  useEffect(() => {
    document.title = currentSong
      ? `${decodeHtmlEntities(currentSong.name)} · ${decodeHtmlEntities(currentSong.artist || '')} — Torsongs`
      : 'Torsongs'
  }, [currentSong])

  // Keep the screen awake while the fullscreen player is up and playing —
  // prevents karaoke-style lyrics from dying mid-song on mobile
  useEffect(() => {
    if (!showFullScreenPlayer || !isPlaying || !('wakeLock' in navigator)) return
    let lock = null
    let released = false // promise can resolve after cleanup — don't leak the lock
    const acquire = () => navigator.wakeLock.request('screen')
      .then(l => { released ? l.release().catch(() => {}) : (lock = l) })
      .catch(() => {})
    acquire()
    const onVis = () => { if (document.visibilityState === 'visible' && !released) acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVis)
      lock?.release?.().catch(() => {})
    }
  }, [showFullScreenPlayer, isPlaying])

  // Registry↔cache reconciliation — the SW LRU evicts cached audio but the
  // registry survives; a stale entry would pin playback to a dead offline URL
  useEffect(() => {
    reconcileDownloads().catch(() => {})
    const onVis = () => { if (document.visibilityState === 'visible') reconcileDownloads().catch(() => {}) }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // PWA install prompt — stash the event, surface "Install App" in the sidebar
  const [installPrompt, setInstallPrompt] = useState(null)
  useEffect(() => {
    const onBip = (e) => { e.preventDefault(); setInstallPrompt(e) }
    const onInstalled = () => setInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    installPrompt.prompt()
    await installPrompt.userChoice.catch(() => {})
    setInstallPrompt(null)
  }

  // Sleep timer — interval checks for timed expiry; 'eot' handled in onEnded
  useEffect(() => {
    if (sleepTimer?.type !== 'timer') return
    const iv = setInterval(() => {
      if (Date.now() >= sleepTimer.endsAt) {
        setSleepTimer(null)
        audible()?.pause()
        setIsPlaying(false)
        showToastMessage('Sleep timer — playback stopped', 'success')
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [sleepTimer])

  const handleSleepTimer = (value) => {
    if (value === 'off' || !value) {
      setSleepTimer(null)
      showToastMessage('Sleep timer off', 'success')
    } else if (value === 'eot') {
      setSleepTimer({ type: 'eot' })
      showToastMessage('Sleeping at end of track', 'success')
    } else {
      const mins = parseInt(value)
      setSleepTimer({ type: 'timer', endsAt: Date.now() + mins * 60000 })
      showToastMessage(`Sleep timer: ${mins} min`, 'success')
    }
  }

  // EQ — persist, build graph when enabled, apply gains on change.
  // The MediaElementSource permanently reroutes the element once created,
  // so "off" = flat gains; never disconnect.
  useEffect(() => {
    try { localStorage.setItem('eq', JSON.stringify(eqSettings)) } catch { /* quota */ }
    const el = audible()
    if (!el) return
    if (!eqSettings.enabled) {
      setEqGains({ low: 0, mid: 0, high: 0 }) // no-op if graph was never built
      return // do NOT build the graph while disabled — a suspended
      // AudioContext would reroute the element's output to silence
    }
    if (!warmEq(el)) return
    enableEq(el) // resume() is a no-op until a gesture — play paths also resume
    setEqGains({ low: eqSettings.low, mid: eqSettings.mid, high: eqSettings.high })
  }, [eqSettings])

  useEffect(() => {
    try { localStorage.setItem('smoothTransitions', smoothTransitions ? 'on' : 'off') } catch { /* quota */ }
  }, [smoothTransitions])

  useEffect(() => {
    privateSessionRef.current = privateSession
    try { localStorage.setItem('privateSession', privateSession ? 'on' : 'off') } catch { /* quota */ }
  }, [privateSession])

  useEffect(() => {
    const up = () => setIsOnline(true)
    const down = () => setIsOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  // Volume ramp helper — own audio.volume while fading so the volume effect
  // doesn't stomp the animation
  const fadeVolume = (to, ms) => new Promise(resolve => {
    const audio = audible()
    if (!audio) return resolve()
    // Resolve the superseded fade too — a stranded promise would leave
    // fadingRef stuck true and permanently freeze the volume control
    if (fadeRafRef.current) {
      cancelAnimationFrame(fadeRafRef.current.raf)
      fadeRafRef.current.resolve()
    }
    const from = audio.volume
    const start = performance.now()
    const tick = now => {
      const t = Math.min(1, (now - start) / ms)
      audio.volume = Math.max(0, Math.min(1, from + (to - from) * t))
      if (t < 1) fadeRafRef.current.raf = requestAnimationFrame(tick)
      else { fadeRafRef.current = null; resolve() }
    }
    fadeRafRef.current = { raf: requestAnimationFrame(tick), resolve }
  })

  // Snap volume back to user setting, cancelling any in-flight ramp
  const settleVolume = () => {
    if (fadeRafRef.current) { cancelAnimationFrame(fadeRafRef.current.raf); fadeRafRef.current.resolve(); fadeRafRef.current = null }
    fadingRef.current = false
    if (audible()) audible().volume = muted ? 0 : volume
  }

  // Redirect to discover if on root
  useEffect(() => {
    if (window.location.pathname === '/') {
      navigate('/discover', { replace: true })
    }
  }, [navigate])

  // Show toast when server status changes
  useEffect(() => {
    if (serverStatus === 'online' && healthError === false) {
      // Server came back online
    }
  }, [serverStatus, healthError])

  // Record play history + counts — shared by the primary 'playing' handler
  // and the crossfade commit (the incoming element's 'playing' fires before
  // listeners rebind to it, so the commit must record the play itself).
  const recordPlayStats = (s, dur) => {
    if (!s?.id) return
    if (countedPlayRef.current === s.id) return // already counted this listen
    if (privateSessionRef.current) return // private session — record nothing
    countedPlayRef.current = s.id
    try {
      const pc = readKey('playCounts', {})
      const prevPc = pc[s.id] || {}
      pc[s.id] = { ...(slimSong(s) || { id: s.id, name: s.name }), count: (prevPc.count || 0) + 1, ts: Date.now() }
      localStorage.setItem('playCounts', JSON.stringify(pc))
      const prev = readKey('playHistory', [])
      if (prev[0]?.id === s.id) { setHistoryVersion(v => v + 1); return }
      const entry = {
        id: s.id, name: s.name, artist: s.artist, album: s.album,
        albumId: s.albumId, image: s.imageUrl || s.artworkUrl,
        duration: Math.round(dur) || 0, ts: Date.now()
      }
      localStorage.setItem('playHistory', JSON.stringify([entry, ...prev].slice(0, 200)))
      setHistoryVersion(v => v + 1) // triggers the debounced sync push
    } catch { /* history is best-effort */ }
  }

  // ─── Dual-element crossfade ───
  // Ownership: while xfadeRef is set, ONLY the ramp writes volumes and the
  // commit/abort paths touch the elements — the playback effect's volume
  // line is fenced off via fadingRef so a dep-change can't stomp the fade.

  const startCrossfade = () => {
    const sec = xfadeSecRef.current
    if (!sec || xfadeRef.current) return
    const nextIdx = getNextQueueIndex()
    if (nextIdx === null) return // queue end → autoplay/ended path owns it
    const nextSong = queue[nextIdx]
    if (!nextSong?.id || isLocalSong(nextSong)) return
    const outEl = audible()
    const inEl = idleEl()
    if (!outEl || !inEl) return
    if (audioGraphOn()) enableEq(inEl)
    const bitrate = currentBitrate
    inEl.src = streamUrlFor(nextSong, bitrate)
    inEl.volume = 0
    const epoch = queueEpochRef.current
    const target = muted ? 0 : volume
    const base = outEl.volume
    inEl.play().then(() => {
      // User replaced the queue while the stream spun up — drop the element
      if (queueEpochRef.current !== epoch) { inEl.pause(); try { inEl.removeAttribute('src') } catch {} return }
      xfadeRef.current = { outEl, inEl, nextIdx, song: nextSong, bitrate, epoch, raf: 0 }
      fadingRef.current = true // fence the playback effect's volume writes
      const start = performance.now()
      const durMs = sec * 1000
      const tick = now => {
        const x = xfadeRef.current
        if (!x) return
        // Any queue mutation during the fade (skip, tap, clear) aborts it —
        // the epoch contract already covers every mutation path.
        if (queueEpochRef.current !== epoch) { abortXfade(); return }
        const t = Math.min(1, (now - start) / durMs)
        outEl.volume = Math.max(0, base * (1 - t))
        inEl.volume = target * t
        if (t < 1 && !outEl.ended) x.raf = requestAnimationFrame(tick)
        else commitXfade()
      }
      xfadeRef.current.raf = requestAnimationFrame(tick)
    }).catch(() => {
      // Autoplay policy / decode failure — degrade to a hard cut; the normal
      // `ended` listener still advances the queue when outEl finishes.
      xfadeRef.current = null
      try { inEl.pause(); inEl.removeAttribute('src'); inEl.load() } catch {}
    })
  }

  const commitXfade = () => {
    const x = xfadeRef.current
    if (!x) return
    xfadeRef.current = null
    if (x.raf) cancelAnimationFrame(x.raf)
    const { outEl, inEl, nextIdx, song, bitrate } = x
    outEl.pause()
    try { outEl.currentTime = 0; outEl.removeAttribute('src'); outEl.load() } catch {}
    // Swap roles BEFORE state updates — listeners/handlers rebound on this
    // render must target the element that's actually producing sound.
    activeElRef.current = 1 - activeElRef.current
    setActiveEl(activeElRef.current)
    fadingRef.current = false
    inEl.volume = muted ? 0 : volume
    // Advance queue state — mirrors handleNext's bookkeeping minus the
    // src-load (the incoming element is already playing the next track).
    if (shuffle && shuffleOrder.length > 0) setShufflePos(p => Math.min(p + 1, shuffleOrder.length - 1))
    setQueueIndex(nextIdx)
    autoplayAttemptedRef.current = false
    previousBitrateRef.current = bitrate
    setCurrentBitrate(bitrate)
    setCurrentTime(0)
    setDuration(inEl.duration || Number(song.duration) || 0)
    setCurrentSong({
      ...song,
      album: typeof song.album === 'object' ? song.album.name : song.album,
      artist: song.artist || song.artists?.primary?.[0]?.name,
      albumId: song.album?.id || song.albumId,
      streamUrl: streamUrlFor(song, bitrate),
      downloadUrl: song.downloadUrl,
      imageUrl: song.imageUrl || getSongArtwork(song),
      maxBitrate: getMaxBitrate(getConnectionType(), dataSaverRef.current ? 'low-data' : qualityPreference),
      isLocal: isLocalSong(song),
      isStream: true
    })
    setIsPlaying(true)
    recordPlayStats(song, inEl.duration || song.duration)
  }

  const abortXfade = () => {
    const x = xfadeRef.current
    if (!x) return
    xfadeRef.current = null
    if (x.raf) cancelAnimationFrame(x.raf)
    try { x.inEl.pause(); x.inEl.removeAttribute('src'); x.inEl.load() } catch {}
    // Restore the outgoing element — it stays the audible one
    if (!x.outEl.paused) x.outEl.volume = muted ? 0 : volume
    fadingRef.current = false
  }

  // Handle audio playback
  useEffect(() => {
    if (!audible()) return

    const audio = audible()

    // Configure audio for iOS background playback
    audio.preload = 'auto'

    if (currentSong) {
      let streamUrl
      if (currentSong.isStream && currentSong.streamUrl) {
        streamUrl = currentSong.streamUrl
        // Prepend API_BASE if streamUrl is a relative path
        if (streamUrl.startsWith('/')) {
          streamUrl = `${API_BASE}${streamUrl}`
        }
      }

      if (streamUrl && audio.src !== streamUrl) {
        audio.src = streamUrl
        audio.load()
      }
      if (!fadingRef.current) audio.volume = muted ? 0 : volume
      try { localStorage.setItem('volume', String(volume)) } catch { /* quota */ }

      if (isPlaying) {
        audio.play().catch(e => {
          console.error('Play error:', e)
          showToastMessage('Failed to play audio. The stream URL may be invalid.', 'error')
        })
      } else {
        audio.pause()
        settleVolume() // pause mid-fade: snap back to the user's volume
      }

      // Set Media Session API metadata for lock screen/controls
      if ('mediaSession' in navigator && currentSong) {
        const artwork = getSongArtwork(currentSong)
        
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentSong.name,
          artist: currentSong.artist,
          album: currentSong.album || 'Unknown Album',
          artwork: artwork ? [{ src: artwork, sizes: '600x600', type: 'image/jpeg' }] : []
        })
        
        navigator.mediaSession.setActionHandler('play', handleTogglePlay)
        navigator.mediaSession.setActionHandler('pause', handleTogglePlay)
        navigator.mediaSession.setActionHandler('previoustrack', handlePrev)
        navigator.mediaSession.setActionHandler('nexttrack', handleNext)
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime != null && audible()) {
            audible().currentTime = details.seekTime
            setCurrentTime(details.seekTime)
          }
        })
        try {
          navigator.mediaSession.setActionHandler('seekbackward', (d) => {
            if (audible()) audible().currentTime = Math.max(0, audible().currentTime - (d.seekOffset || 10))
          })
          navigator.mediaSession.setActionHandler('seekforward', (d) => {
            if (audible()) audible().currentTime = Math.min(audible().duration || 0, audible().currentTime + (d.seekOffset || 10))
          })
        } catch { /* older browsers lack these actions */ }
      }
    } else {
      // Clear media session when no song is playing
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null
      }
    }

    // Add error event listener for audio loading errors
    const handleError = (e) => {
      console.error('Audio error:', e)
      showToastMessage('Failed to play audio. The stream URL may be invalid.', 'error')
      setIsPlaying(false)
    }

    // Add timeupdate event listener for progress tracking and adaptive bitrate
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
      // Keep lock-screen/control-center seek bar in sync (Android, iOS 18+)
      if (audio.duration > 0) {
        try {
          navigator.mediaSession?.setPositionState?.({
            duration: audio.duration,
            playbackRate: audio.playbackRate || 1,
            position: Math.min(audio.currentTime, audio.duration)
          })
        } catch { /* unsupported */ }
      }

      // Count the play only after a real listen — 30s or half the song,
      // whichever comes first (Spotify counts a stream at ~30s). Skips
      // before this threshold don't feed playCounts/history/Daily Mixes.
      if (currentSong?.id && audio.duration > 0 &&
          audio.currentTime >= Math.min(30, audio.duration * 0.5)) {
        recordPlayStats(currentSong, audio.duration)
      }

      // Adaptive bitrate: upgrade based on buffer health (less aggressive).
      // Skipped for local songs (endpoint ignores bitrate), downloaded songs
      // (they always stream the cached 96k copy), and when offline (the
      // upgraded URL is a cache miss — swapping src would kill playback).
      const offlineOrPinned = navigator.onLine === false || isDownloaded(currentSong?.id)
      if (currentSong && currentSong.maxBitrate && !isLocalSong(currentSong) && !offlineOrPinned && currentBitrate < currentSong.maxBitrate) {
        const buffered = audio.buffered
        if (buffered.length > 0) {
          const bufferEnd = buffered.end(buffered.length - 1)
          const bufferAhead = bufferEnd - audio.currentTime
          
          // Only upgrade if buffer is healthy and we haven't recently switched
          if (bufferAhead > 15 && currentBitrate === 96 && previousBitrateRef.current === 96) {
            // Clear any pending switch
            if (bitrateSwitchTimeoutRef.current) {
              clearTimeout(bitrateSwitchTimeoutRef.current)
            }
            // Debounce the switch to prevent rapid changes
            bitrateSwitchTimeoutRef.current = setTimeout(() => {
              setCurrentBitrate(160)
            }, 2000)
          }
          // Upgrade to max bitrate after 20 seconds buffer (was 10)
          if (bufferAhead > 20 && currentBitrate === 160 && previousBitrateRef.current === 160) {
            if (bitrateSwitchTimeoutRef.current) {
              clearTimeout(bitrateSwitchTimeoutRef.current)
            }
            bitrateSwitchTimeoutRef.current = setTimeout(() => {
              setCurrentBitrate(currentSong.maxBitrate)
            }, 2000)
          }
        }
      }
      
      // Downgrade if buffer is critically low — with a 10s post-switch
      // cooldown so a just-upgraded stream isn't downgraded while it
      // rebuffers (which would loop 96↔160 on marginal connections)
      if (audio.buffered.length > 0 && !isLocalSong(currentSong)) {
        const bufferEnd = audio.buffered.end(audio.buffered.length - 1)
        const bufferAhead = bufferEnd - audio.currentTime
        if (bufferAhead < 1.5 && currentBitrate > 96 && Date.now() - (lastSwitchAtRef.current || 0) > 10000) {
          if (bitrateSwitchTimeoutRef.current) {
            clearTimeout(bitrateSwitchTimeoutRef.current)
          }
          lastSwitchAtRef.current = Date.now()
          setCurrentBitrate(96)
        }
      }

      // Warm the next track's stream endpoint near song end (gapless handoff).
      // Skipped on metered/slow connections — the SW turns this Range probe
      // into a full-file download, which wastes mobile data. Data-saver mode
      // suppresses it entirely (that's the point of the mode).
      const conn = navigator.connection
      const metered = conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === '3g' || dataSaverRef.current
      if (currentSong && audio.duration > 0 && audio.duration - audio.currentTime < 15 && !metered) {
        const nextIdx = getNextQueueIndex()
        if (nextIdx !== null && warmedNextRef.current !== queue[nextIdx]?.id) {
          const nextSong = queue[nextIdx]
          warmedNextRef.current = nextSong.id
          fetch(streamUrlFor(nextSong, currentBitrate), { headers: { Range: 'bytes=0-1' } })
            .catch(() => {}) // warming is best-effort
        } else if (nextIdx === null && autoplayEnabled && !autoplayAttemptedRef.current &&
                   pendingSuggestionsRef.current?.seedId !== currentSong.id) {
          // Queue is about to end — prefetch suggestions so the autoplay
          // extension doesn't cold-start with a fetch gap
          fetchSuggestions(currentSong.id).then(songs => {
            if (songs.length) pendingSuggestionsRef.current = { seedId: currentSong.id, songs }
          })
        }
      }

      // Crossfade handoff — start the next track on the idle element while
      // this one fades out. Natural advances only: queue-end stays with the
      // ended/autoplay path, repeat-one replays itself, local files skip.
      if (xfadeSecRef.current > 0 && !xfadeRef.current && !fadingRef.current &&
          audio.duration > xfadeSecRef.current + 2 &&
          audio.duration - audio.currentTime <= xfadeSecRef.current) {
        startCrossfade()
      }
    }

    // Add loadedmetadata event listener for duration (+ pending resume seek)
    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      if (pendingSeekRef.current !== null) {
        audio.currentTime = pendingSeekRef.current
        pendingSeekRef.current = null
      }
    }

    // Record play history only when playback actually starts
    const handlePlaying = () => {
      // Smooth transitions: fade in only at a track START — `playing` also
      // fires on resume/rebuffer where a dip would be a mid-song volume drop
      if (smoothTransitions && !muted && volume > 0 && audio.currentTime < 1) {
        fadingRef.current = true
        audio.volume = 0
        fadeVolume(volume, 500).then(() => {
          fadingRef.current = false
          // Mute/volume changes during the ramp are skipped while fading —
          // re-apply the live setting when it lands
          audio.volume = muted ? 0 : volume
        })
      }
    }

    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('playing', handlePlaying)

    return () => {
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('playing', handlePlaying)
    }
  }, [currentSong, isPlaying, volume, muted, currentBitrate, queue, queueIndex, shuffle, shuffleOrder, shufflePos, repeat, autoplayEnabled, smoothTransitions, activeEl])

  // Handle shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input field or interacting with a
      // focused control (Space on a button/row activates it AND would toggle
      // playback otherwise — double-fire)
      if (!(e.target instanceof Element) ||
          e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
          e.target.closest('button, a, [role="button"], select')) {
        return
      }

      // / or Cmd+K / Ctrl+K jumps to search (Spotify's quick-switcher)
      if (e.code === 'Slash' || (e.code === 'KeyK' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault()
        navigate('/search')
        setTimeout(() => inputRef.current?.focus(), 50)
        return
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handleTogglePlay()
          break
        case 'ArrowRight':
          e.preventDefault()
          handleNext()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handlePrev()
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(v => Math.min(1, v + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(v => Math.max(0, v - 0.1))
          break
        case 'KeyM':
          e.preventDefault()
          handleMuteToggle()
          break
        case 'KeyS':
          e.preventDefault()
          handleShuffleToggle()
          break
        case 'KeyR':
          e.preventDefault()
          setRepeat(r => repeatCycle(r))
          break
        case 'KeyL':
          e.preventDefault()
          if (currentSong) {
            handleLikeToggle(currentSong.id, currentSong)
          }
          break
        case 'Digit0':
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5':
        case 'Digit6':
        case 'Digit7':
        case 'Digit8':
        case 'Digit9':
          e.preventDefault()
          const percent = parseInt(e.code.replace('Digit', '')) * 10
          if (duration > 0) {
            handleSeek((percent / 100) * duration)
          }
          break
        case 'Home':
          e.preventDefault()
          handleSeek(0)
          break
        case 'End':
          e.preventDefault()
          if (duration > 0) {
            handleSeek(duration)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentSong, duration, queue, queueIndex, shuffle, shuffleOrder, shufflePos, repeat, autoplayEnabled])

  // Handle song end / repeat
  useEffect(() => {
    if (!audible()) return
    const el = audible()
    const onEnded = () => {
      if (xfadeRef.current) { commitXfade(); return } // outgoing ended mid-fade — the crossfade owns the advance
      // A finished song always counts as a listen, however short. Reset the
      // counted marker so a repeat-one replay earns a fresh count.
      recordPlayStats(currentSong, el.duration || currentSong?.duration)
      countedPlayRef.current = null
      if (sleepTimerRef.current?.type === 'eot') {
        setSleepTimer(null)
        setIsPlaying(false)
        showToastMessage('Sleep timer — playback stopped', 'success')
        return
      }
      if (repeat === 'one' && currentSong) {
        el.currentTime = 0
        el.play().catch(e => console.error('Repeat play error:', e))
      } else {
        handleNext()
      }
    }
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [repeat, currentSong, queue, queueIndex, shuffle, shuffleOrder, shufflePos, autoplayEnabled, activeEl])

  // Handle visibility change - resume playback when app returns from background (iOS/Android)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying && audible()) {
        audible().play().catch(e => console.error('Resume play error:', e))
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isPlaying])

  // Detect connection type and set initial bitrate
  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
    if (connection) {
      const handleConnectionChange = () => {
        const connType = getConnectionType()
        const maxBitrate = getMaxBitrate(connType, dataSaverRef.current ? 'low-data' : qualityPreference)
        console.log('Connection changed:', connType, 'Max bitrate:', maxBitrate)
      }

      connection.addEventListener('change', handleConnectionChange)
      return () => connection.removeEventListener('change', handleConnectionChange)
    }
  }, [qualityPreference])

  // Save quality preference to localStorage
  useEffect(() => {
    localStorage.setItem('qualityPreference', qualityPreference)
  }, [qualityPreference])

  // Persist playback session (throttled while playing + on unload)
  useEffect(() => {
    const writeSession = () => {
      try {
        if (!currentSong) return
        // Persist a window around the cursor — autoplay can grow the queue
        // unboundedly and we share ~5MB with the TanStack query persister
        const start = Math.max(0, queueIndex - 10)
        const windowedQueue = queue.slice(start, queueIndex + 50)
        localStorage.setItem('playerSession', JSON.stringify({
          queue: windowedQueue,
          queueIndex: queueIndex - start,
          currentSong,
          currentTime: audible()?.currentTime ?? currentTime,
          repeat, shuffle, ts: Date.now()
        }))
      } catch { /* quota — session resume is best-effort */ }
    }
    const interval = setInterval(() => {
      if (isPlaying) writeSession()
    }, 5000)
    window.addEventListener('beforeunload', writeSession)
    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', writeSession)
    }
  }, [isPlaying, currentSong, queue, queueIndex, repeat, shuffle])

  // Offer to resume a session saved within the last 24h — ONCE per browser
  // session (sessionStorage flag) and auto-dismissed, so it stops nagging
  // on every reload while still offering the restore on a genuine reopen.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('resumePromptShown')) return
      const raw = localStorage.getItem('playerSession')
      if (!raw) return
      const session = JSON.parse(raw)
      if (session?.currentSong?.id && Date.now() - session.ts < 24 * 60 * 60 * 1000) {
        sessionStorage.setItem('resumePromptShown', '1')
        setResumeSession(session)
      } else {
        localStorage.removeItem('playerSession')
      }
    } catch {
      localStorage.removeItem('playerSession')
    }
  }, [])

  // Auto-dismiss the resume banner after 12s — it must not linger over the
  // song list like a broken mini-player. Also clear it the moment playback
  // actually starts by other means.
  useEffect(() => {
    if (!resumeSession) return
    if (currentSong) { setResumeSession(null); return }
    const t = setTimeout(() => setResumeSession(null), 12000)
    return () => clearTimeout(t)
  }, [resumeSession, currentSong])

  const handleResumeSession = async () => {
    const session = resumeSession
    setResumeSession(null)
    if (!session?.currentSong) return
    // Resume inside a click gesture — wake the EQ context or playback is silent
    if (audioGraphOn()) enableEq(audible())

    // Replace of the whole queue — abort any in-flight autoplay/radio fetch
    queueEpochRef.current++
    autoplayAttemptedRef.current = false
    autoplayToastShownRef.current = false
    pendingSuggestionsRef.current = null

    setQueue(session.queue || [])
    setQueueIndex(session.queueIndex ?? 0)
    setRepeat(session.repeat || 'off')
    const restoredShuffle = !!session.shuffle
    setShuffle(restoredShuffle)
    if (restoredShuffle && session.queue?.length) {
      setShuffleOrder(buildShuffleOrder(session.queue.length, session.queueIndex ?? 0))
      setShufflePos(0)
    }

    // Rebuild the stream URL deterministically — never trust persisted URLs
    const song = session.currentSong
    const maxBitrate = getMaxBitrate(getConnectionType(), dataSaverRef.current ? 'low-data' : qualityPreference)
    const startBitrate = startBitrateFor(maxBitrate, getConnectionType())
    pendingSeekRef.current = session.currentTime || 0
    previousBitrateRef.current = startBitrate
    warmedNextRef.current = null
    setCurrentBitrate(startBitrate)
    setCurrentSong({
      ...song,
      streamUrl: streamUrlFor(song, startBitrate),
      maxBitrate,
      isStream: true
    })
    setIsPlaying(true)
    setCurrentTime(session.currentTime || 0)
    localStorage.removeItem('playerSession')

    // Same non-blocking enrichment as handleSongSelect
    if (!song.downloadUrl && song.id) {
      const albumId = song.album?.id || song.albumId
      const url = albumId
        ? `${API_BASE}/api/song/${song.id}?albumId=${albumId}`
        : `${API_BASE}/api/song/${song.id}`
      fetch(url)
        .then(res => res.json())
        .then(result => {
          if (result.success && result.data) {
            setCurrentSong(prev => prev?.id === song.id ? {
              ...prev,
              downloadUrl: result.data.downloadUrl,
              albumId: result.data.albumId || prev.albumId
            } : prev)
          }
        })
        .catch(() => {})
    }
  }

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    let timeoutId
    const handleScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const scrollable = scrollContainerRef.current
        const scrollPosition = scrollable ? scrollable.scrollTop : window.scrollY
        scrollPositionStorage.set(location.pathname, scrollPosition)
      }, 100)
    }

    const scrollable = scrollContainerRef.current
    if (scrollable) {
      scrollable.addEventListener('scroll', handleScroll)
    }
    window.addEventListener('scroll', handleScroll)

    return () => {
      clearTimeout(timeoutId)
      if (scrollable) {
        scrollable.removeEventListener('scroll', handleScroll)
      }
      window.removeEventListener('scroll', handleScroll)
    }
  }, [location.pathname])

  // Restore scroll position when location changes
  useEffect(() => {
    const savedPosition = scrollPositionStorage.get(location.pathname)
    if (savedPosition && savedPosition > 0) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const scrollable = scrollContainerRef.current
        if (scrollable) {
          scrollable.scrollTop = savedPosition
        } else {
          window.scrollTo(0, savedPosition)
        }
      }, 100)
    }
  }, [location.pathname])

  // Handle bitrate switching - swap audio.src directly, restore position
  // (local songs skip: the endpoint ignores bitrate for local files)
  useEffect(() => {
    if (!audible() || !currentSong?.id || !currentSong.isStream) return
    if (isLocalSong(currentSong)) return
    if (currentBitrate === previousBitrateRef.current) return

    const audio = audible()
    const pos = audio.currentTime
    const wasPlaying = !audio.paused
    const target = streamUrlFor(currentSong, currentBitrate)

    if (audio.src !== target) {
      const onMeta = () => {
        audio.currentTime = pos
        audio.removeEventListener('loadedmetadata', onMeta)
      }
      audio.addEventListener('loadedmetadata', onMeta)
      audio.src = target
      audio.load()
      if (wasPlaying) {
        audio.play().catch(e => console.error('Play error after bitrate switch:', e))
      }
      // Keep streamUrl in sync with what's loaded so the playback effect
      // doesn't snap src back to the stale bitrate URL on its next run
      setCurrentSong(prev => prev?.id === currentSong.id ? { ...prev, streamUrl: target } : prev)
    }
    previousBitrateRef.current = currentBitrate
    lastSwitchAtRef.current = Date.now()
  }, [currentBitrate, currentSong?.id])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (bitrateSwitchTimeoutRef.current) {
        clearTimeout(bitrateSwitchTimeoutRef.current)
      }
    }
  }, [])


  const navigateToView = (viewName, data = null, source = 'discover') => {
    if (viewName === 'album' && data) {
      const slug = (data.name || data.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      navigate(`/discover/album/${data.id || encodeURIComponent(data.name)}/${slug}`, { state: { album: data, source } })
    } else if (viewName === 'artist' && data) {
      navigate(`/discover/artist/${data.id}`, { state: { artist: data, source } })
    } else {
      navigate(`/${viewName}`)
    }
  }

  // The queue index that would actually play next under current shuffle/repeat
  // (no side effects — used by next-track warming; handleNext has its own path)
  const getNextQueueIndex = () => {
    if (queue.length === 0) return null
    if (repeat === 'one') return null // replays itself — nothing to warm
    if (shuffle && shuffleOrder.length > 0) {
      const nextPos = shufflePos + 1
      if (nextPos < shuffleOrder.length) return shuffleOrder[nextPos]
      return repeat === 'all' ? shuffleOrder[0] : null
    }
    if (queueIndex < queue.length - 1) return queueIndex + 1
    return repeat === 'all' ? 0 : null
  }

  const handleShuffleToggle = () => {
    if (!shuffle) {
      // Enable: build permutation anchored on the current song
      setShuffleOrder(queue.length > 0 ? buildShuffleOrder(queue.length, Math.max(queueIndex, 0)) : [])
      setShufflePos(0)
      setShuffle(true)
    } else {
      setShuffle(false)
      setShuffleOrder([])
      setShufflePos(0)
    }
  }

  // ─── Queue manipulation (index-remap model) ───
  // shuffleOrder holds raw queue indices — NEVER insert into `queue` mid-list
  // while a permutation exists (indices ≥ insertion point shift silently).
  // Inserts append to `queue` end; position is expressed via shuffleOrder.

  const handlePlayNext = (song) => {
    queueEpochRef.current++
    if (queueIndex === -1 || queue.length === 0) {
      handleSongSelect(song)
      showToastMessage('Playing now', 'success')
      return
    }
    if (shuffle && shuffleOrder.length > 0) {
      const newQueue = [...queue, song]
      const newIdx = newQueue.length - 1
      const newOrder = [...shuffleOrder]
      newOrder.splice(shufflePos + 1, 0, newIdx)
      setQueue(newQueue)
      setShuffleOrder(newOrder)
    } else {
      const newQueue = [...queue]
      newQueue.splice(queueIndex + 1, 0, song)
      setQueue(newQueue)
    }
    showToastMessage('Will play next', 'success')
  }

  const handleAddToQueue = (song) => {
    queueEpochRef.current++
    if (queueIndex === -1 || queue.length === 0) {
      handleSongSelect(song)
      showToastMessage('Playing now', 'success')
      return
    }
    setQueue(prev => [...prev, song])
    if (shuffle && shuffleOrder.length > 0) {
      setShuffleOrder(prev => [...prev, queue.length])
    }
    showToastMessage('Added to queue', 'success')
  }

  const handleQueuePlayAt = (displayPos) => {
    queueEpochRef.current++ // user took over — abort any in-flight autoplay/radio commit
    abortXfade()
    const order = shuffle && shuffleOrder.length > 0 ? shuffleOrder : queue.map((_, i) => i)
    const queueIdx = order[displayPos]
    if (queueIdx === undefined) return
    if (shuffle) setShufflePos(displayPos)
    setQueueIndex(queueIdx)
    playQueueSong(queueIdx)
  }

  const handleQueueRemoveAt = (queueIdx) => {
    queueEpochRef.current++
    const removedOrderPos = shuffleOrder.indexOf(queueIdx) // position in play order (-1 if absent)
    const remap = (idx) => idx > queueIdx ? idx - 1 : idx

    if (queueIdx === queueIndex) {
      // Removing current song → advance to next in play order
      const nextIdx = getNextQueueIndex()
      const remaining = queue.filter((_, i) => i !== queueIdx)
      const newOrder = shuffleOrder.filter(i => i !== queueIdx).map(remap)
      setQueue(remaining)
      if (shuffle) setShuffleOrder(newOrder)
      if (remaining.length === 0) {
        setQueueIndex(-1)
        setCurrentSong(null)
        setIsPlaying(false)
        return
      }
      if (nextIdx === null || nextIdx === undefined) {
        // Removed the last song — mirror handleNext: autoplay can still
        // extend from the removed song before we give up and stop
        if (repeat !== 'one' && autoplayEnabled && currentSong) {
          extendQueue(currentSong)
          return
        }
        if (repeat === 'one' && remaining.length > 0) {
          const replay = remap(Math.min(queueIndex, remaining.length - 1))
          setQueueIndex(replay)
          playQueueSong(replay, remaining)
          return
        }
        setQueueIndex(-1)
        setCurrentSong(null)
        setIsPlaying(false)
        return
      }
      const remapped = remap(nextIdx)
      setQueueIndex(remapped)
      if (shuffle) {
        // The dropped entry sat at shufflePos; the next item shifts into that
        // slot — unless it wrapped around (repeat-all), where it's position 0
        setShufflePos(shufflePos < newOrder.length ? shufflePos : 0)
      }
      playQueueSong(remapped, remaining) // queue state is stale here — pass the new array
      return
    }
    const newQueue = queue.filter((_, i) => i !== queueIdx)
    setQueue(newQueue)
    setQueueIndex(remap(queueIndex))
    if (shuffle) {
      setShuffleOrder(shuffleOrder.filter(i => i !== queueIdx).map(remap))
      // If the removed entry preceded the current one in play order,
      // the current song's position shifts down
      if (removedOrderPos !== -1 && removedOrderPos < shufflePos) {
        setShufflePos(prev => prev - 1)
      }
    }
  }

  const handleQueueMove = (displayPos, dir) => {
    queueEpochRef.current++
    const to = displayPos + dir
    if (shuffle && shuffleOrder.length > 0) {
      if (to < 0 || to >= shuffleOrder.length) return
      // Moving an unplayed song to/before the cursor drops it into the
      // played prefix — never reached again. Clamp at the boundary.
      if (displayPos > shufflePos && to <= shufflePos) return
      const newOrder = [...shuffleOrder]
      ;[newOrder[displayPos], newOrder[to]] = [newOrder[to], newOrder[displayPos]]
      setShuffleOrder(newOrder)
      // If we swapped the current position, track it
      if (shufflePos === displayPos) setShufflePos(to)
      else if (shufflePos === to) setShufflePos(displayPos)
    } else {
      if (to < 0 || to >= queue.length) return
      if (displayPos > queueIndex && to <= queueIndex) return
      const newQueue = [...queue]
      ;[newQueue[displayPos], newQueue[to]] = [newQueue[to], newQueue[displayPos]]
      setQueue(newQueue)
      if (queueIndex === displayPos) setQueueIndex(to)
      else if (queueIndex === to) setQueueIndex(displayPos)
    }
  }

  // Drag-to-position: splice the row to a new slot and remap the play cursor
  const handleQueueMoveTo = (fromPos, toPos) => {
    queueEpochRef.current++
    const remap = (cursor, from, to) =>
      cursor === from ? to : (from < cursor && to >= cursor) ? cursor - 1 : (from > cursor && to <= cursor) ? cursor + 1 : cursor
    if (shuffle && shuffleOrder.length > 0) {
      if (toPos < 0 || toPos >= shuffleOrder.length || fromPos === toPos) return
      if (fromPos > shufflePos && toPos <= shufflePos) return
      const newOrder = [...shuffleOrder]
      const [moved] = newOrder.splice(fromPos, 1)
      newOrder.splice(toPos, 0, moved)
      setShuffleOrder(newOrder)
      setShufflePos(remap(shufflePos, fromPos, toPos))
    } else {
      if (toPos < 0 || toPos >= queue.length || fromPos === toPos) return
      if (fromPos > queueIndex && toPos <= queueIndex) return
      const newQueue = [...queue]
      const [moved] = newQueue.splice(fromPos, 1)
      newQueue.splice(toPos, 0, moved)
      setQueue(newQueue)
      setQueueIndex(remap(queueIndex, fromPos, toPos))
    }
  }

  const handleQueueClear = () => {
    queueEpochRef.current++
    if (!currentSong) {
      setQueue([])
      setQueueIndex(-1)
      setShuffleOrder([])
      setShufflePos(0)
      return
    }
    // Spotify clears upcoming only — current song keeps playing
    setQueue([currentSong])
    setQueueIndex(0)
    if (shuffle) {
      setShuffleOrder([0])
      setShufflePos(0)
    }
    showToastMessage('Queue cleared', 'success')
  }

  const handleShufflePlay = (songs) => {
    if (!songs || songs.length === 0) return
    const ctx = blockedCtx()
    const playable = songs.filter(s => !isContentBlocked(s, ctx))
    if (playable.length === 0) {
      showToastMessage('Nothing playable — hidden content filtered', 'warning')
      return
    }
    const startIdx = Math.floor(Math.random() * playable.length)
    setShuffle(true)
    handleSongSelect(playable[startIdx], playable, startIdx, true)
  }

  const handleGoToAlbum = (song) => {
    const albumId = song.albumId || (typeof song.album === 'object' ? song.album?.id : null)
    const albumName = typeof song.album === 'object' ? song.album?.name : song.album
    if (albumId) navigateToView('album', { id: albumId, name: albumName })
  }

  // ─── Autoplay + Radio ───

  const fetchSuggestions = async (songId) => {
    try {
      const res = await fetch(`${API_BASE}/api/songs/${songId}/suggestions`)
      const json = await res.json()
      return json?.success ? (json.data || []) : []
    } catch {
      return []
    }
  }

  // Dedup suggestions against queue + recent history, and drop blocked
  // content — autoplay/radio are passive surfaces so hidden songs/artists
  // and (when enabled) explicit tracks must never enter the queue here.
  const pickSuggestions = (candidates, baseQueue) => {
    let history = []
    try { history = JSON.parse(localStorage.getItem('playHistory') || '[]').slice(0, 20) } catch {}
    const seen = new Set([...baseQueue.map(s => s.id), ...history.map(h => h.id)])
    const ctx = blockedCtx()
    return candidates.filter(s => s?.id && !seen.has(s.id) && !isContentBlocked(s, ctx)).slice(0, 20)
  }

  // Append similar songs at queue end and keep playing. Returns true on success.
  const extendQueue = async (seedSong) => {
    if (autoplayAttemptedRef.current) return false
    autoplayAttemptedRef.current = true
    const bail = () => { autoplayAttemptedRef.current = false; return false }

    const epoch = queueEpochRef.current
    const seedId = seedSong?.id
    if (!seedId) return bail()

    const candidates = pendingSuggestionsRef.current?.seedId === seedId
      ? pendingSuggestionsRef.current.songs
      : await fetchSuggestions(seedId)
    pendingSuggestionsRef.current = null

    // Queue replaced mid-fetch, or autoplay disabled while fetching — bail
    if (queueEpochRef.current !== epoch) return bail()
    if (localStorage.getItem('autoplay') === 'off') return bail()

    // Commit against LIVE state — shuffle may have been toggled mid-fetch
    const { queue: q, shuffle: sh, shuffleOrder: so, shufflePos: sp } = liveQueueRef.current
    const picked = pickSuggestions(candidates, q)
    if (picked.length === 0) return bail()

    const newQueue = [...q, ...picked]
    const newIndices = picked.map((_, i) => q.length + i)
    queueEpochRef.current++
    setQueue(newQueue)

    if (sh && so.length > 0) {
      const nextPos = sp + 1
      // Appended indices always enter the order (no orphans if shuffle was
      // just toggled on mid-fetch); nextPos lands on the next unplayed index
      setShuffleOrder([...so, ...newIndices])
      setShufflePos(nextPos)
      const nextIdx = so[nextPos] ?? newIndices[0]
      setQueueIndex(nextIdx)
      await playQueueSong(nextIdx, newQueue)
    } else {
      setQueueIndex(q.length) // old length = index of first appended song
      await playQueueSong(q.length, newQueue)
    }

    if (!autoplayToastShownRef.current) {
      autoplayToastShownRef.current = true
      showToastMessage('Playing similar songs', 'success')
    }
    return true
  }

  const handleSongRadio = (song) => {
    // Radio is ordered — a persisted global shuffle would strand appended
    // suggestions inside shuffleOrder
    setShuffle(false)
    setShuffleOrder([])
    setShufflePos(0)
    handleSongSelect(song)
    const epoch = queueEpochRef.current
    fetchSuggestions(song.id).then(candidates => {
      if (queueEpochRef.current !== epoch) return
      const picked = pickSuggestions(candidates, [song]).slice(0, 30)
      if (picked.length === 0) {
        showToastMessage("Couldn't find similar songs", 'warning')
        return
      }
      queueEpochRef.current++ // appending while a permutation may exist — keep the epoch contract
      setQueue(prev => [...prev, ...picked])
      showToastMessage('Radio started', 'success')
    })
  }

  const handleArtistRadio = (songs) => {
    if (!songs?.length) return
    // Filter the BASE pool too, not just merged suggestions — the first
    // audible song comes from `pool`, so a hidden artist would otherwise
    // start playing before the suggestion merge ever runs.
    const ctx = blockedCtx()
    const pool = songs.filter(s => !isContentBlocked(s, ctx)).slice(0, 25)
    if (!pool.length) {
      showToastMessage('Nothing playable — hidden content filtered', 'warning')
      return
    }
    const startIdx = Math.floor(Math.random() * pool.length)
    setShuffle(true)
    handleSongSelect(pool[startIdx], pool, startIdx, true)
    const epoch = queueEpochRef.current
    // Blend in suggestions seeded by the first few songs — non-blocking
    Promise.all(pool.slice(0, 3).map(s => fetchSuggestions(s.id))).then(results => {
      if (queueEpochRef.current !== epoch) return
      const seen = new Set(pool.map(s => s.id))
      const merged = []
      results.flat().forEach(s => { if (s?.id && !seen.has(s.id) && !isContentBlocked(s, ctx)) { seen.add(s.id); merged.push(s) } })
      if (merged.length === 0) return
      // The closure's `queue` is stale — after handleSongSelect it IS `pool`
      const newQueue = [...pool, ...merged]
      const newIndices = merged.map((_, i) => pool.length + i)
      queueEpochRef.current++
      setQueue(newQueue)
      setShuffleOrder(prev => [...prev, ...newIndices])
      showToastMessage('Artist radio started', 'success')
    })
  }

  const handleSongSelect = async (song, songQueue = null, songIndex = null, forceShuffle = false) => {
    // User-initiated queue change: bump epoch (aborts in-flight autoplay/radio
    // fetches), reset autoplay one-shot + toast
    queueEpochRef.current++
    autoplayAttemptedRef.current = false
    autoplayToastShownRef.current = false
    pendingSuggestionsRef.current = null
    abortXfade()

    // Filter blocked content out of queue builds (play-all, album taps,
    // shuffle). An explicit tap on a hidden row DOES play — but it plays
    // alone rather than dragging the rest of the hidden context along.
    if (songQueue) {
      const ctx = blockedCtx()
      const filtered = songQueue.filter(s => !isContentBlocked(s, ctx))
      const fi = filtered.findIndex(s => s.id === song.id)
      if (fi >= 0) { songQueue = filtered; songIndex = fi }
      else { songQueue = [song]; songIndex = 0 }
    }

    // Determine appropriate bitrate based on connection and preference
    const connType = getConnectionType()
    const maxBitrate = getMaxBitrate(connType, dataSaverRef.current ? 'low-data' : qualityPreference)
    const startBitrate = startBitrateFor(maxBitrate, connType)

    // Reset bitrate tracking for new song; start at 160 on fast connections
    previousBitrateRef.current = startBitrate
    warmedNextRef.current = null
    if (bitrateSwitchTimeoutRef.current) {
      clearTimeout(bitrateSwitchTimeoutRef.current)
    }
    setCurrentBitrate(startBitrate)

    const local = isLocalSong(song)
    setCurrentSong({
      ...song,
      album: typeof song.album === 'object' ? song.album.name : song.album,
      artist: song.artist || song.artists?.primary?.[0]?.name,
      albumId: song.album?.id || song.albumId,
      streamUrl: streamUrlFor(song, startBitrate),
      maxBitrate,
      isLocal: local,
      isStream: true
    })

    if (songQueue && songIndex !== null) {
      setQueue(songQueue)
      setQueueIndex(songIndex)
      if (shuffle || forceShuffle) {
        setShuffleOrder(buildShuffleOrder(songQueue.length, songIndex))
        setShufflePos(0)
      }
    } else {
      // Selected without a queue — don't let Next teleport into a stale one
      setQueue([song])
      setQueueIndex(0)
      if (shuffle || forceShuffle) {
        setShuffleOrder([0])
        setShufflePos(0)
      }
    }
    if (audioGraphOn()) enableEq(audible())
    setIsPlaying(true)
    setCurrentTime(0)

    // Enrich with downloadUrl/albumId/imageUrl without blocking playback
    if (!song.downloadUrl && song.id) {
      const albumId = song.album?.id || song.albumId
      const url = albumId
        ? `${API_BASE}/api/song/${song.id}?albumId=${albumId}`
        : `${API_BASE}/api/song/${song.id}`
      fetch(url)
        .then(res => res.json())
        .then(result => {
          if (result.success && result.data) {
            setCurrentSong(prev => prev?.id === song.id ? {
              ...prev,
              downloadUrl: result.data.downloadUrl,
              albumId: result.data.albumId || prev.albumId
            } : prev)
          }
        })
        .catch(() => {}) // enrichment is best-effort
    }
  }

  const handlePrev = async () => {
    abortXfade()
    if (audible() && audible().currentTime > 3) {
      audible().currentTime = 0
      return
    }
    if (shuffle && shuffleOrder.length > 0) {
      if (shufflePos > 0) {
        const newPos = shufflePos - 1
        const newIndex = shuffleOrder[newPos]
        setShufflePos(newPos)
        setQueueIndex(newIndex)
        await playQueueSong(newIndex)
      } else {
        audible().currentTime = 0
      }
      return
    }
    if (queue.length > 0 && queueIndex > 0) {
      const newIndex = queueIndex - 1
      setQueueIndex(newIndex)
      await playQueueSong(newIndex)
    } else if (queue.length > 0) {
      audible().currentTime = 0
    }
  }

  const handleNext = async () => {
    abortXfade()
    // Skip signal — advancing before the listen threshold (ended() arrives
    // at ~duration, so it never trips this). Skipped songs de-rank as seeds
    // for Daily/Weekly Mixes: a skip is a negative taste signal.
    try {
      const el = audible()
      if (currentSong?.id && el?.duration > 0 &&
          el.currentTime < Math.min(30, el.duration * 0.5) &&
          countedPlayRef.current !== currentSong.id) {
        const sk = readKey('skipCounts', {})
        sk[currentSong.id] = { count: (sk[currentSong.id]?.count || 0) + 1, ts: Date.now() }
        localStorage.setItem('skipCounts', JSON.stringify(sk))
      }
    } catch { /* skip tracking is best-effort */ }
    if (queue.length === 0) {
      setIsPlaying(false)
      return
    }

    if (shuffle && shuffleOrder.length > 0) {
      let nextPos = shufflePos + 1
      let order = shuffleOrder
      if (nextPos >= order.length) {
        if (repeat === 'off') {
          // Autoplay: extend the queue with similar songs instead of stopping.
          // Drop isPlaying during the fetch so the UI doesn't claim a song is
          // playing while nothing is audible
          const epoch = queueEpochRef.current
          if (autoplayEnabled && currentSong) {
            setIsPlaying(false)
            if (await extendQueue(currentSong)) return
          }
          if (queueEpochRef.current !== epoch) return // user took over mid-fetch
          setIsPlaying(false)
          return
        }
        // repeat 'all' (or manual nav under 'one'): reshuffle, avoid immediate repeat
        order = buildShuffleOrder(queue.length)
        if (order[0] === queueIndex && order.length > 1) {
          ;[order[0], order[1]] = [order[1], order[0]]
        }
        setShuffleOrder(order)
        nextPos = 0
      }
      const newIndex = order[nextPos]
      setShufflePos(nextPos)
      setQueueIndex(newIndex)
      await playQueueSong(newIndex)
      return
    }

    // If at end of queue and repeat is off, try autoplay before stopping
    if (queueIndex === queue.length - 1 && repeat === 'off') {
      const epoch = queueEpochRef.current
      if (autoplayEnabled && currentSong) {
        setIsPlaying(false) // nothing is audible during the suggestion fetch
        if (await extendQueue(currentSong)) return
      }
      if (queueEpochRef.current !== epoch) return // user took over mid-fetch
      setIsPlaying(false)
      return
    }
    const newIndex = (queueIndex + 1) % queue.length
    setQueueIndex(newIndex)
    await playQueueSong(newIndex)
  }

  const handleAutoplayToggle = () => {
    setAutoplayEnabled(prev => {
      const next = !prev
      localStorage.setItem('autoplay', next ? 'on' : 'off')
      if (!next) pendingSuggestionsRef.current = null
      return next
    })
    showToastMessage(`Autoplay ${!autoplayEnabled ? 'on' : 'off'}`, 'success')
  }

  const handleTogglePlay = () => {
    abortXfade() // pausing mid-fade must silence BOTH elements
    if (audioGraphOn()) enableEq(audible()) // user gesture — resume AudioContext
    // Restart from the beginning when resuming after playback stopped at the end
    if (!isPlaying && audible() && duration > 0 &&
        audible().currentTime >= duration - 0.5) {
      audible().currentTime = 0
    }
    setIsPlaying(p => !p)
  }

  const handleSeek = (time) => {
    abortXfade()
    if (audible()) {
      audible().currentTime = time
      setCurrentTime(time)
    }
  }

  const handleMuteToggle = () => {
    setMuted(m => !m)
  }

  const playQueueSong = async (index, list = queue) => {
    autoplayAttemptedRef.current = false // re-arm before the guard — a track change resets the one-shot
    const song = list[index]
    if (!song) return
    if (audioGraphOn()) enableEq(audible())
    // Fade out the current track before swapping (smooth transitions)
    if (smoothTransitions && isPlaying && audible() && !audible().paused) {
      fadingRef.current = true
      await fadeVolume(0, 400)
      fadingRef.current = false
    }

    const connType = getConnectionType()
    const maxBitrate = getMaxBitrate(connType, dataSaverRef.current ? 'low-data' : qualityPreference)
    const startBitrate = startBitrateFor(maxBitrate, connType)

    previousBitrateRef.current = startBitrate
    warmedNextRef.current = null
    if (bitrateSwitchTimeoutRef.current) {
      clearTimeout(bitrateSwitchTimeoutRef.current)
    }
    setCurrentBitrate(startBitrate)

    const local = isLocalSong(song)
    setCurrentSong({
      ...song,
      album: typeof song.album === 'object' ? song.album.name : song.album,
      streamUrl: streamUrlFor(song, startBitrate),
      downloadUrl: song.downloadUrl,
      albumId: song.album?.id || song.albumId,
      imageUrl: song.imageUrl || getSongArtwork(song),
      artist: song.artist || song.artists?.primary?.[0]?.name,
      maxBitrate,
      isLocal: local,
      isStream: true
    })
    setIsPlaying(true)
    setCurrentTime(0)

    // Enrich with downloadUrl non-blocking (dev download feature)
    if (!song.downloadUrl && song.id) {
      const albumId = song.album?.id || song.albumId
      const url = albumId
        ? `${API_BASE}/api/song/${song.id}?albumId=${albumId}`
        : `${API_BASE}/api/song/${song.id}`
      fetch(url)
        .then(res => res.json())
        .then(result => {
          if (result.success && result.data) {
            setCurrentSong(prev => prev?.id === song.id ? {
              ...prev,
              downloadUrl: result.data.downloadUrl,
              albumId: result.data.albumId || prev.albumId
            } : prev)
          }
        })
        .catch(() => {})
    }
  }

  const handleLikeToggle = (songId, song) => {
    requireAuth(() => {
      setLikedSongs(prev => {
        const newSet = new Set(prev)
        // likedMeta keeps display metadata so local-collection or delisted
        // songs still render in Liked Songs when the API can't resolve them
        const meta = (() => { try { return JSON.parse(localStorage.getItem('likedMeta') || '{}') } catch { return {} } })()
        if (newSet.has(songId)) {
          newSet.delete(songId)
          delete meta[songId]
          addTombstone('songs', songId)
        } else {
          newSet.add(songId)
          const slim = song ? slimSong(song) : null
          if (slim) meta[songId] = { ...slim, likedAt: Date.now() }
          clearTombstone('songs', songId)
        }
        localStorage.setItem('likedSongs', JSON.stringify([...newSet]))
        try { localStorage.setItem('likedMeta', JSON.stringify(meta)) } catch { /* quota */ }
        return newSet
      })
    }, () => showToastMessage('Sign in to save songs to your library'))
  }

  const handleArtworkClick = async () => {
    console.log('handleArtworkClick called, currentSong:', currentSong)
    if (currentSong && currentSong.albumId) {
      const slug = (currentSong.album || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      navigate(`/discover/album/${currentSong.albumId}/${slug}`)
    } else if (currentSong && currentSong.album && currentSong.name) {
      // Fallback: search for album
      setIsSearchingAlbum(true)
      try {
        const searchQuery = `${currentSong.album} ${currentSong.name}`
        const res = await fetch(`${VERCEL_API_BASE || API_BASE}/api/search?q=${encodeURIComponent(searchQuery)}`)
        const result = await res.json()
        
        if (result.success && result.data.albums) {
          // Check if song exists in any album
          for (const album of result.data.albums) {
            try {
              const albumRes = await fetch(`${API_BASE}/api/album/${album.id}`)
              const albumData = await albumRes.json()
              
              if (albumData.success && albumData.data.songs) {
                const songExists = albumData.data.songs.some(s => s.id === currentSong.id)
                if (songExists) {
                  // Found the album, navigate and update currentSong
                  setCurrentSong(prev => ({ ...prev, albumId: album.id }))
                  const slug = (album.name || album.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                  navigate(`/discover/album/${album.id}/${slug}`)
                  setIsSearchingAlbum(false)
                  return
                }
              }
            } catch (err) {
              console.error('Error checking album:', err)
            }
          }
        }
        
        // No album found with the song
        showToastMessage('Album not found', 'error')
      } catch (err) {
        console.error('Error searching for album:', err)
        showToastMessage('Failed to search for album', 'error')
      } finally {
        setIsSearchingAlbum(false)
      }
    } else {
      console.log('No album or song name available in currentSong')
      showToastMessage('Album information not available', 'error')
    }
  }

  const searchQuery = searchParams.get('q') || ''
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery)
  const inputRef = useRef(null)

  // Sync local state with URL params
  useEffect(() => {
    setLocalSearchQuery(searchQuery)
  }, [searchQuery])

  // ─── Search typeahead ───
  const [suggestions, setSuggestions] = useState(null) // flat item list | null = closed
  const [suggestIndex, setSuggestIndex] = useState(-1)
  const suggestSeqRef = useRef(0) // stale-response guard
  const suggestBlurRef = useRef(null)

  useEffect(() => {
    const q = localSearchQuery.trim()
    if (q.length < 2) { setSuggestions(null); setSuggestIndex(-1); return }
    const seq = ++suggestSeqRef.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/search/suggestions?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        if (suggestSeqRef.current !== seq) return
        const d = json?.data || {}
        const ctx = blockedCtx()
        // Songs carry enough metadata for the full block check; artist
        // entities check the hidden-artist map by normalized name.
        const songs = (d.songs || []).filter(s => !isContentBlocked(
          { id: s.id, artist: s.primaryArtist, explicitContent: s.explicitContent }, ctx))
        const artists = (d.artists || []).filter(a => !ctx.hiddenArtists[normalizeArtistName(a.name)])
        const flat = [
          ...songs.map(s => ({ ...s, _kind: 'song' })),
          ...artists.map(a => ({ ...a, _kind: 'artist' })),
          ...(d.albums || []).map(a => ({ ...a, _kind: 'album' })),
          ...(d.playlists || []).map(p => ({ ...p, _kind: 'playlist' }))
        ]
        setSuggestions(flat.length ? flat : null)
        setSuggestIndex(-1)
      } catch {
        if (suggestSeqRef.current === seq) setSuggestions(null)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [localSearchQuery])

  const pickSuggestion = (item) => {
    setSuggestions(null)
    setSuggestIndex(-1)
    if (item._kind === 'song') {
      handleSongSelect({
        id: item.id, name: item.name,
        artist: item.primaryArtist, imageUrl: item.image,
        explicitContent: item.explicitContent
      })
    } else if (item._kind === 'artist') {
      navigate(`/discover/artist/${item.id}`)
    } else if (item._kind === 'album') {
      const slug = (item.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      navigate(`/discover/album/${item.id}/${slug}`)
    } else if (item._kind === 'playlist') {
      navigate(`/discover/playlist/${item.id}`)
    }
  }

  const handleSearchKeyDown = (e) => {
    if (!suggestions?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSuggestIndex(i => (i + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSuggestIndex(i => (i - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' && suggestIndex >= 0) { e.preventDefault(); pickSuggestion(suggestions[suggestIndex]) }
    else if (e.key === 'Escape') { setSuggestions(null); setSuggestIndex(-1) }
  }

  const renderSuggestDropdown = () => {
    if (!suggestions?.length) return null
    let idx = -1
    return (
      <div className="absolute left-0 right-0 top-full mt-2 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 max-h-80 overflow-y-auto">
        {suggestions.map((item) => {
          idx++
          const i = idx
          return (
            <button
              key={`${item._kind}-${item.id}`}
              onMouseDown={(e) => { e.preventDefault(); pickSuggestion(item) }} // mousedown beats input blur
              onMouseEnter={() => setSuggestIndex(i)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${i === suggestIndex ? 'bg-zinc-800' : ''}`}
            >
              {item.image ? (
                <img src={item.image} alt="" className={`w-8 h-8 object-cover flex-shrink-0 ${item._kind === 'artist' ? 'rounded-full' : 'rounded'}`} />
              ) : (
                <div className={`w-8 h-8 bg-zinc-800 flex items-center justify-center flex-shrink-0 ${item._kind === 'artist' ? 'rounded-full' : 'rounded'}`}>
                  <Search size={12} className="text-zinc-500" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm text-white truncate">{decodeHtmlEntities(item.name)}</div>
                <div className="text-xs text-zinc-500 truncate capitalize">
                  {item._kind}{item.primaryArtist ? ` · ${decodeHtmlEntities(item.primaryArtist)}` : ''}
                  {item.explicitContent ? ' · E' : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden flex-col md:flex-row">
      <audio
        ref={audioRef}
        className="hidden"
        playsInline
        crossOrigin="anonymous"
      />
      {/* Second element — the incoming track during a crossfade. Inert the
          rest of the time; `audible()` always resolves whichever is live. */}
      <audio
        ref={audioBRef}
        className="hidden"
        playsInline
        crossOrigin="anonymous"
      />
      
      {/* Sidebar - Hidden by default, toggled with burger menu */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-black">
            <Sidebar
              searchQuery={searchQuery}
              onSearch={q => setSearchParams({ q }, { replace: true })}
              showToast={showToastMessage}
              onClose={() => setSidebarOpen(false)}
              qualityPreference={qualityPreference}
              onQualityChange={setQualityPreference}
              autoplayEnabled={autoplayEnabled}
              onAutoplayToggle={handleAutoplayToggle}
              sleepTimer={sleepTimer}
              onSleepTimer={handleSleepTimer}
              eqSettings={eqSettings}
              onEqChange={setEqSettings}
              crossfadeSec={crossfadeSec}
              onCrossfadeChange={handleCrossfadeChange}
              dataSaver={dataSaver}
              onDataSaverToggle={handleDataSaverToggle}
              normalizeVolume={normalizeVolume}
              onNormalizeToggle={handleNormalizeToggle}
              explicitFilter={explicitFilter}
              onExplicitFilterToggle={handleExplicitFilterToggle}
              hiddenSongs={hiddenSongs}
              hiddenArtists={hiddenArtists}
              onUnhideSong={handleUnhideSong}
              onUnhideArtist={handleUnhideArtist}
              shareActivity={shareActivity}
              onShareActivityToggle={handleShareActivityToggle}
              displayName={displayName}
              onDisplayNameChange={handleDisplayNameChange}
              isSignedIn={isSignedIn}
              installPrompt={installPrompt}
              onInstall={handleInstall}
              onImportLibrary={handleImportLibrary}
              likedCount={likedSongs.size}
              privateSession={privateSession}
              onPrivateSessionToggle={setPrivateSession}
              contentLanguages={contentLanguages}
              onContentLanguageToggle={toggleContentLanguage}
            />
          </div>
        </div>
      )}
      
      {/* Desktop Sidebar - Hidden by default */}
      <div className={`hidden md:flex ${sidebarOpen ? 'w-56' : 'w-0'} transition-all duration-300 overflow-hidden`}>
        <Sidebar
          searchQuery={searchQuery}
          onSearch={q => setSearchParams({ q }, { replace: true })}
          showToast={showToastMessage}
          qualityPreference={qualityPreference}
          onQualityChange={setQualityPreference}
          autoplayEnabled={autoplayEnabled}
          onAutoplayToggle={handleAutoplayToggle}
          sleepTimer={sleepTimer}
          onSleepTimer={handleSleepTimer}
          eqSettings={eqSettings}
          onEqChange={setEqSettings}
          crossfadeSec={crossfadeSec}
          onCrossfadeChange={handleCrossfadeChange}
          dataSaver={dataSaver}
          onDataSaverToggle={handleDataSaverToggle}
              normalizeVolume={normalizeVolume}
              onNormalizeToggle={handleNormalizeToggle}
          explicitFilter={explicitFilter}
          onExplicitFilterToggle={handleExplicitFilterToggle}
          hiddenSongs={hiddenSongs}
          hiddenArtists={hiddenArtists}
          onUnhideSong={handleUnhideSong}
          onUnhideArtist={handleUnhideArtist}
          shareActivity={shareActivity}
          onShareActivityToggle={handleShareActivityToggle}
          displayName={displayName}
          onDisplayNameChange={handleDisplayNameChange}
          isSignedIn={isSignedIn}
          installPrompt={installPrompt}
          onInstall={handleInstall}
          onImportLibrary={handleImportLibrary}
          likedCount={likedSongs.size}
          privateSession={privateSession}
          onPrivateSessionToggle={setPrivateSession}
          contentLanguages={contentLanguages}
          onContentLanguageToggle={toggleContentLanguage}
        />
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Header with search bar (Spotify-style) */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 bg-zinc-950 md:border-b md:border-zinc-900 sticky top-0 z-10">
          <div className={`flex items-center flex-1 ${location.pathname === '/search' ? 'gap-2' : 'gap-4'}`}>
            {location.pathname === '/search' ? (
              <button
                onClick={() => navigate(-1)}
                className="text-zinc-400 hover:text-white transition-colors"
                title="Go back"
              >
                <ArrowLeft size={24} />
              </button>
            ) : (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden text-zinc-400 hover:text-white transition-colors"
                title="Toggle sidebar"
              >
                {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            )}
            {!sidebarOpen && (
              <>
                <button
                  onClick={() => navigate('/discover')}
                  className="hidden md:flex items-center gap-2.5 text-white font-bold text-lg hover:opacity-80 transition-opacity cursor-pointer"
                  title="Go to Discover"
                >
                  <img src="/logo.svg" alt="Torsongs" className="w-7 h-7 flex-shrink-0" />
                </button>
                <button
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="hidden md:flex text-zinc-400 hover:text-white transition-colors"
                  title="Toggle sidebar"
                >
                  <Menu size={24} />
                </button>
              </>
            )}
            {sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="hidden md:flex text-zinc-400 hover:text-white transition-colors"
                title="Close sidebar"
              >
                <X size={24} />
              </button>
            )}
            <div className="relative hidden md:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                placeholder="What do you want to listen to?"
                value={localSearchQuery}
                onChange={e => {
                  const next = e.target.value
                  setLocalSearchQuery(next)
                  if (location.pathname === '/search') {
                    setSearchParams({ q: next }, { replace: true })
                  }
                  if (next && location.pathname !== '/search') {
                    navigate(`/search?q=${encodeURIComponent(next)}`)
                  }
                }}
                onPaste={e => {
                  e.preventDefault()
                  const pastedText = e.clipboardData.getData('text')
                  const selectionStart = e.target.selectionStart
                  const selectionEnd = e.target.selectionEnd
                  const currentValue = localSearchQuery
                  const next = currentValue.slice(0, selectionStart) + pastedText + currentValue.slice(selectionEnd)
                  setLocalSearchQuery(next)
                  if (location.pathname === '/search') {
                    setSearchParams({ q: next }, { replace: true })
                  } else if (next) {
                    navigate(`/search?q=${encodeURIComponent(next)}`)
                  }
                }}
                className="w-80 bg-zinc-800/70 text-sm text-white placeholder-zinc-500 rounded-full pl-10 pr-4 py-2 outline-none border border-transparent focus:border-zinc-600 transition-colors"
                onKeyDown={handleSearchKeyDown}
                onBlur={() => { suggestBlurRef.current = setTimeout(() => setSuggestions(null), 150) }}
                onFocus={() => { clearTimeout(suggestBlurRef.current) }}
              />
              {renderSuggestDropdown()}
            </div>
            <div className="hidden md:flex items-center gap-2 ml-auto">
              <UserMenu />
            </div>
            {location.pathname === '/search' && (
              <div className="relative md:hidden flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="What do you want to listen to?"
                  value={localSearchQuery}
                  onChange={e => {
                    const next = e.target.value
                    setLocalSearchQuery(next)
                    if (location.pathname === '/search') {
                      setSearchParams({ q: next }, { replace: true })
                    }
                    if (next && location.pathname !== '/search') {
                      navigate(`/search?q=${encodeURIComponent(next)}`)
                    }
                  }}
                  onPaste={e => {
                    e.preventDefault()
                    const pastedText = e.clipboardData.getData('text')
                    const selectionStart = e.target.selectionStart
                    const selectionEnd = e.target.selectionEnd
                    const currentValue = localSearchQuery
                    const next = currentValue.slice(0, selectionStart) + pastedText + currentValue.slice(selectionEnd)
                    setLocalSearchQuery(next)
                    if (location.pathname === '/search') {
                      setSearchParams({ q: next }, { replace: true })
                    } else if (next) {
                      navigate(`/search?q=${encodeURIComponent(next)}`)
                    }
                  }}
                  className="w-full bg-zinc-800/70 text-sm text-white placeholder-zinc-500 rounded-full pl-10 pr-4 py-2 outline-none border border-transparent focus:border-zinc-600 transition-colors"
                  onKeyDown={handleSearchKeyDown}
                  onBlur={() => { suggestBlurRef.current = setTimeout(() => setSuggestions(null), 150) }}
                  onFocus={() => { clearTimeout(suggestBlurRef.current) }}
                />
                {renderSuggestDropdown()}
              </div>
            )}
          </div>
        </div>
        
        {/* Offline banner — "No internet" vs "Server unreachable" */}
        {(!isOnline || healthError) && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs font-medium text-center">
            {!isOnline
              ? 'No internet — downloaded songs still play'
              : 'Server unreachable — browsing may be limited'}
          </div>
        )}

        {/* Main Content - Add bottom padding on mobile for player and nav */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-zinc-950 pb-32 md:pb-0">
          <ErrorBoundary resetKey={location.pathname}>
          <Routes>
            <Route path="/discover" element={<DiscoverView presenceMembers={presenceMembers} onSongClick={handleSongSelect} blockCtx={blockedCtx()} showToast={showToastMessage} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} contentLanguages={contentLanguages} />} />
            <Route path="/discover/album/:id/:slug?" element={<DiscoverDetailView onSongClick={handleSongSelect} showToast={showToastMessage} currentSong={currentSong} isPlaying={isPlaying} sidebarOpen={sidebarOpen} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} onShufflePlay={handleShufflePlay} onArtistRadio={handleArtistRadio} savedAlbums={savedAlbums} onSaveAlbumToggle={handleSaveAlbumToggle} followedArtists={followedArtists} onFollowArtistToggle={handleFollowArtistToggle} contentLanguages={contentLanguages} />} />
            <Route path="/discover/playlist/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} showToast={showToastMessage} currentSong={currentSong} isPlaying={isPlaying} sidebarOpen={sidebarOpen} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} onShufflePlay={handleShufflePlay} onArtistRadio={handleArtistRadio} savedAlbums={savedAlbums} onSaveAlbumToggle={handleSaveAlbumToggle} followedArtists={followedArtists} onFollowArtistToggle={handleFollowArtistToggle} contentLanguages={contentLanguages} />} />
            <Route path="/discover/artist/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} showToast={showToastMessage} currentSong={currentSong} isPlaying={isPlaying} sidebarOpen={sidebarOpen} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} onShufflePlay={handleShufflePlay} onArtistRadio={handleArtistRadio} savedAlbums={savedAlbums} onSaveAlbumToggle={handleSaveAlbumToggle} followedArtists={followedArtists} onFollowArtistToggle={handleFollowArtistToggle} contentLanguages={contentLanguages} />} />
            <Route path="/search" element={<SearchView query={searchQuery} blockCtx={blockedCtx()} onSongClick={handleSongSelect} onAlbumClick={a => navigateToView('album', a)} onArtistClick={a => navigateToView('artist', a)} showToast={showToastMessage} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} />} />
            <Route path="/playlists" element={<ProtectedRoute title="Your playlists"><PlaylistsView showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/playlists/:id" element={<ProtectedRoute title="Your playlists"><PlaylistDetailView onSongClick={handleSongSelect} onShufflePlay={handleShufflePlay} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} currentSong={currentSong} isPlaying={isPlaying} showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/liked" element={<ProtectedRoute title="Liked songs"><LikedSongsView likedSongs={likedSongs} onLikeToggle={handleLikeToggle} onSongClick={handleSongSelect} onShufflePlay={handleShufflePlay} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} currentSong={currentSong} isPlaying={isPlaying} showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/stats" element={<ProtectedRoute title="Your listening stats"><StatsView likedSongs={likedSongs} onSongClick={handleSongSelect} showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/library" element={<ProtectedRoute title="Your library"><LibraryView likedSongs={likedSongs} savedAlbums={savedAlbums} followedArtists={followedArtists} /></ProtectedRoute>} />
            <Route path="/library/album/:id" element={<ProtectedRoute title="Your library"><LocalAlbumView onSongClick={handleSongSelect} onShufflePlay={handleShufflePlay} onPlayNext={handlePlayNext} onAddToQueue={handleAddToQueue} onGoToAlbum={handleGoToAlbum} onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist} likedSongs={likedSongs} onLikeToggle={handleLikeToggle} currentSong={currentSong} isPlaying={isPlaying} showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/downloads" element={<ProtectedRoute title="Downloads"><DownloadsView onSongClick={handleSongSelect} showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/shared/:data" element={<SharedPlaylistView onSongClick={handleSongSelect} showToast={showToastMessage} />} />
            <Route path="/blend/:data" element={<BlendView onSongClick={handleSongSelect} showToast={showToastMessage} likedSongs={likedSongs} />} />
            <Route path="/wrapped" element={<ProtectedRoute title="Your Wrapped"><WrappedView showToast={showToastMessage} /></ProtectedRoute>} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/dmca" element={<DMCA />} />
          </Routes>
          </ErrorBoundary>
        </div>
        
        {/* Desktop Player - Hidden on mobile */}
        <div className="hidden md:block">
          <ErrorBoundary silent resetKey={location.pathname}>
          <PlayerBar
            currentSong={currentSong}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onPrev={handlePrev}
            onNext={handleNext}
            volume={volume}
            onVolumeChange={setVolume}
            muted={muted}
            onMuteToggle={handleMuteToggle}
            shuffle={shuffle}
            onShuffleToggle={handleShuffleToggle}
            repeat={repeat}
            onRepeatToggle={() => setRepeat(r => repeatCycle(r))}
            liked={currentSong ? likedSongs.has(currentSong.id) : false}
            onLikeToggle={() => currentSong && handleLikeToggle(currentSong.id, currentSong)}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            onArtworkClick={handleArtworkClick}
            onQueueToggle={() => setQueueOpen(o => !o)}
            onLyricsToggle={() => currentSong && setDesktopLyricsOpen(o => !o)}
            isSearchingAlbum={isSearchingAlbum}
            likedSongs={likedSongs}
            onPlayNext={handlePlayNext}
            onAddToQueue={handleAddToQueue}
            onGoToAlbum={handleGoToAlbum}
            onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist}
            showToast={showToast}
            onOpenFullScreen={() => setShowFullScreenPlayer(true)}
            castAvailable={castAvailable} casting={casting} onCastToggle={handleCastToggle}
          />
          </ErrorBoundary>
        </div>
      </div>

      {/* Mobile Mini Player - Visible only on mobile */}
      {!showFullScreenPlayer && (
        <div className="fixed bottom-16 left-0 right-0 md:hidden bg-zinc-900 z-30">
          <ErrorBoundary silent resetKey={location.pathname}>
          <PlayerBar
            currentSong={currentSong}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onPrev={handlePrev}
            onNext={handleNext}
            volume={volume}
            onVolumeChange={setVolume}
            muted={muted}
            onMuteToggle={handleMuteToggle}
            shuffle={shuffle}
            onShuffleToggle={handleShuffleToggle}
            repeat={repeat}
            onRepeatToggle={() => setRepeat(r => repeatCycle(r))}
            liked={currentSong ? likedSongs.has(currentSong.id) : false}
            onLikeToggle={() => currentSong && handleLikeToggle(currentSong.id, currentSong)}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            onArtworkClick={handleArtworkClick}
            isSearchingAlbum={isSearchingAlbum}
            isMobileMiniplayer={true}
            onOpenFullScreen={() => setShowFullScreenPlayer(true)}
            castAvailable={castAvailable} casting={casting} onCastToggle={handleCastToggle}
          />
          </ErrorBoundary>
        </div>
      )}
      
      {/* Mobile Bottom Navigation - Visible only on mobile */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-zinc-900 flex items-center h-16 z-40 pb-safe">
        <button
          onClick={() => navigate('/discover')}
          className={`flex flex-col items-center justify-center flex-1 h-full touch-target transition-colors active:scale-95 active:opacity-70 ${
            location.pathname.startsWith('/discover') ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'
          }`}
          title="Discover"
        >
          <Compass size={24} />
          <span className="text-xs mt-1">Discover</span>
        </button>
        <button
          onClick={() => navigate('/search')}
          className={`flex flex-col items-center justify-center flex-1 h-full touch-target transition-colors active:scale-95 active:opacity-70 ${
            location.pathname === '/search' ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'
          }`}
          title="Search"
        >
          <Search size={24} />
          <span className="text-xs mt-1">Search</span>
        </button>
        <button
          onClick={() => navigate('/library')}
          className={`flex flex-col items-center justify-center flex-1 h-full touch-target transition-colors active:scale-95 active:opacity-70 ${
            ['/library', '/liked', '/playlists', '/downloads', '/stats'].some(p => location.pathname.startsWith(p)) ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'
          }`}
          title="Library"
        >
          <Library size={24} />
          <span className="text-xs mt-1">Library</span>
        </button>
      </div>
      
      {/* Full Screen Player - Mobile Only */}
      {showFullScreenPlayer && (
        <ErrorBoundary silent resetKey={location.pathname}>
        <FullScreenPlayer
          currentSong={currentSong}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          shuffle={shuffle}
          onShuffleToggle={handleShuffleToggle}
          repeat={repeat}
          onRepeatToggle={() => setRepeat(r => repeatCycle(r))}
          liked={currentSong ? likedSongs.has(currentSong.id) : false}
          onLikeToggle={() => currentSong && handleLikeToggle(currentSong.id, currentSong)}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          onClose={() => setShowFullScreenPlayer(false)}
          onQueueToggle={() => setQueueOpen(o => !o)}
          isSearchingAlbum={isSearchingAlbum}
          volume={volume}
          onVolumeChange={setVolume}
          muted={muted}
          onMuteToggle={handleMuteToggle}
          likedSongs={likedSongs}
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onGoToAlbum={handleGoToAlbum}
          onSongRadio={handleSongRadio} onHideSong={handleHideSong} onHideArtist={handleHideArtist}
          showToast={showToastMessage}
          sleepTimer={sleepTimer}
          onSleepTimer={handleSleepTimer}
          castAvailable={castAvailable} casting={casting} onCastToggle={handleCastToggle}
        />
        </ErrorBoundary>
      )}

      {/* Queue Drawer */}
      <ErrorBoundary silent resetKey={location.pathname}>
      <QueueDrawer
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        queue={queue}
        queueIndex={queueIndex}
        shuffle={shuffle}
        shuffleOrder={shuffleOrder}
        shufflePos={shufflePos}
        isPlaying={isPlaying}
        onPlayAt={handleQueuePlayAt}
        onRemoveAt={handleQueueRemoveAt}
        onMove={handleQueueMove}
        onMoveTo={handleQueueMoveTo}
        onClear={handleQueueClear}
      />
      </ErrorBoundary>

      {/* Desktop now-playing lyrics — the bar's Mic2 button opens this */}
      {desktopLyricsOpen && currentSong && (
        <ErrorBoundary silent resetKey={location.pathname}>
        <LyricsModal
          song={currentSong}
          onClose={() => setDesktopLyricsOpen(false)}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
        </ErrorBoundary>
      )}

      {/* Download Manager - Only in development */}
      {!isProduction && <DownloadManager />}
      
      {/* Resume session banner — floats ABOVE the mini-player zone and
          auto-dismisses; shows once per browser session */}
      {resumeSession && (
        <div className="fixed bottom-36 md:bottom-24 left-1/2 -translate-x-1/2 z-[9998] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl px-4 py-3 flex items-center gap-3 max-w-[92vw]">
          <span className="text-sm text-zinc-300 truncate">
            Resume <span className="text-white font-medium">{decodeHtmlEntities(resumeSession.currentSong?.name)}</span>?
          </span>
          <button
            onClick={handleResumeSession}
            className="px-3 py-1 bg-[#fc3c44] hover:bg-[#e6353d] text-white text-sm rounded-full transition-colors"
          >
            Resume
          </button>
          <button
            onClick={() => { setResumeSession(null); localStorage.removeItem('playerSession') }}
            className="text-zinc-500 hover:text-white transition-colors"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Toast Notification - Responsive positioning */}
      {showToast && (
        <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 z-[9999] animate-fade-in">
          <div className={`px-4 py-3 rounded-lg shadow-lg ${
            toastType === 'success' 
              ? 'bg-green-600 text-white' 
              : toastType === 'warning'
              ? 'bg-yellow-600 text-white'
              : 'bg-red-600 text-white'
          }`}>
            <div className="flex items-center gap-2">
              {toastType === 'success' ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : toastType === 'warning' ? (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-sm font-medium whitespace-pre-wrap">{toastMessage}</span>
              {toastAction && (
                <button
                  onClick={() => { toastAction.onClick?.(); setShowToast(false) }}
                  className="ml-1 px-2 py-1 text-xs font-bold uppercase tracking-wide bg-white/20 hover:bg-white/30 rounded transition-colors shrink-0"
                >
                  {toastAction.label}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
        <Analytics />
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
