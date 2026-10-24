import { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, Music, Loader2, ChevronDown, ListVideo, Mic2, Volume2, VolumeX } from 'lucide-react'
import { formatTime, decodeHtmlEntities } from '../utils'
import { getDominantColor } from '../utils/color'
import { Range, getTrackBackground } from 'react-range'
import LyricsModal from '../components/LyricsModal'

export default function FullScreenPlayer({ 
  currentSong, 
  isPlaying, 
  onTogglePlay, 
  onPrev, 
  onNext, 
  shuffle, 
  onShuffleToggle, 
  repeat, 
  onRepeatToggle, 
  liked, 
  onLikeToggle, 
  currentTime, 
  duration, 
  onSeek, 
  onClose,
  onQueueToggle,
  isSearchingAlbum,
  volume = 1,
  onVolumeChange,
  muted = false,
  onMuteToggle
}) {
  const playerRef = useRef(null)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [tint, setTint] = useState(null)
  const touch = useRef(null)

  const artwork = currentSong?.artworkUrl || currentSong?.moviePosterUrl || currentSong?.imageUrl

  // Artwork-adaptive backdrop (Apple Music style tinting)
  useEffect(() => {
    let live = true
    setTint(null)
    if (artwork) getDominantColor(artwork).then(c => { if (live) setTint(c) })
    return () => { live = false }
  }, [artwork])

  if (!currentSong) return null

  // Swipe-down to dismiss — finger-follows, releases past threshold close
  const onTouchStart = (e) => { touch.current = { y: e.touches[0].clientY, id: e.touches[0].identifier } }
  const onTouchMove = (e) => {
    if (!touch.current) return
    const dy = e.touches[0].clientY - touch.current.y
    if (dy > 0) setDragY(dy)
  }
  const onTouchEnd = () => {
    if (dragY > 140) onClose()
    setDragY(0)
    touch.current = null
  }

  const bg = tint
    ? `linear-gradient(to bottom, rgb(${tint[0]},${tint[1]},${tint[2]}) 0%, rgb(${tint[0]/3|0},${tint[1]/3|0},${tint[2]/3|0}) 55%, #000 100%)`
    : 'linear-gradient(to bottom, #2a1a1a, #000)'

  return (
    <div
      ref={playerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="fixed inset-0 z-50 flex flex-col md:hidden"
      style={{
        background: bg,
        transform: `translateY(${dragY}px)`,
        opacity: Math.max(0.4, 1 - dragY / 600),
        transition: touch.current ? 'none' : 'transform .3s ease-out, opacity .3s ease-out'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          onClick={onClose}
          className="text-white hover:text-zinc-300 transition-colors"
          title="Close player"
        >
          <ChevronDown size={28} />
        </button>
        <h2 className="text-sm font-semibold text-white truncate flex-1 text-center mx-4">
          {decodeHtmlEntities(currentSong.album?.name || currentSong.album || currentSong.movie || 'Now Playing')}
        </h2>
        <div className="w-6" /> {/* Spacer for center alignment */}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col justify-center px-6 py-4 overflow-y-auto">
        {/* Album Artwork */}
        <div className="flex-shrink-0 flex justify-center mb-4">
          {artwork ? (
            <div className="relative">
              <img
                src={artwork}
                alt={currentSong.album}
                className="w-72 h-72 rounded-lg object-cover shadow-2xl"
                style={{ transform: `scale(${1 - dragY / 1200})` }}
                onError={e => { e.target.style.display = 'none' }}
              />
              {isSearchingAlbum && (
                <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                  <Loader2 size={32} className="text-white animate-spin" />
                </div>
              )}
            </div>
          ) : (
            <div className="w-72 h-72 rounded-lg bg-zinc-800 flex items-center justify-center shadow-2xl">
              <Music size={64} className="text-zinc-600" />
            </div>
          )}
        </div>

        {/* Song Info */}
        <div className="text-center mb-4 flex-shrink-0">
          <h1 className="text-2xl font-bold text-white mb-1 truncate">
            {decodeHtmlEntities(currentSong.name || currentSong.title)}
          </h1>
          <p className="text-base text-zinc-400 truncate">
            {currentSong.artist}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-full mb-4 flex-shrink-0" onTouchStart={e => e.stopPropagation()} onTouchMove={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          <div className="relative mb-2 h-2">
            <Range
              step={0.1}
              min={0}
              max={duration || 100}
              values={[currentTime]}
              onChange={(values) => onSeek(values[0])}
              renderTrack={({ props, children }) => (
                <div
                  {...props}
                  className="h-2 bg-zinc-800 rounded-full"
                  style={{
                    ...props.style,
                    background: getTrackBackground({
                      values: [currentTime],
                      colors: ['#ffffff', '#27272a'],
                      min: 0,
                      max: duration || 100
                    })
                  }}
                >
                  {children}
                </div>
              )}
              renderThumb={({ props, isDragged }) => (
                <div
                  {...props}
                  className={`h-3 w-3 bg-white rounded-full shadow-lg cursor-pointer transition-opacity ${isDragged ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    ...props.style,
                  }}
                />
              )}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
          {/* Top Controls Row */}
          <div className="flex items-center justify-between w-full px-6">
            <button 
              onClick={onShuffleToggle} 
              className={`transition-colors ${shuffle ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`}
              title="Shuffle"
            >
              <Shuffle size={20} />
            </button>
            <button 
              onClick={onLikeToggle} 
              className="transition-colors"
              title={liked ? 'Unlike' : 'Like'}
            >
              <Heart size={20} className={`${liked ? 'text-[#fc3c44] fill-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`} />
            </button>
            <button 
              onClick={onRepeatToggle} 
              className={`transition-colors ${repeat !== 'off' ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`}
              title={`Repeat: ${repeat}`}
            >
              {repeat === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
            </button>
            <button
              onClick={onQueueToggle}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Queue"
            >
              <ListVideo size={20} />
            </button>
            <button
              onClick={() => setLyricsOpen(true)}
              className="text-zinc-400 hover:text-white transition-colors"
              title="Lyrics"
            >
              <Mic2 size={20} />
            </button>
          </div>

          {/* Play Controls Row */}
          <div className="flex items-center justify-center gap-8">
            <button 
              onClick={onPrev} 
              className="text-zinc-400 hover:text-white transition-colors"
              title="Previous"
            >
              <SkipBack size={32} className="fill-current" />
            </button>
            <button
              onClick={onTogglePlay}
              className="w-16 h-16 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying
                ? <Pause size={28} className="text-black fill-black" />
                : <Play size={28} className="text-black fill-black ml-1" />
              }
            </button>
            <button 
              onClick={onNext} 
              className="text-zinc-400 hover:text-white transition-colors"
              title="Next"
            >
              <SkipForward size={32} className="fill-current" />
            </button>
          </div>

          {/* Volume — phones need an in-app control too */}
          <div
            className="flex items-center gap-3 w-full px-6"
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
          >
            <button onClick={onMuteToggle} className="text-zinc-400 hover:text-white transition-colors shrink-0" title={muted ? 'Unmute' : 'Mute'}>
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={e => {
                const v = parseFloat(e.target.value)
                onVolumeChange?.(v)
                if (muted && v > 0) onMuteToggle?.()
              }}
              className="flex-1 h-1 accent-white cursor-pointer appearance-none bg-zinc-700 rounded-full"
              style={{ accentColor: '#fff' }}
            />
          </div>
        </div>
      </div>
      {lyricsOpen && <LyricsModal song={currentSong} currentTime={currentTime} onSeek={onSeek} onClose={() => setLyricsOpen(false)} />}
    </div>
  )
}
