import { X, ArrowUp, ArrowDown, Trash2, ListX, Music } from 'lucide-react'

export default function QueueDrawer({ open, onClose, queue, queueIndex, shuffle, shuffleOrder, shufflePos = -1, isPlaying, onPlayAt, onRemoveAt, onMove, onClear }) {
  if (!open) return null

  // Display order: shuffleOrder when shuffling, else raw queue indices
  const order = shuffle && shuffleOrder.length > 0
    ? shuffleOrder
    : queue.map((_, i) => i)

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
          {order.map((queueIdx, displayPos) => {
            const song = queue[queueIdx]
            if (!song) return null
            const isCurrent = queueIdx === queueIndex
            const title = song.title || song.name || 'Unknown'
            const artist = song.artist || song.artists?.primary?.[0]?.name || song.primaryArtists || ''
            return (
              <div
                key={`${displayPos}-${song.id}`}
                className={`group flex items-center gap-3 px-4 py-2 hover:bg-zinc-800/60 transition-colors ${isCurrent ? 'bg-zinc-800/40' : ''}`}
              >
                <button
                  onClick={() => onPlayAt(displayPos)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <span className={`w-5 text-xs text-center shrink-0 ${isCurrent ? 'text-[#fc3c44] font-semibold' : 'text-zinc-600'}`}>
                    {isCurrent && isPlaying ? '▶' : displayPos + 1}
                  </span>
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
          })}
        </div>
      </div>
    </>
  )
}