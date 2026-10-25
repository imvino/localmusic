import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Download, BarChart3, ChevronRight, ListMusic, Music, Disc3, Mic2, Loader2, Search, X } from 'lucide-react'
import { usePlaylistStore } from '../stores/playlistStore'
import ArtImage from '../components/ArtImage'
import { getImageSrc, decodeHtmlEntities } from '../utils'

const API_BASE = import.meta.env.VITE_API_URL

// Your Library — the member's own world: synced collections (saved albums,
// followed artists) + liked/downloads/stats + playlists. The local
// music-library index is a bonus layer that only exists on the owner's LAN —
// when it's unreachable (production) the member content stands alone.
export default function LibraryView({ likedSongs, savedAlbums, followedArtists, onSongClick }) {
  const navigate = useNavigate()
  const playlists = usePlaylistStore(s => s.playlists)
  const [albums, setAlbums] = useState(null)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState('albums') // albums | artists
  const [query, setQuery] = useState('')

  // Saved collections (object lists live in localStorage; the Set props bump
  // on every toggle/sync so this view re-renders fresh)
  const savedAlbumList = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem('savedAlbums') || '[]')) } catch { return [] }
  }, [savedAlbums])
  const followedArtistList = useMemo(() => {
    try { return (JSON.parse(localStorage.getItem('followedArtists') || '[]')) } catch { return [] }
  }, [followedArtists])

  useEffect(() => {
    let live = true
    fetch(`${API_BASE}/api/albums`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => { if (live) { setAlbums(Array.isArray(data) ? data : []) } })
      .catch(() => { if (live) setError(true) })
    return () => { live = false }
  }, [])

  const playlistList = Object.values(playlists).slice(0, 5)
  const downloads = (() => { try { return JSON.parse(localStorage.getItem('downloads') || '[]') } catch { return [] } })()

  // Artist index — folder names in the library layout are the artist names
  const artists = useMemo(() => {
    if (!albums) return []
    const map = new Map()
    for (const a of albums) {
      const parts = (a.localPath || '').split('/').filter(Boolean)
      const artist = parts[parts.length - 2] || 'Unknown Artist'
      if (!map.has(artist)) map.set(artist, { name: artist, count: 0, image: '' })
      const entry = map.get(artist)
      entry.count++
      if (!entry.image) entry.image = a.songs?.find(s => s.imageUrl)?.imageUrl || ''
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  }, [albums])

  const filteredAlbums = useMemo(() => {
    if (!albums) return []
    const q = query.trim().toLowerCase()
    if (!q) return albums
    return albums.filter(a =>
      (a.name || '').toLowerCase().includes(q) ||
      (a.year || '').toString().includes(q)
    )
  }, [albums, query])

  const filteredArtists = artists.filter(a => !query.trim() || a.name.toLowerCase().includes(query.trim().toLowerCase()))

  const Row = ({ icon: Icon, label, sub, to, tint }) => (
    <button
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-zinc-900 active:bg-zinc-800 transition-colors text-left"
    >
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium truncate">{label}</div>
        {sub && <div className="text-xs text-zinc-500 truncate">{sub}</div>}
      </div>
      <ChevronRight size={18} className="text-zinc-600 shrink-0" />
    </button>
  )

  return (
    <div className="px-4 pt-4 pb-32">
      <h1 className="text-2xl font-bold text-white mb-4">Your Library</h1>

      <div className="bg-zinc-900/60 rounded-xl overflow-hidden divide-y divide-zinc-800/60 mb-6">
        <Row icon={Heart} label="Liked Songs" sub={`${likedSongs?.size ?? 0} songs`} to="/liked" tint="bg-gradient-to-br from-[#fc3c44] to-[#7c1d26]" />
        <Row icon={Download} label="Downloads" sub={`${downloads.length} available offline`} to="/downloads" tint="bg-gradient-to-br from-emerald-500 to-emerald-800" />
        <Row icon={BarChart3} label="Your Stats" sub="Listening activity" to="/stats" tint="bg-gradient-to-br from-indigo-500 to-indigo-800" />
      </div>

      {/* Saved albums — synced member collection */}
      {savedAlbumList.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Heart size={18} className="text-[#fc3c44]" /> Saved Albums
            </h2>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3 mb-6">
            {savedAlbumList.slice(0, 21).map(album => (
              <button key={album.id} onClick={() => navigate(`/discover/album/${album.id}`)} className="group text-left">
                <ArtImage
                  image={album.image}
                  alt={album.name}
                  className="aspect-square w-full rounded-lg"
                  imgClassName="group-hover:scale-105 transition-transform"
                  iconSize={28}
                  fallback={Disc3}
                />
                <div className="mt-2">
                  <div className="text-xs font-medium text-white truncate group-hover:text-[#fc3c44] transition-colors">
                    {decodeHtmlEntities(album.name)}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">{album.artist || 'Album'}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Following — synced member collection */}
      {followedArtistList.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Mic2 size={18} className="text-[#fc3c44]" /> Following
            </h2>
          </div>
          <div className="flex flex-wrap gap-4 mb-6">
            {followedArtistList.map(artist => (
              <button key={artist.id} onClick={() => navigate(`/discover/artist/${artist.id}`)} className="flex flex-col items-center gap-2 w-20 group">
                <ArtImage
                  image={artist.image}
                  alt={artist.name}
                  className="w-20 h-20 rounded-full"
                  imgClassName="group-hover:scale-105 transition-transform"
                  iconSize={26}
                  fallback={Mic2}
                />
                <div className="text-xs font-medium text-white truncate w-full text-center group-hover:text-[#fc3c44] transition-colors">{decodeHtmlEntities(artist.name)}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Collection — the owner's local music index; only rendered when the
          LAN endpoint is reachable (dev/home server), never an error state */}
      {(albums === null && !error) && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="animate-spin text-zinc-500" size={28} />
        </div>
      )}
      {albums && albums.length > 0 && (
      <>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Disc3 size={18} className="text-[#fc3c44]" /> Collection
        </h2>
        <span className="text-xs text-zinc-500">{albums.length} albums · {albums.reduce((n, a) => n + (a.songs?.length || 0), 0)} songs</span>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex gap-1 bg-zinc-900 rounded-full p-1">
          {['albums', 'artists'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                tab === t ? 'bg-[#fc3c44] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${tab}`}
            className="w-full bg-zinc-900 text-sm text-white placeholder-zinc-600 rounded-full pl-9 pr-8 py-2 outline-none focus:border-zinc-700 border border-transparent transition-colors"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {tab === 'albums' ? (
        filteredAlbums.length ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {filteredAlbums.map(album => {
              const art = album.songs?.find(s => s.imageUrl)?.imageUrl || ''
              return (
                <button
                  key={album.id}
                  onClick={() => navigate(`/library/album/${album.id}`, { state: { album } })}
                  className="group text-left"
                >
                  <ArtImage
                    image={art}
                    alt={album.name}
                    className="aspect-square w-full rounded-lg"
                    imgClassName="group-hover:scale-105 transition-transform"
                    iconSize={28}
                    fallback={Disc3}
                  />
                  <div className="mt-2">
                    <div className="text-xs font-medium text-white truncate group-hover:text-[#fc3c44] transition-colors">
                      {decodeHtmlEntities(album.name)}
                    </div>
                    <div className="text-[11px] text-zinc-500 truncate">
                      {(album.localPath || '').split('/').filter(Boolean).slice(-2)[0] || 'Album'}{album.year ? ` · ${album.year}` : ''}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
            <Search size={32} />
            <p className="text-sm">No albums match "{query}"</p>
          </div>
        )
      ) : filteredArtists.length ? (
        <div className="flex flex-wrap gap-4">
          {filteredArtists.map(artist => (
            <button
              key={artist.name}
              onClick={() => navigate(`/library/album/${albums.find(a => (a.localPath || '').includes(artist.name))?.id}`, {
                state: { album: albums.find(a => (a.localPath || '').includes(artist.name)), artistName: artist.name }
              })}
              className="flex flex-col items-center gap-2 w-20 group"
            >
              <ArtImage
                image={artist.image}
                alt={artist.name}
                className="w-20 h-20 rounded-full"
                imgClassName="group-hover:scale-105 transition-transform"
                iconSize={26}
                fallback={Mic2}
              />
              <div className="text-xs font-medium text-white truncate w-full text-center group-hover:text-[#fc3c44] transition-colors">{decodeHtmlEntities(artist.name)}</div>
              <div className="text-[11px] text-zinc-500 -mt-1.5">{artist.count} albums</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-500 gap-3">
          <Mic2 size={32} />
          <p className="text-sm">No artists match "{query}"</p>
        </div>
      )}
      </>
      )}

      {/* Playlists */}
      <div className="flex items-center justify-between mt-8 mb-2 px-1">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ListMusic size={18} className="text-[#fc3c44]" /> Playlists
        </h2>
        <button onClick={() => navigate('/playlists')} className="text-sm text-[#fc3c44] font-medium">See all</button>
      </div>
      {playlistList.length ? (
        <div className="bg-zinc-900/60 rounded-xl overflow-hidden divide-y divide-zinc-800/60">
          {playlistList.map(pl => {
            const first = pl.songs?.[0]
            return (
              <button
                key={pl.id}
                onClick={() => navigate(`/playlists/${pl.id}`)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-zinc-900 active:bg-zinc-800 transition-colors text-left"
              >
                <ArtImage
                  image={first?.image || first?.imageUrl}
                  alt=""
                  className="w-11 h-11 rounded-lg"
                  iconSize={18}
                  fallback={ListMusic}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{decodeHtmlEntities(pl.name)}</div>
                  <div className="text-xs text-zinc-500">{pl.songs?.length || 0} songs</div>
                </div>
                <ChevronRight size={18} className="text-zinc-600 shrink-0" />
              </button>
            )
          })}
        </div>
      ) : (
        <button
          onClick={() => navigate('/playlists')}
          className="w-full flex flex-col items-center justify-center gap-2 py-10 bg-zinc-900/60 rounded-xl text-zinc-500"
        >
          <Music size={28} />
          <span className="text-sm">Create your first playlist</span>
        </button>
      )}
    </div>
  )
}