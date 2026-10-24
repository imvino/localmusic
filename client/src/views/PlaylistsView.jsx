import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ListMusic, Plus, Pencil, Trash2, Music, Check, X, Pin, Folder, FolderOpen, ChevronDown, ChevronRight, FolderPlus } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import { clearTombstone } from '../utils/sync'
import { getImageSrc } from '../utils'

export default function PlaylistsView({ showToast }) {
  const navigate = useNavigate()
  const playlists = usePlaylistStore(s => s.playlists)
  const folders = usePlaylistStore(s => s.folders)
  const createPlaylist = usePlaylistStore(s => s.createPlaylist)
  const renamePlaylist = usePlaylistStore(s => s.renamePlaylist)
  const deletePlaylist = usePlaylistStore(s => s.deletePlaylist)
  const pinPlaylist = usePlaylistStore(s => s.pinPlaylist)
  const createFolder = usePlaylistStore(s => s.createFolder)
  const renameFolder = usePlaylistStore(s => s.renameFolder)
  const deleteFolder = usePlaylistStore(s => s.deleteFolder)
  const setPlaylistFolder = usePlaylistStore(s => s.setPlaylistFolder)
  const [editingId, setEditingId] = useState(null)
  const [editingFolderId, setEditingFolderId] = useState(null)
  const [editName, setEditName] = useState('')
  const [creating, setCreating] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [confirmDeleteFolderId, setConfirmDeleteFolderId] = useState(null)
  const [movePickerId, setMovePickerId] = useState(null)
  const [collapsedFolders, setCollapsedFolders] = useState({})

  const all = Object.values(playlists)
  // Pinned wins over folder grouping — pinned playlists always render flat
  const pinned = all.filter(p => p.pinned)
  const unfiled = all.filter(p => !p.pinned && (!p.folderId || !folders[p.folderId]))
  const flat = [...pinned, ...unfiled].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt)
  const folderGroups = Object.values(folders)
    .map(f => ({ ...f, members: all.filter(p => !p.pinned && p.folderId === f.id).sort((a, b) => b.createdAt - a.createdAt) }))
    .sort((a, b) => b.createdAt - a.createdAt)

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

  const commitCreateFolder = () => {
    const name = newName.trim()
    if (name) {
      createFolder(name)
      showToast?.('Folder created', 'success')
    }
    setCreatingFolder(false)
    setNewName('')
  }

  const commitRename = (id) => {
    if (editName.trim()) renamePlaylist(id, editName)
    setEditingId(null)
  }

  const commitRenameFolder = (id) => {
    if (editName.trim()) renameFolder(id, editName)
    setEditingFolderId(null)
  }

  const card = (p) => {
    const art = p.songs.map(s => getImageSrc(s.image)).find(Boolean)
    return (
      <div
        key={p.id}
        className="group bg-zinc-900/60 hover:bg-zinc-800/60 rounded-xl p-3 cursor-pointer transition-colors relative"
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
                onClick={e => { e.stopPropagation(); setMovePickerId(movePickerId === p.id ? null : p.id) }}
                className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                title="Move to folder"
              >
                <FolderPlus size={13} />
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
        {movePickerId === p.id && (
          <div
            className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setPlaylistFolder(p.id, null); setMovePickerId(null) }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors ${!p.folderId ? 'text-[#fc3c44] font-semibold' : 'text-zinc-300 hover:bg-zinc-800'}`}
            >
              No folder
            </button>
            {folderGroups.map(f => (
              <button
                key={f.id}
                onClick={() => { setPlaylistFolder(p.id, f.id); setMovePickerId(null) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center gap-2 ${p.folderId === f.id ? 'text-[#fc3c44] font-semibold' : 'text-zinc-300 hover:bg-zinc-800'}`}
              >
                <Folder size={12} className="shrink-0" /> <span className="truncate">{f.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="px-4 md:px-8 py-6">
      <div className="flex items-center justify-between mb-6 gap-2">
        <h1 className="text-2xl font-bold text-white">Playlists</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreatingFolder(true); setNewName('') }}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-full transition-colors touch-target"
          >
            <FolderPlus size={16} /> New Folder
          </button>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#fc3c44] hover:bg-[#e03239] text-white text-sm font-medium rounded-full transition-colors touch-target"
          >
            <Plus size={16} /> New Playlist
          </button>
        </div>
      </div>

      {(creating || creatingFolder) && (
        <div className="mb-6 bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
            {creatingFolder ? <Folder size={18} className="text-zinc-500" /> : <ListMusic size={18} className="text-zinc-500" />}
          </div>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (creatingFolder ? commitCreateFolder() : commitCreate()); if (e.key === 'Escape') { setCreating(false); setCreatingFolder(false); setNewName('') } }}
            placeholder={creatingFolder ? 'Folder name' : 'Playlist name'}
            className="flex-1 bg-zinc-800 text-sm text-white rounded-lg px-3 py-2.5 outline-none placeholder:text-zinc-500 min-w-0"
          />
          <button onClick={creatingFolder ? commitCreateFolder : commitCreate} className="p-2 rounded-full bg-[#fc3c44] text-white hover:bg-[#e03239] transition-colors shrink-0" title="Create">
            <Check size={16} />
          </button>
          <button onClick={() => { setCreating(false); setCreatingFolder(false); setNewName('') }} className="p-2 text-zinc-500 hover:text-white transition-colors shrink-0" title="Cancel">
            <X size={16} />
          </button>
        </div>
      )}

      {all.length === 0 && folderGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-zinc-500 gap-3">
          <ListMusic size={40} />
          <p className="text-sm">No playlists yet — create one, then add songs from any ••• menu</p>
        </div>
      ) : (
        <>
          {/* Flat section — pinned + un-filed (pinned always wins over folder grouping) */}
          {flat.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
              {flat.map(card)}
            </div>
          )}

          {/* Folder groups — collapsible; deleting a folder un-files members */}
          {folderGroups.map(f => {
            const collapsed = !!collapsedFolders[f.id]
            return (
              <div key={f.id} className="mb-6">
                <div className="flex items-center gap-2 mb-3 px-1 group">
                  <button
                    onClick={() => setCollapsedFolders(c => ({ ...c, [f.id]: !collapsed }))}
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                  >
                    {collapsed ? <ChevronRight size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
                    {collapsed ? <Folder size={17} className="text-[#fc3c44] shrink-0" /> : <FolderOpen size={17} className="text-[#fc3c44] shrink-0" />}
                    {editingFolderId === f.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => commitRenameFolder(f.id)}
                        onKeyDown={e => { if (e.key === 'Enter') commitRenameFolder(f.id); if (e.key === 'Escape') setEditingFolderId(null) }}
                        onClick={e => e.stopPropagation()}
                        className="bg-zinc-800 text-sm text-white rounded px-2 py-1 outline-none"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-white truncate">{f.name}</span>
                    )}
                    <span className="text-xs text-zinc-600 shrink-0">{f.members.length}</span>
                  </button>
                  {confirmDeleteFolderId === f.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          deleteFolder(f.id) // un-files members, writes tombstone
                          setConfirmDeleteFolderId(null)
                          showToast?.('Folder deleted — playlists kept', 'success')
                        }}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setConfirmDeleteFolderId(null)}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => { setEditingFolderId(f.id); setEditName(f.name) }}
                        className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                        title="Rename folder"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteFolderId(f.id)}
                        className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors"
                        title="Delete folder (playlists are kept)"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                {!collapsed && (
                  f.members.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pl-6">
                      {f.members.map(card)}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600 pl-9 pb-2">Empty — use ⋯ → folder icon on a playlist to file it here</p>
                  )
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
