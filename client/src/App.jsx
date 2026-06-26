import { useState, useMemo } from 'react'
import songsData from '@songs-data'
import { getAlbums, getArtists } from './utils'
import Sidebar from './Sidebar'
import HomeView from './HomeView'
import ArtistsView from './ArtistsView'
import ArtistDetailView from './ArtistDetailView'
import AlbumsView from './AlbumsView'
import AlbumDetailView from './AlbumDetailView'
import SongsView from './SongsView'
import SearchView from './SearchView'
import YearView from './YearView'
import PlayerBar from './PlayerBar'

const albums = getAlbums(songsData)
const artists = getArtists(songsData)

function App() {
  const [view, setView] = useState('home')
  const [selectedAlbum, setSelectedAlbum] = useState(null)
  const [selectedArtist, setSelectedArtist] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null)
  const [prevView, setPrevView] = useState('albums')
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const navigate = (viewName, data = null) => {
    if (viewName === 'album') setSelectedAlbum(data)
    if (viewName === 'artist') setSelectedArtist(data)
    if (viewName === 'year') setSelectedYear(data)
    setView(viewName)
    window.scrollTo?.(0, 0)
  }

  const handleSongSelect = (song) => {
    setCurrentSong(song)
    setIsPlaying(true)
  }

  const handleAlbumFromSong = (song) => {
    const album = albums.find(a => a.name === song.album)
    if (album) navigate('album', album)
  }

  const handlePersonByName = (name) => {
    const lower = name.toLowerCase()
    const person = artists.find(a => a.name.toLowerCase() === lower) ||
      artists.find(a => a.name.toLowerCase().includes(lower) || lower.includes(a.name.toLowerCase()))
    if (person) navigate('artist', person)
  }

  const handleYearClick = (year, from = 'album') => {
    setPrevView(from)
    navigate('year', year)
  }

  const currentIndex = useMemo(
    () => currentSong ? songsData.findIndex(s => s.id === currentSong.id) : -1,
    [currentSong]
  )

  const handlePrev = () => {
    if (currentIndex > 0) handleSongSelect(songsData[currentIndex - 1])
  }

  const handleNext = () => {
    if (currentIndex < songsData.length - 1) handleSongSelect(songsData[currentIndex + 1])
  }

  const renderView = () => {
    switch (view) {
      case 'home':
        return (
          <HomeView
            albums={albums}
            onAlbumClick={a => navigate('album', a)}
          />
        )
      case 'artists':
        return (
          <ArtistsView
            artists={artists}
            onArtistClick={a => navigate('artist', a)}
          />
        )
      case 'artist':
        return (
          <ArtistDetailView
            artist={selectedArtist}
            albums={albums}
            onBack={() => navigate('artists')}
            onSongClick={handleSongSelect}
            onAlbumClick={a => navigate('album', a)}
            currentSong={currentSong}
          />
        )
      case 'albums':
        return (
          <AlbumsView
            albums={albums}
            onAlbumClick={a => navigate('album', a)}
          />
        )
      case 'album':
        return (
          <AlbumDetailView
            album={selectedAlbum}
            artists={artists}
            onBack={() => navigate('albums')}
            onSongClick={handleSongSelect}
            onPersonClick={handlePersonByName}
            onYearClick={year => handleYearClick(year, 'album')}
            currentSong={currentSong}
          />
        )
      case 'songs':
        return (
          <SongsView
            songs={songsData}
            onSongClick={handleSongSelect}
            onAlbumClick={handleAlbumFromSong}
            onPersonClick={handlePersonByName}
            currentSong={currentSong}
          />
        )
      case 'search':
        return (
          <SearchView
            query={searchQuery}
            songs={songsData}
            albums={albums}
            artists={artists}
            onSongClick={handleSongSelect}
            onAlbumClick={a => navigate('album', a)}
            onArtistClick={a => navigate('artist', a)}
          />
        )
      case 'year':
        return (
          <YearView
            year={selectedYear}
            songs={songsData}
            albums={albums}
            onBack={() => navigate(prevView)}
            onSongClick={handleSongSelect}
            onAlbumClick={a => navigate('album', a)}
            currentSong={currentSong}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      <Sidebar
        currentView={view}
        onNavigate={navigate}
        searchQuery={searchQuery}
        onSearch={q => { setSearchQuery(q); if (q) setView('search') }}
      />
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto bg-zinc-950">
          {renderView()}
        </div>
        <PlayerBar
          currentSong={currentSong}
          isPlaying={isPlaying}
          onTogglePlay={() => setIsPlaying(p => !p)}
          onPrev={handlePrev}
          onNext={handleNext}
        />
      </div>
    </div>
  )
}

export default App
