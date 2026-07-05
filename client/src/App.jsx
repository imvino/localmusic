import { useState, useMemo, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { getGreeting } from './utils'
import Sidebar from './Sidebar'
import SearchView from './SearchView'
import DiscoverView from './DiscoverView'
import DiscoverDetailView from './DiscoverDetailView'
import PlayerBar from './PlayerBar'
import LanguageFilter from './LanguageFilter'

const API_BASE = '/api'

function AppContent() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(0.75)
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [liked, setLiked] = useState(false)
  const [selectedLanguages, setSelectedLanguages] = useState([])
  const audioRef = useRef(null)

  // Redirect to discover if on root
  useEffect(() => {
    if (window.location.pathname === '/') {
      navigate('/discover', { replace: true })
    }
  }, [navigate])

  // Handle audio playback
  useEffect(() => {
    if (!audioRef.current) return

    if (currentSong) {
      let streamUrl
      if (currentSong.isStream && currentSong.streamUrl) {
        streamUrl = currentSong.streamUrl
      }

      if (streamUrl && audioRef.current.src !== streamUrl) {
        audioRef.current.src = streamUrl
        audioRef.current.load()
      }
      audioRef.current.volume = volume

      if (isPlaying) {
        audioRef.current.play().catch(e => console.error('Play error:', e))
      } else {
        audioRef.current.pause()
      }
    }
  }, [currentSong, isPlaying, volume])

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
  }, [repeat, currentSong])

  const navigateToView = (viewName, data = null, source = 'discover') => {
    if (viewName === 'album' && data) {
      navigate(`/discover/album/${data.id || encodeURIComponent(data.name)}`, { state: { album: data, source } })
    } else if (viewName === 'artist' && data) {
      navigate(`/discover/artist/${data.id}`, { state: { artist: data, source } })
    } else {
      navigate(`/${viewName}`)
    }
    window.scrollTo?.(0, 0)
  }

  const handleSongSelect = (song) => {
    setCurrentSong({
      ...song,
      isStream: true
    })
    setIsPlaying(true)
  }

  const handlePrev = () => {
    // Basic implementation since we don't have a local queue anymore
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  }

  const handleNext = () => {
    // Without a queue, we just stop playing
    setIsPlaying(false)
  }

  const handleTogglePlay = () => {
    setIsPlaying(p => !p)
  }

  const searchQuery = searchParams.get('q') || ''

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <audio ref={audioRef} className="hidden" />
      <Sidebar
        searchQuery={searchQuery}
        onSearch={q => setSearchParams({ q })}
      />
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        {/* Header with Language Filter */}
        <div className="flex items-center justify-between px-6 py-3 bg-zinc-950 border-b border-zinc-900 sticky top-0 z-10">
          <h1 className="text-lg font-bold text-white">LocalMusic</h1>
          <LanguageFilter
            selectedLanguages={selectedLanguages}
            onLanguageChange={setSelectedLanguages}
          />
        </div>
        <div className="flex-1 overflow-y-auto bg-zinc-950">
          <Routes>
            <Route path="/discover" element={<DiscoverView onSongClick={handleSongSelect} selectedLanguages={selectedLanguages} />} />
            <Route path="/discover/album/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} />} />
            <Route path="/discover/playlist/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} />} />
            <Route path="/discover/artist/:id" element={<DiscoverDetailView onSongClick={handleSongSelect} selectedLanguages={selectedLanguages} />} />
            <Route path="/search" element={<SearchView query={searchQuery} onSongClick={handleSongSelect} onAlbumClick={a => navigateToView('album', a)} onArtistClick={a => navigateToView('artist', a)} selectedLanguages={selectedLanguages} />} />
          </Routes>
        </div>
        <PlayerBar
          currentSong={currentSong}
          isPlaying={isPlaying}
          onTogglePlay={handleTogglePlay}
          onPrev={handlePrev}
          onNext={handleNext}
          volume={volume}
          onVolumeChange={setVolume}
          shuffle={shuffle}
          onShuffleToggle={() => setShuffle(s => !s)}
          repeat={repeat}
          onRepeatToggle={() => setRepeat(r => !r)}
          liked={liked}
          onLikeToggle={() => setLiked(l => !l)}
        />
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  )
}

export default App
