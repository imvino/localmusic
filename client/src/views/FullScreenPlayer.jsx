import { useState, useRef, useEffect } from 'react'
import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Heart, Music, Loader2, ChevronDown } from 'lucide-react'
import { formatTime, decodeHtmlEntities } from '../utils'
import { Range, getTrackBackground } from 'react-range'

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
  isSearchingAlbum 
}) {
  const playerRef = useRef(null)

  if (!currentSong) {
    return null
  }

  const artwork = currentSong.artworkUrl || currentSong.moviePosterUrl || currentSong.imageUrl

  return (
    <div
      ref={playerRef}
      className="fixed inset-0 bg-gradient-to-b from-[#2a1a1a] to-black z-50 flex flex-col md:hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
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
        <div className="w-full mb-4 flex-shrink-0">
          <div className="relative mb-2 h-2">
            <Range
              step={0.1}
              min={0}
              max={duration || 100}
              values={[currentTime]}
              onChange={(values) => onSeek(values[0])}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
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
        <div className="flex flex-col items-center gap-4 flex-shrink-0">
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
              className={`transition-colors ${repeat ? 'text-[#fc3c44]' : 'text-zinc-400 hover:text-white'}`}
              title="Repeat"
            >
              <Repeat size={20} />
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
        </div>
      </div>
    </div>
  )
}
