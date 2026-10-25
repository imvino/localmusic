import { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1, Heart, Music, Loader2, ChevronDown, ListVideo, Mic2, Volume2, VolumeX, Timer, Cast, Sparkles } from 'lucide-react'
import { formatTime, decodeHtmlEntities, getSongArtwork } from '../utils'
import { getDominantColor } from '../utils/color'
import { Range, getTrackBackground } from 'react-range'
import LyricsModal from '../components/LyricsModal'
import TrackMenu from '../components/TrackMenu'

export default function FullScreenPlayer({ 
  currentSong, 
  isPlaying, 
  onTogglePlay, 
  onPrev, 
  onNext, 
  shuffle,
  smartShuffle = false,
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
  onMuteToggle,
  likedSongs,
  onPlayNext,
  onAddToQueue,
  onGoToAlbum,
  onSongRadio, onHideSong, onHideArtist,   showToast,
  sleepTimer,
  onSleepTimer,
  castAvailable = false,
  casting = false,
  onCastToggle
}) {
  const playerRef = useRef(null)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [dragT, setDragT] = useState(null) // scrub preview — seek commits on release
  const [sleepSheetOpen, setSleepSheetOpen] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [tint, setTint] = useState(null)
  const touch = useRef(null)

  const artwork = getSongArtwork(currentSong)

  // Artwork-adaptive backdrop (Apple Music style tinting)
  useEffect(() => {
    let live = true
    setTint(null)
    if (artwork) getDominantColor(artwork).then(c => { if (live) setTint(c) })
    return () => { live = false }
  }, [artwork])

  if (!currentSong) return null

  // Gestures — vertical drag dismisses; horizontal swipe changes track.
  // Axis locks on first meaningful movement so diagonal swipes don't fire both.
  const onTouchStart = (e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: e.touches[0].identifier, axis: null }
  }
  const activeTouch = (e) => [...e.touches, ...e.changedTouches].find(t => t.identifier === touch.current?.id)
  const onTouchMove = (e) => {
    const t = activeTouch(e)
    if (!t) return
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    if (!touch.current.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      touch.current.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (touch.current.axis === 'y' && dy > 0) setDragY(dy)
    if (touch.current.axis === 'x') touch.current.dx = dx
  }
  const resetTouch = () => { setDragY(0); touch.current = null }
  const onTouchEnd = () => {
    // touchcancel leaves stale state that replays on the next tap — reset covers it
    if (touch.current?.axis === 'x' && Math.abs(touch.current.dx || 0) > 70) {
      if (touch.current.dx < 0) onNext?.(); else onPrev?.()
    } else if (touch.current && dragY > 140) onClose()
    resetTouch()
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
      onTouchCancel={resetTouch}
      className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center"
      style={{
        background: bg,
        transform: `translateY(${dragY}px)`,
        opacity: Math.max(0.4, 1 - dragY / 600),
        transition: touch.current ? 'none' : 'transform .3s ease-out, opacity .3s ease-out'
      }}
    >
      {/* Desktop: constrain to a centered now-playing panel; mobile: full-bleed */}
      <div className="flex flex-col w-full h-full min-h-0 md:w-[26rem] md:h-auto md:max-h-[92vh] md:rounded-2xl md:overflow-hidden md:shadow-2xl md:ring-1 md:ring-white/10">
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
        {/* ⋯ menu — Spotify Now Playing overflow: add-to-playlist, download,
            share, go-to-album/artist etc. (auth-gated inside TrackMenu) */}
        <div onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
          <TrackMenu
            song={currentSong}
            likedSongs={likedSongs}
            onLikeToggle={onLikeToggle ? () => onLikeToggle(currentSong.id, currentSong) : undefined}
            onPlayNext={onPlayNext}
            onAddToQueue={onAddToQueue}
            onGoToAlbum={onGoToAlbum}
            onSongRadio={onSongRadio} onHideSong={onHideSong} onHideArtist={onHideArtist}
            showToast={showToast}
          />
        </div>
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
              values={[dragT ?? currentTime]}
              onChange={(values) => setDragT(values[0])}
              onFinalChange={(values) => { onSeek(values[0]); setDragT(null) }}
              renderTrack={({ props, children }) => {
                const { key, ...rest } = props
                return (
                <div
                  key={key}
                  {...rest}
                  className="h-2 bg-zinc-800 rounded-full"
                  style={{
                    ...props.style,
                    background: getTrackBackground({
                      values: [dragT ?? currentTime],
                      colors: ['#ffffff', '#27272a'],
                      min: 0,
                      max: duration || 100
                    })
                  }}
                >
                  {children}
                </div>
                )
              }}
              renderThumb={({ props, isDragged }) => {
                const { key, ...rest } = props
                return (
                <div
                  key={key}
                  {...rest}
                  aria-label="Seek"
                  className={`h-3 w-3 bg-white rounded-full shadow-lg cursor-pointer transition-opacity ${isDragged ? 'opacity-100' : 'opacity-0'}`}
                  style={{
                    ...props.style,
                  }}
                />
                )
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>{formatTime(dragT ?? currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-4 flex-shrink-0 pb-[env(safe-area-inset-bottom)]">
          {/* Top Controls Row */}
          <div className="flex items-center justify-between w-full px-6">
            <button 
              onClick={onShuffleToggle}
              className={`relative transition-colors ${shuffle ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`}
              title={smartShuffle ? 'Smart shuffle (tap for off)' : shuffle ? 'Shuffle (tap for smart)' : 'Shuffle'}
            >
              <Shuffle size={20} />
              {smartShuffle && <Sparkles size={10} className="absolute -top-1 -right-1.5 text-[#fc3c44]" />}
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
            <button
              onClick={() => setSleepSheetOpen(true)}
              className={`transition-colors ${sleepTimer ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`}
              title={sleepTimer ? 'Sleep timer on' : 'Sleep timer'}
            >
              <Timer size={20} />
            </button>
            {castAvailable && (
              <button
                onClick={onCastToggle}
                className={`transition-colors ${casting ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`}
                title={casting ? 'Stop casting' : 'Cast to device'}
              >
                <Cast size={20} />
              </button>
            )}
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
      </div>
      {lyricsOpen && <LyricsModal song={currentSong} currentTime={currentTime} onSeek={onSeek} onClose={() => setLyricsOpen(false)} />}

      {/* Sleep timer sheet — Spotify puts this inside Now Playing */}
      {sleepSheetOpen && (
        <div
          className="absolute inset-0 z-10 flex items-end bg-black/60"
          onClick={() => setSleepSheetOpen(false)}
          onTouchStart={e => e.stopPropagation()}
          onTouchEnd={e => e.stopPropagation()}
        >
          <div className="w-full bg-zinc-900 rounded-t-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
            <h3 className="text-white font-semibold text-sm mb-3 px-2">Sleep timer</h3>
            {[['off', 'Off'], ['15', '15 minutes'], ['30', '30 minutes'], ['60', '60 minutes'], ['eot', 'End of track']].map(([v, label]) => {
              const active = v === 'off' ? !sleepTimer
                : v === 'eot' ? sleepTimer?.type === 'eot'
                : sleepTimer?.type === 'timer' && Math.round((sleepTimer.endsAt - Date.now()) / 60000) <= Number(v)
              return (
                <button
                  key={v}
                  onClick={() => { onSleepTimer?.(v); setSleepSheetOpen(false) }}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-colors ${active ? 'text-[#fc3c44] font-semibold' : 'text-zinc-300 hover:bg-zinc-800'}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
