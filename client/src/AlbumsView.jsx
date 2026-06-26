import { Play, Music } from 'lucide-react'

export default function AlbumsView({ albums, onAlbumClick }) {
  return (
    <div className="p-8 pb-10">
      <h1 className="text-3xl font-black text-white mb-6">Albums</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
        {albums.map(album => (
          <div
            key={album.name}
            onClick={() => onAlbumClick(album)}
            className="group cursor-pointer"
          >
            <div className="relative aspect-square rounded-xl overflow-hidden bg-zinc-800 shadow-lg mb-2">
              {album.artworkUrl ? (
                <img
                  src={album.artworkUrl}
                  alt={album.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={e => { e.target.style.display = 'none' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music size={36} className="text-zinc-600" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-end p-3">
                <button className="w-10 h-10 rounded-full bg-[#fc3c44] flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200">
                  <Play size={16} className="text-white fill-white ml-0.5" />
                </button>
              </div>
            </div>
            <p className="text-sm font-semibold text-white truncate leading-snug">{album.name}</p>
            <p className="text-xs text-zinc-500">{album.year || 'Unknown'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
