import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, Heart, ListPlus, Play, Disc3, ListMusic, Plus, ChevronLeft } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'

export default function TrackMenu({ song, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, showToast }) {
  const [open, setOpen] = useState(false)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const playlists = usePlaylistStore(s => s.playlists)
  const createPlaylist = usePlaylistStore(s => s.createPlaylist)
  const addSong = usePlaylistStore(s => s.addSong)

  const liked = likedSongs?.has(song.id)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = 320 // generous estimate incl. playlist picker
    const menuWidth = 224
    const flip = rect.bottom + menuHeight > window.innerHeight
    setPos({
      top: flip ? Math.max(8, rect.top - menuHeight) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8))
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    // Menu is fixed-positioned while triggers live in scroll containers —
    // any scroll detaches it from the row, so just close (capture: inner
    // scrollers don't bubble scroll events)
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  const act = (fn) => { setOpen(false); setShowPlaylistPicker(false); fn?.() }

  const handleAddTo = (pid) => {
    const result = addSong(pid, song)
    act(() => showToast?.(
      result === 'exists' ? 'Already in playlist' : result === 'added' ? `Added to ${playlists[pid]?.name || 'playlist'}` : 'Failed to add',
      result === 'added' ? 'success' : 'error'
    ))
  }

  const itemCls = 'flex items-center gap-3 w-full px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors text-left'
  const albumId = song.albumId || (typeof song.album === 'object' ? song.album?.id : null)

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); setShowPlaylistPicker(false) }}
        className="p-2 text-zinc-500 hover:text-white transition-colors touch-target"
        title="More options"
      >
        <MoreHorizontal size={18} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed w-56 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-[100] py-1 overflow-hidden"
          style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}
        >
          {showPlaylistPicker ? (
            <>
              <button className={itemCls} onClick={() => setShowPlaylistPicker(false)}>
                <ChevronLeft size={16} /> Back
              </button>
              <div className="max-h-48 overflow-y-auto">
                {Object.values(playlists).map(p => (
                  <button key={p.id} className={itemCls} onClick={() => handleAddTo(p.id)}>
                    <ListMusic size={16} className="text-zinc-500 shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
                {Object.keys(playlists).length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-500">No playlists yet</div>
                )}
              </div>
              <button className={itemCls} onClick={() => {
                const name = window.prompt('Playlist name')
                if (name?.trim()) handleAddTo(createPlaylist(name))
              }}>
                <Plus size={16} /> New playlist
              </button>
            </>
          ) : (
            <>
              <button className={itemCls} onClick={() => act(() => onPlayNext?.(song))}>
                <Play size={16} /> Play next
              </button>
              <button className={itemCls} onClick={() => act(() => onAddToQueue?.(song))}>
                <ListPlus size={16} /> Add to queue
              </button>
              <button className={itemCls} onClick={() => setShowPlaylistPicker(true)}>
                <ListMusic size={16} /> Add to playlist
              </button>
              <button className={itemCls} onClick={() => act(() => onLikeToggle?.(song.id))}>
                <Heart size={16} className={liked ? 'fill-[#fc3c44] text-[#fc3c44]' : ''} />
                {liked ? 'Unlike' : 'Like'}
              </button>
              <button
                className={`${itemCls} ${!albumId ? 'opacity-40 cursor-not-allowed' : ''}`}
                disabled={!albumId}
                onClick={() => act(() => onGoToAlbum?.(song))}
              >
                <Disc3 size={16} /> Go to album
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  )
}