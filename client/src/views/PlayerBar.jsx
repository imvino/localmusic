import { useRef, useState } from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Repeat1, Heart, Music, Loader2, ListVideo, Mic2 } from 'lucide-react'
import { Range, getTrackBackground } from 'react-range'
import { formatTime, decodeHtmlEntities, getSongArtwork } from '../utils'
import TrackMenu from '../components/TrackMenu'

export default function PlayerBar({ currentSong, isPlaying, onTogglePlay, onPrev, onNext, volume, onVolumeChange, muted, onMuteToggle, shuffle, onShuffleToggle, repeat, onRepeatToggle, liked, onLikeToggle, currentTime, duration, onSeek, onArtworkClick, onQueueToggle, onLyricsToggle, isSearchingAlbum, isMobileMiniplayer = false, onOpenFullScreen = null, likedSongs, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, showToast }) {
  const touch = useRef(null)
  // Scrub preview — seek commits once on release, not per drag frame
  const [dragT, setDragT] = useState(null)

  if (!currentSong) {
    return null
  }

  const artwork = getSongArtwork(currentSong)

  if (isMobileMiniplayer) {
    // Swipe up on the mini player opens the full player (native feel).
    // Ignore gestures that start on controls — a Play tap with thumb drift
    // must not also open the player. touchcancel clears stale state.
    const onTouchStart = (e) => {
      if (e.target.closest('button')) return
      const t = e.touches[0]
      touch.current = { y: t.clientY, id: t.identifier }
    }
    const onTouchEnd = (e) => {
      const t = [...e.changedTouches].find(t => t.identifier === touch.current?.id)
      if (t && touch.current.y - t.clientY > 40) onOpenFullScreen?.()
      touch.current = null
    }
    return (
      <div
        className="h-16 bg-zinc-900 flex items-center px-3 gap-2 relative"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touch.current = null }}
      >
        {/* Hairline progress across the top — like Spotify's mini player */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-zinc-800">
          <div
            className="h-full bg-[#fc3c44]"
            style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
        {/* Now Playing - Compact */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {artwork ? (
            <button
              onClick={onArtworkClick}
              className="flex-shrink-0 hover:scale-105 transition-transform relative"
              disabled={isSearchingAlbum}
            >
              <img
                src={artwork}
                alt={currentSong.album}
                className="w-10 h-10 rounded object-cover shadow"
                onError={e => { e.target.style.display = 'none' }}
              />
              {isSearchingAlbum && (
                <div className="absolute inset-0 bg-black/60 rounded flex items-center justify-center">
                  <Loader2 size={14} className="text-white animate-spin" />
                </div>
              )}
            </button>
          ) : (
            <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Music size={16} className="text-zinc-600" />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenFullScreen()
            }}
            className="min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
          >
            <p className="text-xs font-semibold text-white truncate">{decodeHtmlEntities(currentSong.name || currentSong.title)}</p>
            <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
          </button>
        </div>

        {/* Compact Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onPrev} className="hover:text-white transition-colors text-zinc-400 p-1">
            <SkipBack size={16} className="fill-zinc-400 hover:fill-white" />
          </button>
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform shadow-md flex-shrink-0"
          >
            {isPlaying
              ? <Pause size={14} className="text-black fill-black" />
              : <Play size={14} className="text-black fill-black ml-0.5" />
            }
          </button>
          <button onClick={onNext} className="hover:text-white transition-colors text-zinc-400 p-1">
            <SkipForward size={16} className="fill-zinc-400 hover:fill-white" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[72px] bg-black/95 backdrop-blur border-t border-zinc-800/60 flex items-center px-4 gap-3">
      {/* Now Playing */}
      <div className="flex items-center gap-3 w-1/3 min-w-0">
        {artwork ? (
          <button
            onClick={onArtworkClick}
            className="flex-shrink-0 hover:scale-105 transition-transform relative"
            disabled={isSearchingAlbum}
          >
            <img
              src={artwork}
              alt={currentSong.album}
              className="w-12 h-12 rounded-lg object-cover shadow"
              onError={e => { e.target.style.display = 'none' }}
            />
            {isSearchingAlbum && (
              <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                <Loader2 size={18} className="text-white animate-spin" />
              </div>
            )}
          </button>
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <Music size={18} className="text-zinc-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate leading-snug">{decodeHtmlEntities(currentSong.name || currentSong.title)}</p>
          <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
        </div>
        <button onClick={onLikeToggle} className="flex-shrink-0 ml-1" aria-label={liked ? 'Remove from liked songs' : 'Like this song'} title={liked ? 'Liked' : 'Like'}>
          <Heart size={15} className={`transition-colors ${liked ? 'text-[#fc3c44] fill-[#fc3c44]' : 'text-zinc-600 hover:text-[#fc3c44]'}`} />
        </button>
        <TrackMenu
          song={currentSong}
          likedSongs={likedSongs}
          onLikeToggle={onLikeToggle ? () => onLikeToggle() : undefined}
          onPlayNext={onPlayNext}
          onAddToQueue={onAddToQueue}
          onGoToAlbum={onGoToAlbum}
          onSongRadio={onSongRadio}
          showToast={showToast}
        />
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1.5 max-w-lg mx-auto">
        <div className="flex items-center gap-5 text-zinc-400">
          <button onClick={onShuffleToggle} className={`transition-colors ${shuffle ? 'text-[#fc3c44]' : 'hover:text-white'}`} aria-label="Shuffle" title="Shuffle">
            <Shuffle size={15} />
          </button>
          <button onClick={onPrev} className="hover:text-white transition-colors" aria-label="Previous track" title="Previous">
            <SkipBack size={20} className="fill-zinc-400 hover:fill-white" />
          </button>
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform shadow-md"
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying
              ? <Pause size={15} className="text-black fill-black" />
              : <Play size={15} className="text-black fill-black ml-0.5" />
            }
          </button>
          <button onClick={onNext} className="hover:text-white transition-colors" aria-label="Next track" title="Next">
            <SkipForward size={20} className="fill-zinc-400 hover:fill-white" />
          </button>
          <button onClick={onRepeatToggle} className={`transition-colors ${repeat !== 'off' ? 'text-[#fc3c44]' : 'hover:text-white'}`} title={`Repeat: ${repeat}`} aria-label={`Repeat: ${repeat}`}>
            {repeat === 'one' ? <Repeat1 size={15} /> : <Repeat size={15} />}
          </button>
        </div>
        <div className="w-full flex items-center gap-2 text-xs text-zinc-600">
          <span>{formatTime(dragT ?? currentTime)}</span>
          <div className="flex-1 relative group py-1.5 -my-1.5">
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
                  className="h-1 rounded-full"
                  style={{
                    ...props.style,
                    background: getTrackBackground({
                      values: [dragT ?? currentTime],
                      colors: ['#a1a1aa', '#27272a'],
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
                const { key, ...rest } = props // react-range spreads key via props — pass it directly
                return (
                  <div
                    key={key}
                    {...rest}
                    aria-label="Seek"
                    className={`h-3 w-3 bg-white rounded-full shadow cursor-grab active:cursor-grabbing transition-opacity ${isDragged ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    style={{ ...props.style }}
                  />
                )
              }}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="w-1/3 flex items-center justify-end gap-2 text-zinc-500">
        <button onClick={onLyricsToggle} className="hover:text-white cursor-pointer transition-colors" title="Lyrics" aria-label="Lyrics">
          <Mic2 size={16} />
        </button>
        <button onClick={onQueueToggle} className="hover:text-white cursor-pointer transition-colors" title="Queue" aria-label="Queue">
          <ListVideo size={16} />
        </button>
        <button onClick={onMuteToggle} className="hover:text-white cursor-pointer transition-colors" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={muted ? 0 : volume}
          onChange={e => {
            onVolumeChange(parseFloat(e.target.value))
            if (muted && parseFloat(e.target.value) > 0) {
              onMuteToggle()
            }
          }}
          className="w-20 h-1 accent-zinc-400 cursor-pointer appearance-none bg-zinc-800 rounded-full"
          style={{ accentColor: '#a1a1aa' }}
        />
      </div>
    </div>
  )
}
