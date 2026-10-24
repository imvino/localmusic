import { Heart, ListPlus } from 'lucide-react'
import { useSwipeAction } from '../hooks/useSwipeAction'
import { haptic } from '../utils'

// Spotify-style swipe actions on song rows — swipe left reveals "add to
// queue", swipe right reveals "like". The row slides with the finger and
// snaps back under the threshold; the completed swipe's trailing click is
// suppressed so it can't also trigger play.
export default function SwipeableRow({ onSwipeLeft, onSwipeRight, onClick, className = '', children }) {
  const { dragX, swiping, handlers } = useSwipeAction({
    onSwipeLeft: onSwipeLeft ? () => { haptic(); onSwipeLeft() } : undefined,
    onSwipeRight: onSwipeRight ? () => { haptic(); onSwipeRight() } : undefined
  })

  return (
    <div className="relative overflow-hidden rounded-lg" style={{ touchAction: 'pan-y' }}>
      {dragX < -8 && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-4 text-[#fc3c44]">
          <ListPlus size={20} />
        </div>
      )}
      {dragX > 8 && (
        <div className="absolute inset-y-0 left-0 flex items-center pl-4 text-[#fc3c44]">
          <Heart size={20} />
        </div>
      )}
      <div
        {...handlers}
        onClick={onClick}
        className={className}
        style={{
          transform: dragX ? `translateX(${dragX}px)` : undefined,
          transition: swiping ? 'none' : 'transform .2s ease-out',
          // Opaque while sliding so the revealed icon doesn't bleed through
          background: dragX ? '#09090b' : undefined
        }}
      >
        {children}
      </div>
    </div>
  )
}
