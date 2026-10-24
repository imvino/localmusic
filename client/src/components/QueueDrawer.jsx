import { useState } from 'react'
import { X, ArrowUp, ArrowDown, Trash2, ListX, Music, GripVertical } from 'lucide-react'
import { getImageSrc } from '../utils'

export default function QueueDrawer({ open, onClose, queue, queueIndex, shuffle, shuffleOrder, shufflePos = -1, isPlaying, onPlayAt, onRemoveAt, onMove, onMoveTo, onClear }) {
  const [dragPos, setDragPos] = useState(null)
  const [dropPos, setDropPos] = useState(null)
  if (!open) return null

  // Display order: shuffleOrder when shuffling, else raw queue indices
  const order = shuffle && shuffleOrder.length > 0
    ? shuffleOrder
    : queue.map((_, i) => i)
  const currentPos = order.findIndex(i => i === queueIndex)

  const finishDrag = () => {
    if (dragPos != null && dropPos != null && dropPos !== dragPos) {
      onMoveTo?.(dragPos, dropPos)
    }
    setDragPos(null)
    setDropPos(null)
  }

  const SongRow = ({ queueIdx, displayPos, dimmed }) => {
    const song = queue[queueIdx]
    if (!song) return null
    const isCurrent = queueIdx === queueIndex
    const title = song.title || song.name || 'Unknown'
    const artist = song.artist || song.artists?.primary?.[0]?.name || song.primaryArtists || ''
    const art = getImageSrc(song.image) || song.imageUrl
    return (
      <div
        draggable={!isCurrent}
        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); setDragPos(displayPos) }}
        onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dropPos !== displayPos) setDropPos(displayPos) }}
        onDrop={e => { e.preventDefault(); finishDrag() }}
        onDragEnd={finishDrag}
        className={`group flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/60 transition-colors ${isCurrent ? 'bg-zinc-800/40' : ''} ${dimmed ? 'opacity-50' : ''} ${dragPos === displayPos ? 'opacity-40' : ''} ${dropPos === displayPos && dragPos !== displayPos ? 'border-t-2 border-[#fc3c44]' : 'border-t-2 border-transparent'}`}
      >
        <GripVertical size={14} className="text-zinc-600 group-hover:text-zinc-400 cursor-grab active:cursor-grabbing shrink-0 hidden md:block" />
        <button
          onClick={() => onPlayAt(displayPos)}
          className="flex-1 flex items-center gap-3 text-left min-w-0"
        >
          <div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden shrink-0 relative">
            {art
              ? <img src={art} alt="" className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
              : <div className="w-full h-full flex items-center justify-center text-zinc-600"><Music size={16} /></div>}
            {isCurrent && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                {isPlaying
                  ? <span className="flex items-end gap-0.5 h-3"><i className="w-0.5 bg-[#fc3c44] animate-pulse h-3" /><i className="w-0.5 bg-[#fc3c44] animate-pulse h-2" /><i className="w-0.5 bg-[#fc3c44] animate-pulse h-3.5" /></span>
                  : <span className="text-[#fc3c44] text-xs">▶</span>}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className={`text-sm truncate ${isCurrent ? 'text-[#fc3c44] font-medium' : 'text-zinc-200'}`}>
              {title}
            </div>
            <div className="text-xs text-zinc-500 truncate">{artist}</div>
          </div>
        </button>
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={() => onMove(displayPos, -1)}
            // Under shuffle the play cursor is shufflePos — moving a
            // song to/above it is refused server-side, so don't offer it
            disabled={displayPos === 0 || (shuffle && displayPos <= shufflePos + 1)}
            className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => onMove(displayPos, 1)}
            disabled={displayPos === order.length - 1}
            className="p-1.5 text-zinc-500 hover:text-white disabled:opacity-30 transition-colors"
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            onClick={() => onRemoveAt(queueIdx)}
            className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />

      {/* Panel: right drawer on md+, bottom sheet on mobile */}
      <div className="fixed z-50 bg-zinc-900 border-zinc-800 flex flex-col
        inset-x-0 bottom-0 top-24 border-t rounded-t-2xl
        md:inset-y-0 md:right-0 md:left-auto md:w-96 md:border-l md:border-t-0 md:rounded-none">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">Queue</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              title="Clear upcoming"
            >
              <ListX size={14} /> Clear
            </button>
            <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-white transition-colors touch-target">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {order.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2">
              <Music size={28} />
              <p className="text-sm">Queue is empty</p>
            </div>
          )}
          {/* Spotify queue layout: Now playing → Next in queue → Played */}
          {currentPos >= 0 && (
            <>
              <div className="px-4 pt-2 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Now playing</div>
              <SongRow queueIdx={order[currentPos]} displayPos={currentPos} />
            </>
          )}
          {order.slice(Math.max(0, currentPos + 1)).length > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Next in queue</div>
              {order.slice(Math.max(0, currentPos + 1)).map((queueIdx, i) => (
                <SongRow key={`${currentPos + 1 + i}-${queueIdx}`} queueIdx={queueIdx} displayPos={currentPos + 1 + i} />
              ))}
            </>
          )}
          {currentPos > 0 && (
            <>
              <div className="px-4 pt-3 pb-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Played</div>
              {order.slice(0, currentPos).map((queueIdx, i) => (
                <SongRow key={`${i}-${queueIdx}`} queueIdx={queueIdx} displayPos={i} dimmed />
              ))}
            </>
          )}
          {/* No current song — plain list */}
          {currentPos < 0 && order.map((queueIdx, displayPos) => (
            <SongRow key={`${displayPos}-${queueIdx}`} queueIdx={queueIdx} displayPos={displayPos} />
          ))}
        </div>
      </div>
    </>
  )
}