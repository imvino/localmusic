import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Compass, Search, Menu, X, ArrowLeft, User } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { ClerkProvider, UserButton, useAuth, SignInButton } from '@clerk/react'
import { dark } from '@clerk/themes'
import { useHealthCheck } from './hooks/useApi'
import Sidebar from './views/Sidebar'
import SearchView from './views/SearchView'
import DiscoverView from './views/DiscoverView'
import DiscoverDetailView from './views/DiscoverDetailView'
import PlayerBar from './views/PlayerBar'
import FullScreenPlayer from './views/FullScreenPlayer'
import DownloadManager from './views/DownloadManager'
import TermsOfService from './pages/TermsOfService'
import PrivacyPolicy from './pages/PrivacyPolicy'
import DMCA from './pages/DMCA'

const API_BASE = import.meta.env.VITE_API_URL

// Check if we're in production mode
const isProduction = import.meta.env.MODE === 'production'

// Clerk publishable key (will be set via environment variable)
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || ''

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
  const { isSignedIn } = useAuth()
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.75)
  const [muted, setMuted] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [queue, setQueue] = useState([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [likedSongs, setLikedSongs] = useState(() => {
    const saved = localStorage.getItem('likedSongs')
    return saved ? new Set(JSON.parse(saved)) : new Set()
  })
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [toastType, setToastType] = useState('error') // 'error', 'success', 'warning'
  const [isSearchingAlbum, setIsSearchingAlbum] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showFullScreenPlayer, setShowFullScreenPlayer] = useState(false)
  const audioRef = useRef(null)

  // Use TanStack Query for health check
  const { data: healthData, isError: healthError } = useHealthCheck(true)
  const serverStatus = healthError ? 'offline' : 'online'

  // Function to show toast notifications
  const showToastMessage = (message, type = 'error') => {
    setToastMessage(message)
    setToastType(type)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 5000)
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

  // Handle audio playback
  useEffect(() => {
    if (!audioRef.current) return

    const audio = audioRef.current

    if (currentSong) {
      let streamUrl
      if (currentSong.isStream && currentSong.streamUrl) {
        streamUrl = currentSong.streamUrl
      }

      if (streamUrl && audio.src !== streamUrl) {
        audio.src = streamUrl
        audio.load()
      }
      audio.volume = muted ? 0 : volume

      if (isPlaying) {
        audio.play().catch(e => {
          console.error('Play error:', e)
          showToastMessage('Failed to play audio. The stream URL may be invalid.', 'error')
        })
      } else {
        audio.pause()
      }

      // Set Media Session API metadata for lock screen/controls
      if ('mediaSession' in navigator && currentSong) {
        const artwork = currentSong.artworkUrl || currentSong.moviePosterUrl || currentSong.imageUrl
        
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
          if (details.seekTime && audioRef.current) {
            audioRef.current.currentTime = details.seekTime
            setCurrentTime(details.seekTime)
          }
        })
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

    // Add timeupdate event listener for progress tracking
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    // Add loadedmetadata event listener for duration
    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
    }

    audio.addEventListener('error', handleError)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    return () => {
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
    }
  }, [currentSong, isPlaying, volume, muted])

  // Handle shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
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
          setShuffle(s => !s)
          break
        case 'KeyR':
          e.preventDefault()
          setRepeat(r => !r)
          break
        case 'KeyL':
          e.preventDefault()
          if (currentSong) {
            handleLikeToggle(currentSong.id)
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
  }, [currentSong, duration, queue, queueIndex, shuffle, repeat])

  // Handle song end / repeat
  useEffect(() => {
    if (!audioRef.current) return
    const el = audioRef.current
    const onEnded = () => {
      if (repeat && currentSong) {
        el.currentTime = 0
        el.play().catch(e => console.error('Repeat play error:', e))
      } else {
        handleNext()
      }
    }
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [repeat, currentSong, queue, queueIndex, shuffle])


  const navigateToView = (viewName, data = null, source = 'discover') => {
    if (viewName === 'album' && data) {
      navigate(`/discover/album/${data.id || encodeURIComponent(data.name)}`, { state: { album: data, source } })
    } else if (viewName === 'artist' && data) {
      navigate(`/discover/artist/${data.id}`, { state: { artist: data, source } })
    } else {
      navigate(`/${viewName}`)
    }
  }

  const handleSongSelect = (song, songQueue = null, songIndex = null) => {
    setCurrentSong({
      ...song,
      artist: song.artist || song.artists?.primary?.[0]?.name,
      albumId: song.album?.id || song.albumId,
      isStream: true
    })
    if (songQueue && songIndex !== null) {
      setQueue(songQueue)
      setQueueIndex(songIndex)
    }
    setIsPlaying(true)
    setCurrentTime(0)
  }

  const handlePrev = async () => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    if (queue.length > 0 && queueIndex > 0) {
      const newIndex = queueIndex - 1
      setQueueIndex(newIndex)
      await playQueueSong(newIndex)
    } else if (queue.length > 0) {
      audioRef.current.currentTime = 0
    }
  }

  const handleNext = async () => {
    if (queue.length === 0) {
      setIsPlaying(false)
      return
    }

    let newIndex
    if (shuffle) {
      newIndex = Math.floor(Math.random() * queue.length)
      // Don't play the same song twice in a row
      if (newIndex === queueIndex && queue.length > 1) {
        newIndex = (newIndex + 1) % queue.length
      }
    } else {
      // If at end of queue and repeat is off, stop playback
      if (queueIndex === queue.length - 1 && !repeat) {
        setIsPlaying(false)
        return
      }
      newIndex = (queueIndex + 1) % queue.length
    }

    setQueueIndex(newIndex)
    await playQueueSong(newIndex)
  }

  const handleTogglePlay = () => {
    setIsPlaying(p => !p)
  }

  const handleSeek = (time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleMuteToggle = () => {
    setMuted(m => !m)
  }

  const playQueueSong = async (index) => {
    const song = queue[index]
    if (!song) return

    try {
      // Fetch stream URL if not already present
      if (!song.streamUrl) {
        const res = await fetch(`${API_BASE}/song/${song.id}`)
        const result = await res.json()
        if (result.success && result.data && result.data.streamUrl) {
          setCurrentSong({
            ...song,
            streamUrl: result.data.streamUrl,
            albumId: result.data.albumId || song.albumId,
            imageUrl: song.imageUrl || song.image?.find(img => img.quality === '500x500')?.url ||
                      song.image?.find(img => img.quality === '150x150')?.url,
            artist: song.artist || song.artists?.primary?.[0]?.name,
            isStream: true
          })
        } else {
          showToastMessage('Failed to load song stream', 'error')
          return
        }
      } else {
        setCurrentSong({
          ...song,
          imageUrl: song.imageUrl || song.image?.find(img => img.quality === '500x500')?.url ||
                    song.image?.find(img => img.quality === '150x150')?.url,
          artist: song.artist || song.artists?.primary?.[0]?.name,
          isStream: true
        })
      }
      setCurrentTime(0)
    } catch (err) {
      console.error('Failed to play queue song:', err)
      showToastMessage('Failed to play song', 'error')
    }
  }

  const handleLikeToggle = (songId) => {
    setLikedSongs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(songId)) {
        newSet.delete(songId)
      } else {
        newSet.add(songId)
      }
      localStorage.setItem('likedSongs', JSON.stringify([...newSet]))
      return newSet
    })
  }

  const handleArtworkClick = async () => {
    console.log('handleArtworkClick called, currentSong:', currentSong)
    if (currentSong && currentSong.albumId) {
      navigate(`/discover/album/${currentSong.albumId}`)
    } else if (currentSong && currentSong.album && currentSong.name) {
      // Fallback: search for album
      setIsSearchingAlbum(true)
      try {
        const searchQuery = `${currentSong.album} ${currentSong.name}`
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(searchQuery)}`)
        const result = await res.json()
        
        if (result.success && result.data.albums) {
          // Check if song exists in any album
          for (const album of result.data.albums) {
            try {
              const albumRes = await fetch(`${API_BASE}/album/${album.id}`)
              const albumData = await albumRes.json()
              
              if (albumData.success && albumData.data.songs) {
                const songExists = albumData.data.songs.some(s => s.id === currentSong.id)
                if (songExists) {
                  // Found the album, navigate and update currentSong
                  setCurrentSong(prev => ({ ...prev, albumId: album.id }))
                  navigate(`/discover/album/${album.id}`)
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

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden flex-col md:flex-row">
      <audio ref={audioRef} className="hidden" />
      
      {/* Sidebar - Hidden by default, toggled with burger menu */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-64 bg-black">
            <Sidebar
              searchQuery={searchQuery}
              onSearch={q => setSearchParams({ q })}
              showToast={showToastMessage}
              onClose={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}
      
      {/* Desktop Sidebar - Hidden by default */}
      <div className={`hidden md:flex ${sidebarOpen ? 'w-56' : 'w-0'} transition-all duration-300 overflow-hidden`}>
        <Sidebar
          searchQuery={searchQuery}
          onSearch={q => setSearchParams({ q })}
          showToast={showToastMessage}
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
                  setSearchParams({ q: next })
                  if (next && location.pathname !== '/search') {
                    navigate('/search')
                  }
                }}
                onPaste={e => {
                  e.preventDefault()
                  const pastedText = e.clipboardData.getData('text')
                  const input = e.target
                  const start = input.selectionStart
                  const end = input.selectionEnd
                  const currentValue = input.value
                  const newValue = currentValue.substring(0, start) + pastedText + currentValue.substring(end)
                  setLocalSearchQuery(newValue)
                  setSearchParams({ q: newValue })
                  if (newValue && location.pathname !== '/search') {
                    navigate('/search')
                  }
                }}
                className="w-80 bg-zinc-800/70 text-sm text-white placeholder-zinc-500 rounded-full pl-10 pr-4 py-2 outline-none border border-transparent focus:border-zinc-600 transition-colors"
              />
            </div>
            {/* Clerk Authentication - Desktop - Far right corner */}
            <div className="hidden md:flex items-center gap-2 ml-auto">
              {isSignedIn ? (
                <UserButton afterSignOutUrl="/" />
              ) : (
                <SignInButton mode="modal">
                  <button className="flex items-center justify-center p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full transition-colors">
                    <User size={20} />
                  </button>
                </SignInButton>
              )}
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
                    setSearchParams({ q: next })
                    if (next && location.pathname !== '/search') {
                      navigate('/search')
                    }
                  }}
                  onPaste={e => {
                    e.preventDefault()
                    const pastedText = e.clipboardData.getData('text')
                    const input = e.target
                    const start = input.selectionStart
                    const end = input.selectionEnd
                    const currentValue = input.value
                    const newValue = currentValue.substring(0, start) + pastedText + currentValue.substring(end)
                    setLocalSearchQuery(newValue)
                    setSearchParams({ q: newValue })
                    if (newValue && location.pathname !== '/search') {
                      navigate('/search')
                    }
                  }}
                  className="w-full bg-zinc-800/70 text-sm text-white placeholder-zinc-500 rounded-full pl-10 pr-4 py-2 outline-none border border-transparent focus:border-zinc-600 transition-colors"
                />
              </div>
            )}
          </div>
        </div>
        
        {/* Main Content - Add bottom padding on mobile for player and nav */}
        <div className="flex-1 overflow-y-auto bg-zinc-950 pb-32 md:pb-0">
          <Routes>
            <Route path="/discover" element={<DiscoverView onSongClick={handleSongSelect} showToast={showToastMessage} />} />
            <Route path="/discover/album/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} showToast={showToastMessage} currentSong={currentSong} isPlaying={isPlaying} sidebarOpen={sidebarOpen} />} />
            <Route path="/discover/playlist/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} showToast={showToastMessage} currentSong={currentSong} isPlaying={isPlaying} sidebarOpen={sidebarOpen} />} />
            <Route path="/discover/artist/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} showToast={showToastMessage} currentSong={currentSong} isPlaying={isPlaying} sidebarOpen={sidebarOpen} />} />
            <Route path="/search" element={<SearchView query={searchQuery} onSongClick={handleSongSelect} onAlbumClick={a => navigateToView('album', a)} onArtistClick={a => navigateToView('artist', a)} showToast={showToastMessage} />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/dmca" element={<DMCA />} />
          </Routes>
        </div>
        
        {/* Desktop Player - Hidden on mobile */}
        <div className="hidden md:block">
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
            onShuffleToggle={() => setShuffle(s => !s)}
            repeat={repeat}
            onRepeatToggle={() => setRepeat(r => !r)}
            liked={currentSong ? likedSongs.has(currentSong.id) : false}
            onLikeToggle={() => currentSong && handleLikeToggle(currentSong.id)}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            onArtworkClick={handleArtworkClick}
            isSearchingAlbum={isSearchingAlbum}
          />
        </div>
      </div>
      
      {/* Mobile Mini Player - Visible only on mobile */}
      {!showFullScreenPlayer && (
        <div className="fixed bottom-16 left-0 right-0 md:hidden bg-zinc-900 border-t border-zinc-800 z-30">
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
            onShuffleToggle={() => setShuffle(s => !s)}
            repeat={repeat}
            onRepeatToggle={() => setRepeat(r => !r)}
            liked={currentSong ? likedSongs.has(currentSong.id) : false}
            onLikeToggle={() => currentSong && handleLikeToggle(currentSong.id)}
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            onArtworkClick={handleArtworkClick}
            isSearchingAlbum={isSearchingAlbum}
            isMobileMiniplayer={true}
            onOpenFullScreen={() => setShowFullScreenPlayer(true)}
          />
        </div>
      )}
      
      {/* Mobile Bottom Navigation - Visible only on mobile */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden bg-zinc-950 border-t border-zinc-900 flex items-center justify-around h-16 z-40 safe-area-inset-bottom">
        <button
          onClick={() => navigate('/discover')}
          className={`flex flex-col items-center justify-center w-full h-full touch-target transition-colors ${
            location.pathname.startsWith('/discover') ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'
          }`}
          title="Discover"
        >
          <Compass size={24} />
          <span className="text-xs mt-1">Discover</span>
        </button>
        <button
          onClick={() => navigate('/search')}
          className={`flex flex-col items-center justify-center w-full h-full touch-target transition-colors ${
            location.pathname === '/search' ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'
          }`}
          title="Search"
        >
          <Search size={24} />
          <span className="text-xs mt-1">Search</span>
        </button>
        <div className="flex flex-col items-center justify-center w-full h-full">
          {isSignedIn ? (
            <UserButton afterSignOutUrl="/" />
          ) : (
            <SignInButton mode="modal">
              <button className="flex flex-col items-center justify-center text-zinc-400 hover:text-white">
                <User size={24} />
                <span className="text-xs mt-1">Sign In</span>
              </button>
            </SignInButton>
          )}
        </div>
      </div>
      
      {/* Full Screen Player - Mobile Only */}
      {showFullScreenPlayer && (
        <FullScreenPlayer
          currentSong={currentSong}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          shuffle={shuffle}
          onShuffleToggle={() => setShuffle(s => !s)}
          repeat={repeat}
          onRepeatToggle={() => setRepeat(r => !r)}
          liked={currentSong ? likedSongs.has(currentSong.id) : false}
          onLikeToggle={() => currentSong && handleLikeToggle(currentSong.id)}
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          onClose={() => setShowFullScreenPlayer(false)}
          isSearchingAlbum={isSearchingAlbum}
        />
      )}
      
      {/* Download Manager - Only in development */}
      {!isProduction && <DownloadManager />}
      
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
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <ClerkProvider 
      publishableKey={clerkPublishableKey} 
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: '#fc3c44',
          colorBackground: '#18181b',
          colorInputBackground: '#27272a',
          colorText: '#ffffff',
          colorTextSecondary: '#a1a1aa',
          borderRadius: '0.5rem'
        }
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  )
}

export default App
