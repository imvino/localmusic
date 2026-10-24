import { useRef, useState, useCallback } from 'react'

// Pure decision helpers — vitest-covered; the hook wires them to touches.
// Axis locks on the first >10px movement (~45° split: whichever axis leads);
// a swipe fires on release past `threshold` px.
export const pickSwipeAxis = (dx, dy) => {
  if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) return null
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
}
export const swipeDirection = (dragX, threshold = 70) => {
  if (dragX < -threshold) return 'left'
  if (dragX > threshold) return 'right'
  return null
}

// Horizontal swipe actions on list rows — extracted from FullScreenPlayer's
// axis-lock gesture code. Axis locks on first meaningful movement (>10px)
// so diagonal gestures don't fight vertical scrolling; the row slides with
// the finger and the action fires on release past `threshold`. Requires
// `touch-action: pan-y` on the row or iOS Safari cancels the gesture.
// Non-touch devices: handlers attach but never fire — zero UI change.
export function useSwipeAction({ onSwipeLeft, onSwipeRight, threshold = 70 } = {}) {
  const [dragX, setDragX] = useState(0)
  const touch = useRef(null)
  const swiped = useRef(false) // suppresses the click trailing a completed swipe

  const onTouchStart = useCallback((e) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, id: e.touches[0].identifier, axis: null }
  }, [])

  const onTouchMove = useCallback((e) => {
    const t = [...e.touches, ...e.changedTouches].find(t => t.identifier === touch.current?.id)
    if (!t) return
    const dx = t.clientX - touch.current.x
    const dy = t.clientY - touch.current.y
    if (!touch.current.axis) touch.current.axis = pickSwipeAxis(dx, dy)
    if (touch.current.axis === 'x') {
      // slide only toward a direction that has a handler
      const dx2 = (dx < 0 && !onSwipeLeft) || (dx > 0 && !onSwipeRight) ? 0 : dx
      setDragX(dx2)
    }
  }, [onSwipeLeft, onSwipeRight])

  const reset = useCallback(() => { setDragX(0); touch.current = null }, [])

  const onTouchEnd = useCallback(() => {
    if (touch.current?.axis === 'x') {
      const dir = swipeDirection(dragX, threshold)
      if (dir === 'left') { swiped.current = true; onSwipeLeft?.() }
      else if (dir === 'right') { swiped.current = true; onSwipeRight?.() }
    }
    reset()
    // The synthetic click lands after touchend — swallow it for a beat
    if (swiped.current) setTimeout(() => { swiped.current = false }, 400)
  }, [dragX, threshold, onSwipeLeft, onSwipeRight, reset])

  const onClickCapture = useCallback((e) => {
    if (swiped.current) { e.preventDefault(); e.stopPropagation() }
  }, [])

  return { dragX, swiping: !!touch.current, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: reset, onClickCapture } }
}
