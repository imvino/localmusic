import { Play, Pause, SkipBack, SkipForward, Volume2, Shuffle, Repeat, Heart, Music } from 'lucide-react'

export default function PlayerBar({ currentSong, isPlaying, onTogglePlay, onPrev, onNext }) {
  if (!currentSong) {
    return (
      <div className="h-[72px] bg-black/95 border-t border-zinc-800/60 flex items-center px-6">
        <p className="text-zinc-600 text-sm">Select a song to play</p>
      </div>
    )
  }

  const artwork = currentSong.artworkUrl || currentSong.moviePosterUrl

  return (
    <div className="h-[72px] bg-black/95 backdrop-blur border-t border-zinc-800/60 flex items-center px-4 gap-3">
      {/* Now Playing */}
      <div className="flex items-center gap-3 w-1/3 min-w-0">
        {artwork ? (
          <img
            src={artwork}
            alt={currentSong.album}
            className="w-12 h-12 rounded-lg object-cover shadow flex-shrink-0"
            onError={e => { e.target.style.display = 'none' }}
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
            <Music size={18} className="text-zinc-600" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate leading-snug">{currentSong.title}</p>
          <p className="text-xs text-zinc-400 truncate">{currentSong.artist}</p>
        </div>
        <button className="flex-shrink-0 ml-1">
          <Heart size={15} className="text-zinc-600 hover:text-[#fc3c44] transition-colors" />
        </button>
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1.5 max-w-lg mx-auto">
        <div className="flex items-center gap-5 text-zinc-400">
          <button className="hover:text-white transition-colors">
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
          <button className="hover:text-white transition-colors">
            <Repeat size={15} />
          </button>
        </div>
        <div className="w-full flex items-center gap-2 text-xs text-zinc-600">
          <span>0:00</span>
          <div className="flex-1 h-1 bg-zinc-800 rounded-full">
            <div className="h-full w-0 bg-zinc-400 rounded-full" />
          </div>
          <span>{currentSong.length || '0:00'}</span>
        </div>
      </div>

      {/* Volume */}
      <div className="w-1/3 flex items-center justify-end gap-2 text-zinc-500">
        <Volume2 size={15} className="hover:text-white cursor-pointer transition-colors" />
        <div className="w-20 h-1 bg-zinc-800 rounded-full cursor-pointer">
          <div className="h-full w-3/4 bg-zinc-400 rounded-full" />
        </div>
      </div>
    </div>
  )
}
