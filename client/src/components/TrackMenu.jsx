import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { MoreHorizontal, Heart, ListPlus, Play, Disc3, ListMusic, Plus, ChevronLeft, Radio, Mic2, Share2, Download, Check, UserRound } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { downloadSong, removeDownload, isDownloaded } from '../utils/downloads'
import { haptic } from '../utils'
import LyricsModal from './LyricsModal'
import { useAppAuth } from './AuthGate'

export default function TrackMenu({ song, likedSongs, onLikeToggle, onPlayNext, onAddToQueue, onGoToAlbum, onSongRadio, showToast, triggerClass }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [newPlName, setNewPlName] = useState('')
  const [creatingPl, setCreatingPl] = useState(false)
  const [lyricsOpen, setLyricsOpen] = useState(false)
  const [downloaded, setDownloaded] = useState(() => isDownloaded(song.id))
  const [downloading, setDownloading] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const playlists = usePlaylistStore(s => s.playlists)
  const createPlaylist = usePlaylistStore(s => s.createPlaylist)
  const addSong = usePlaylistStore(s => s.addSong)
  const { requireAuth } = useAppAuth()
  // Guests can play/queue/browse — likes, playlists & downloads are member-only
  const gate = (fn, msg) => () => requireAuth(fn, () => { setOpen(false); showToast?.(msg) })

  const liked = likedSongs?.has(song.id)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const menuHeight = 360 // generous estimate incl. playlist picker
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

  const act = (fn) => { setOpen(false); setShowPlaylistPicker(false); haptic(); fn?.() }

  const handleAddTo = (pid) => {
    const result = addSong(pid, song)
    act(() => showToast?.(
      result === 'exists' ? 'Already in playlist' : result === 'added' ? `Added to ${playlists[pid]?.name || 'playlist'}` : 'Failed to add',
      result === 'added' ? 'success' : 'error'
    ))
  }

  const itemCls = 'flex items-center gap-3 w-full px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors text-left'
  const albumId = song.albumId || (typeof song.album === 'object' ? song.album?.id : null)
  const isLocal = song.isLocal || song.audioPath
  const artistId = song.artists?.primary?.[0]?.id || song.artistId

  const toggleDownload = async () => {
    if (downloaded) {
      await removeDownload(song.id)
      setDownloaded(false)
      showToast?.('Removed from downloads')
      return
    }
    setDownloading(true)
    try {
      await downloadSong(song)
      setDownloaded(true)
      showToast?.('Downloaded for offline', 'success')
    } catch (e) {
      console.error('Download failed:', e)
      showToast?.(`Download failed: ${e?.message || 'error'}`, 'error')
    } finally {
      setDownloading(false)
    }
  }

  const shareSong = async () => {
    if (isLocal) {
      showToast?.('Local tracks can\'t be shared', 'warning')
      return
    }
    const base = window.location.origin
    const url = albumId
      ? `${base}/discover/album/${albumId}`
      : `${base}/search?q=${encodeURIComponent(`${song.name || song.title || ''} ${song.artist || ''}`)}`
    const title = song.name || song.title || 'Song'
    try {
      if (navigator.share) await navigator.share({ title, url })
      else { await navigator.clipboard.writeText(url); showToast?.('Link copied', 'success') }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(url); showToast?.('Link copied', 'success') }
        catch { showToast?.('Could not share', 'error') }
      }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); setShowPlaylistPicker(false) }}
        className={triggerClass || "p-2 text-zinc-500 hover:text-white transition-colors touch-target"}
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
              {creatingPl ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    autoFocus
                    value={newPlName}
                    onChange={e => setNewPlName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newPlName.trim()) { handleAddTo(createPlaylist(newPlName)); setCreatingPl(false); setNewPlName('') }
                      if (e.key === 'Escape') { setCreatingPl(false); setNewPlName('') }
                    }}
                    placeholder="Playlist name"
                    className="flex-1 bg-zinc-800 text-sm text-white rounded px-2 py-1.5 outline-none placeholder:text-zinc-500 min-w-0"
                  />
                  <button
                    disabled={!newPlName.trim()}
                    onClick={() => { handleAddTo(createPlaylist(newPlName)); setCreatingPl(false); setNewPlName('') }}
                    className="px-2 py-1 text-xs font-medium rounded bg-[#fc3c44] text-white disabled:opacity-40 transition-opacity"
                  >
                    Add
                  </button>
                </div>
              ) : (
                <button className={itemCls} onClick={() => setCreatingPl(true)}>
                  <Plus size={16} /> New playlist
                </button>
              )}
            </>
          ) : (
            <>
              <button className={itemCls} onClick={() => act(() => onPlayNext?.(song))}>
                <Play size={16} /> Play next
              </button>
              <button className={itemCls} onClick={() => act(() => onAddToQueue?.(song))}>
                <ListPlus size={16} /> Add to queue
              </button>
              <button className={itemCls} onClick={gate(() => setShowPlaylistPicker(true), 'Sign in to use playlists')}>
                <ListMusic size={16} /> Add to playlist
              </button>
              <button className={itemCls} onClick={() => act(() => onSongRadio?.(song))}>
                <Radio size={16} /> Go to song radio
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
              <button
                className={`${itemCls} ${!artistId ? 'opacity-40 cursor-not-allowed' : ''}`}
                disabled={!artistId}
                onClick={() => act(() => navigate(`/discover/artist/${artistId}`))}
              >
                <UserRound size={16} /> Go to artist
              </button>
              <div className="border-t border-zinc-800 my-1" />
              <button className={itemCls} disabled={downloading} onClick={gate(toggleDownload, 'Sign in to download for offline')}>
                {downloading
                  ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-white rounded-full animate-spin shrink-0" />
                  : downloaded ? <Check size={16} className="text-emerald-400" /> : <Download size={16} />}
                {downloading ? 'Downloading…' : downloaded ? 'Downloaded' : 'Download'}
              </button>
              <button className={itemCls} onClick={() => act(() => setLyricsOpen(true))}>
                <Mic2 size={16} /> View lyrics
              </button>
              <button className={itemCls} onClick={() => act(shareSong)}>
                <Share2 size={16} /> Share
              </button>
            </>
          )}
        </div>,
        document.body
      )}
      {lyricsOpen && <LyricsModal song={song} onClose={() => setLyricsOpen(false)} />}
    </>
  )
}