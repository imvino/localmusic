import { Compass, Music, Search } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const NAV_ITEMS = [
  { id: 'discover', label: 'Discover', icon: Compass, path: '/discover' },
]

export default function Sidebar({ searchQuery, onSearch }) {
  const location = useLocation()
  const navigate = useNavigate()
  const currentPath = location.pathname

  return (
    <div className="w-56 bg-black flex-shrink-0 flex flex-col border-r border-zinc-900 h-full">
      <div className="p-5 flex flex-col gap-6 overflow-y-auto flex-1">
        {/* Logo */}
        <div className="flex items-center gap-2.5 text-white font-bold text-lg mt-1">
          <div className="w-7 h-7 bg-[#fc3c44] rounded-full flex items-center justify-center flex-shrink-0">
            <Music size={14} className="text-white" />
          </div>
          LocalMusic
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search JioSaavn..."
            value={searchQuery}
            onChange={e => {
              onSearch(e.target.value)
              if (e.target.value && currentPath !== '/search') {
                navigate('/search')
              }
            }}
            className="w-full bg-zinc-800/70 text-sm text-white placeholder-zinc-500 rounded-lg pl-8 pr-3 py-2 outline-none border border-transparent focus:border-zinc-600 transition-colors"
          />
        </div>

        {/* Library nav */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2">Library</div>
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => (
            <Link
              key={id}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
                ${currentPath === path || (path === '/discover' && currentPath === '/')
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
            >
              <Icon size={17} className={(currentPath === path || (path === '/discover' && currentPath === '/')) ? 'text-[#fc3c44]' : ''} />
              {label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

