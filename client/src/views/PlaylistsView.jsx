import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListMusic, Plus, Pencil, Trash2, Music, Check, X, Pin } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { clearTombstone } from '../utils/sync'
import { getImageSrc } from '../utils'

export default function PlaylistsView({ showToast }) {
  const navigate = useNavigate()
  const playlists = usePlaylistStore(s => s.playlists)
  const createPlaylist = usePlaylistStore(s => s.createPlaylist)
  const renamePlaylist = usePlaylistStore(s => s.renamePlaylist)
  const deletePlaylist = usePlaylistStore(s => s.deletePlaylist)
  const pinPlaylist = usePlaylistStore(s => s.pinPlaylist)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const list = Object.values(playlists).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt)

  const commitCreate = () => {
    const name = newName.trim()
    if (name) {
      const id = createPlaylist(name)
      showToast?.('Playlist created', 'success')
      setCreating(false)
      setNewName('')
      navigate(`/playlists/${id}`)
    } else {
      setCreating(false)
    }
  }

  const commitRename = (id) => {
    if (editName.trim()) renamePlaylist(id, editName)
    setEditingId(null)
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Playlists</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-medium rounded-full transition-colors touch-target"
        >
          <Plus size={16} /> New Playlist
        </button>
      </div>

      {creating && (
        <div className="mb-6 bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
            <ListMusic size={18} className="text-zinc-500" />
          </div>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Playlist name"
            className="flex-1 bg-zinc-800 text-sm text-white rounded-lg px-3 py-2.5 outline-none placeholder:text-zinc-500 min-w-0"
          />
          <button onClick={commitCreate} className="p-2 rounded-full bg-[#fc3c44] text-white hover:bg-[#e03239] transition-colors shrink-0" title="Create">
            <Check size={16} />
          </button>
          <button onClick={() => { setCreating(false); setNewName('') }} className="p-2 text-zinc-500 hover:text-white transition-colors shrink-0" title="Cancel">
            <X size={16} />
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
          <ListMusic size={40} />
          <p className="text-sm">No playlists yet — create one, then add songs from any ••• menu</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {list.map(p => {
            const art = p.songs.map(s => getImageSrc(s.image)).find(Boolean)
            return (
              <div
                key={p.id}
                className="group bg-zinc-900/60 hover:bg-zinc-800/60 rounded-xl p-3 cursor-pointer transition-colors"
                onClick={() => navigate(`/playlists/${p.id}`)}
              >
                <div className="aspect-square rounded-lg bg-zinc-800 mb-3 overflow-hidden flex items-center justify-center">
                  {art
                    ? <img src={art} alt="" className="w-full h-full object-cover" loading="lazy" />
                    : <Music size={32} className="text-zinc-600" />}
                </div>
                {editingId === p.id ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onBlur={() => commitRename(p.id)}
                    onKeyDown={e => { if (e.key === 'Enter') commitRename(p.id); if (e.key === 'Escape') setEditingId(null) }}
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-zinc-800 text-sm text-white rounded px-2 py-1 outline-none"
                  />
                ) : (
                  <div className="text-sm font-medium text-white truncate">{p.name}</div>
                )}
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-zinc-500">{p.songs.length} song{p.songs.length === 1 ? '' : 's'}</span>
                  {confirmDeleteId === p.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          const snapshot = p
                          deletePlaylist(p.id)
                          setConfirmDeleteId(null)
                          showToast?.('Playlist deleted', 'success', {
                            label: 'Undo',
                            onClick: () => {
                              clearTombstone('playlists', snapshot.id)
                              // Fresh timestamps — a stale createdAt would be
                              // re-killed by the pushed server tombstone on
                              // the next pull (tomb.ts > createdAt ⇒ deleted).
                              const now = Date.now()
                              const restored = { ...snapshot, createdAt: now, updatedAt: now }
                              usePlaylistStore.setState(s => ({ playlists: { ...s.playlists, [snapshot.id]: restored } }))
                              showToast?.('Playlist restored', 'success')
                            }
                          })
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); pinPlaylist(p.id) }}
                        className={`p-1.5 transition-colors ${p.pinned ? 'text-[#fc3c44]' : 'text-zinc-500 hover:text-white'}`}
                        title={p.pinned ? 'Unpin' : 'Pin to top'}
                      >
                        <Pin size={13} className={p.pinned ? 'fill-[#fc3c44]' : ''} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setEditingId(p.id); setEditName(p.name) }}
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                        title="Rename"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(p.id) }}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
