import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Shuffle, Repeat, Heart, Music, Loader2 } from 'lucide-react'
import { formatTime, decodeHtmlEntities } from '../utils'

export default function PlayerBar({ currentSong, isPlaying, onTogglePlay, onPrev, onNext, volume, onVolumeChange, muted, onMuteToggle, shuffle, onShuffleToggle, repeat, onRepeatToggle, liked, onLikeToggle, currentTime, duration, onSeek, onArtworkClick, isSearchingAlbum, isMobileMiniplayer = false }) {
  if (!currentSong) {
    return (
      <div className={`${isMobileMiniplayer ? 'h-16' : 'h-[72px]'} bg-black/95 border-t border-zinc-800/60 flex items-center px-4 md:px-6`}>
        <p className="text-zinc-600 text-sm">Select a song to play</p>
      </div>
    )
  }

  const artwork = currentSong.artworkUrl || currentSong.moviePosterUrl || currentSong.imageUrl

  if (isMobileMiniplayer) {
    return (
      <div className="h-16 bg-black/95 backdrop-blur border-t border-zinc-800/60 flex items-center px-3 gap-2">
        {/* Now Playing - Compact */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {artwork ? (
            <img
              src={artwork}
              alt={currentSong.album}
              className="w-10 h-10 rounded object-cover shadow flex-shrink-0"
              onError={e => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-10 h-10 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
              <Music size={16} className="text-zinc-600" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">{decodeHtmlEntities(currentSong.name || currentSong.title)}</p>
            <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
          </div>
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
        <button onClick={onLikeToggle} className="flex-shrink-0 ml-1">
          <Heart size={15} className={`transition-colors ${liked ? 'text-[#fc3c44] fill-[#fc3c44]' : 'text-zinc-600 hover:text-[#fc3c44]'}`} />
        </button>
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1.5 max-w-lg mx-auto">
        <div className="flex items-center gap-5 text-zinc-400">
          <button onClick={onShuffleToggle} className={`transition-colors ${shuffle ? 'text-[#fc3c44]' : 'hover:text-white'}`}>
            <Shuffle size={15} />
          </button>
          <button onClick={onPrev} className="hover:text-white transition-colors">
            <SkipBack size={20} className="fill-zinc-400 hover:fill-white" />
          </button>
          <button
            onClick={onTogglePlay}
            className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform shadow-md"
          >
            {isPlaying
              ? <Pause size={15} className="text-black fill-black" />
              : <Play size={15} className="text-black fill-black ml-0.5" />
            }
          </button>
          <button onClick={onNext} className="hover:text-white transition-colors">
            <SkipForward size={20} className="fill-zinc-400 hover:fill-white" />
          </button>
          <button onClick={onRepeatToggle} className={`transition-colors ${repeat ? 'text-[#fc3c44]' : 'hover:text-white'}`}>
            <Repeat size={15} />
          </button>
        </div>
        <div className="w-full flex items-center gap-2 text-xs text-zinc-600">
          <span>{formatTime(currentTime)}</span>
          <div 
            className="flex-1 h-1 bg-zinc-800 rounded-full cursor-pointer group relative"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const percent = (e.clientX - rect.left) / rect.width
              onSeek(percent * duration)
            }}
          >
            <div 
              className="h-full bg-zinc-400 rounded-full group-hover:bg-zinc-300 transition-colors" 
              style={{ width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' }}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="w-1/3 flex items-center justify-end gap-2 text-zinc-500">
        <button onClick={onMuteToggle} className="hover:text-white cursor-pointer transition-colors">
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
