import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListMusic, Plus, Pencil, Trash2, Music } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { getImageSrc } from '../utils'

export default function PlaylistsView({ showToast }) {
  const navigate = useNavigate()
  const playlists = usePlaylistStore(s => s.playlists)
  const createPlaylist = usePlaylistStore(s => s.createPlaylist)
  const renamePlaylist = usePlaylistStore(s => s.renamePlaylist)
  const deletePlaylist = usePlaylistStore(s => s.deletePlaylist)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')

  const list = Object.values(playlists).sort((a, b) => b.createdAt - a.createdAt)

  const handleCreate = () => {
    const name = window.prompt('Playlist name')
    if (name?.trim()) {
      const id = createPlaylist(name)
      showToast?.('Playlist created', 'success')
      navigate(`/playlists/${id}`)
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
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-medium rounded-full transition-colors touch-target"
        >
          <Plus size={16} /> New Playlist
        </button>
      </div>

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
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setEditingId(p.id); setEditName(p.name) }}
                      className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        if (window.confirm(`Delete "${p.name}"?`)) {
                          deletePlaylist(p.id)
                          showToast?.('Playlist deleted', 'success')
                        }
                      }}
                      className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}