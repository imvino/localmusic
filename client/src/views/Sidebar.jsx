import { Compass, RefreshCw, Keyboard, X, Trash2, ListMusic, Settings, Heart, Music, Radio, Timer, SlidersHorizontal, BarChart3, Waves, Download, Lock, Pin, EyeOff, Folder, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { usePlaylistStore } from '../stores/playlistStore'
import { EQ_PRESETS, isEqAvailable } from '../audio/eq'
import UserMenu from '../components/UserMenu'
import BackupControls from '../components/BackupControls'
import { useAppAuth } from '../components/AuthGate'

const API_BASE = import.meta.env.VITE_API_URL
const isProduction = import.meta.env.MODE === 'production'

const NAV_ITEMS = [
  { id: 'discover', label: 'Discover', icon: Compass, path: '/discover' },
]

export default function Sidebar({ showToast, onClose, qualityPreference, onQualityChange, autoplayEnabled, onAutoplayToggle, sleepTimer, onSleepTimer, eqSettings, onEqChange, smoothTransitions, onSmoothTransitionsToggle, installPrompt, onInstall, onImportLibrary, likedCount, privateSession, onPrivateSessionToggle }) {
  const location = useLocation()
  const currentPath = location.pathname
  const playlists = usePlaylistStore(s => s.playlists)
  const folders = usePlaylistStore(s => s.folders)
  const { isSignedIn, openSignIn } = useAppAuth()
  const [isScanning, setIsScanning] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showQualitySettings, setShowQualitySettings] = useState(false)
  const [showEqSettings, setShowEqSettings] = useState(false)
  const [collapsedFolders, setCollapsedFolders] = useState({})
  const [sleepMenuOpen, setSleepMenuOpen] = useState(false)

  const sleepTimerValue = sleepTimer?.type === 'eot' ? 'eot'
    : sleepTimer?.type === 'timer' ? String(Math.max(1, Math.round((sleepTimer.endsAt - Date.now()) / 60000)))
    : 'off'

  const handleScan = async () => {
    setIsScanning(true)
    try {
      const response = await fetch(`${API_BASE}/api/scan`, { method: 'POST' })
      const data = await response.json()
      if (data.success) {
        const removedAlbums = Number.isFinite(data.removedAlbums) ? data.removedAlbums : 0
        const removedSongs = Number.isFinite(data.removedSongs) ? data.removedSongs : 0
        const albums = Number.isFinite(data.albums) ? data.albums : 0
        const songs = Number.isFinite(data.songs) ? data.songs : 0

        const lines = [
          'Library scan complete',
          ...(removedAlbums > 0 || removedSongs > 0
            ? [`Removed ${removedAlbums} album${removedAlbums === 1 ? '' : 's'}, ${removedSongs} song${removedSongs === 1 ? '' : 's'}`]
            : ['No changes required. All files present']
          ),
          `Library: ${albums} album${albums === 1 ? '' : 's'}, ${songs} song${songs === 1 ? '' : 's'}`
        ]

        const conciseMessage = lines.join('\n')

        if (showToast) {
          showToast(conciseMessage, 'success')
          
          // Show size warning if file exceeds 5MB
          if (data.sizeWarning && data.fileSizeMB) {
            setTimeout(() => {
              showToast(`Library file size is ${data.fileSizeMB} MB (exceeds 5MB threshold)`, 'warning')
            }, 1000)
          }
        } else {
          console.log(conciseMessage)
          if (data.sizeWarning && data.fileSizeMB) {
            console.warn(`Library file size is ${data.fileSizeMB} MB (exceeds 5MB threshold)`)
          }
        }
      } else {
        if (showToast) {
          showToast('Scan failed: ' + data.error, 'error')
        } else {
          console.error('Scan failed:', data.error)
        }
      }
    } catch (error) {
      if (showToast) {
        showToast('Scan failed: ' + error.message, 'error')
      } else {
        console.error('Scan failed:', error.message)
      }
    } finally {
      setIsScanning(false)
    }
  }

  const handleClearCache = async () => {
    try {
      // Clear React Query cache from localStorage (keys containing 'react' or 'query')
      const reactQueryKeys = Object.keys(localStorage).filter(key => 
        key.toLowerCase().includes('react') || key.toLowerCase().includes('query')
      )
      reactQueryKeys.forEach(key => localStorage.removeItem(key))

      // Clear sessionStorage
      sessionStorage.clear()

      // Unregister service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const registration of registrations) {
          await registration.unregister()
        }
      }

      // Clear all caches
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }

      if (showToast) {
        showToast('Cache cleared successfully. Reloading...', 'success')
      }

      // Reload page after short delay
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error) {
      if (showToast) {
        showToast('Failed to clear cache: ' + error.message, 'error')
      } else {
        console.error('Failed to clear cache:', error.message)
      }
    }
  }

  return (
    <div className="w-56 bg-black flex-shrink-0 flex flex-col border-r border-zinc-900 h-full">
      <div className="p-5 flex flex-col gap-6 overflow-y-auto flex-1">
        {/* Logo with close button for mobile */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-white font-bold text-lg mt-1">
            <img src="/logo.svg" alt="Torsongs" className="w-7 h-7 flex-shrink-0" />
            Torsongs
          </div>
          {onClose && (
            <button onClick={onClose} className="text-zinc-400 hover:text-white md:hidden">
              <X size={20} />
            </button>
          )}
        </div>

        {/* Library nav */}
        <div className="flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => (
            <Link
              key={id}
              to={path}
              className={`hidden md:flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
                ${currentPath === path || (path === '/discover' && currentPath === '/')
                  ? 'bg-zinc-800 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
            >
              <Icon size={17} className={(currentPath === path || (path === '/discover' && currentPath === '/')) ? 'text-[#fc3c44]' : ''} />
              {label}
            </Link>
          ))}

          {/* Scan button - Only in development */}
          {!isProduction && (
          <button
            onClick={handleScan}
            disabled={isScanning}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
              ${isScanning
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
          >
            <RefreshCw size={17} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? 'Scanning...' : 'Scan Library'}
          </button>
          )}

          {/* Shortcuts button - Hidden on mobile */}
          <button
            onClick={() => setShowShortcuts(true)}
            className="hidden md:flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          >
            <Keyboard size={17} />
            Shortcuts
          </button>
        </div>

        {/* Clear Cache - Available to all users */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2">Settings</div>
          
          <button
            onClick={() => setShowQualitySettings(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          >
            <Settings size={17} />
            Streaming Quality
          </button>
          
          <button
            onClick={handleClearCache}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          >
            <Trash2 size={17} />
            Clear Cache
          </button>

          <button
            onClick={onAutoplayToggle}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          >
            <div className="flex items-center gap-3">
              <Radio size={17} />
              Autoplay
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${autoplayEnabled ? 'bg-[#fc3c44] text-white' : 'bg-zinc-800 text-zinc-500'}`}>
              {autoplayEnabled ? 'On' : 'Off'}
            </span>
          </button>

          {/* Sleep timer — compact chip + preset popover (native <select>
              chrome was oversized on mobile). Chip shows the live value:
              Off / 32m / EOT */}
          <div className="relative">
            <button
              onClick={() => setSleepMenuOpen(o => !o)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-3 whitespace-nowrap">
                <Timer size={17} className={sleepTimer ? 'text-[#fc3c44]' : ''} />
                <span className={sleepTimer ? 'text-white' : ''}>Sleep timer</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${sleepTimer ? 'bg-[#fc3c44] text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                {sleepTimerValue === 'eot' ? 'EOT' : sleepTimerValue === 'off' ? 'Off' : `${sleepTimerValue}m`}
              </span>
            </button>
            {sleepMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSleepMenuOpen(false)} />
                <div className="absolute right-2 top-full mt-1 z-50 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-xl min-w-[150px]">
                  {[['off', 'Off'], ['15', '15 min'], ['30', '30 min'], ['60', '60 min'], ['eot', 'End of track']].map(([v, label]) => {
                    const active = v === 'off' ? !sleepTimer
                      : v === 'eot' ? sleepTimer?.type === 'eot'
                      : sleepTimer?.type === 'timer' && String(Math.max(1, Math.round((sleepTimer.endsAt - Date.now()) / 60000))) === v
                    return (
                      <button
                        key={v}
                        onClick={() => { onSleepTimer?.(v); setSleepMenuOpen(false) }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${active ? 'text-[#fc3c44] font-semibold bg-zinc-800/60' : 'text-zinc-300 hover:bg-zinc-800'}`}
                      >
                        {label}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>

          {/* EQ */}
          {isEqAvailable() && (
            <button
              onClick={() => setShowEqSettings(true)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-3">
                <SlidersHorizontal size={17} />
                Equalizer
              </div>
              {eqSettings?.enabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-[#fc3c44] text-white">On</span>
              )}
            </button>
          )}

          {/* Smooth transitions */}
          <button
            onClick={() => onSmoothTransitionsToggle?.(!smoothTransitions)}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          >
            <div className="flex items-center gap-3 whitespace-nowrap">
              <Waves size={17} />
              Smooth transitions
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${smoothTransitions ? 'bg-[#fc3c44] text-white' : 'bg-zinc-800 text-zinc-500'}`}>
              {smoothTransitions ? 'On' : 'Off'}
            </span>
          </button>

          {/* Private session — device-scoped; pauses history/count writes
              so a shared listening session doesn't skew personalization */}
          <button
            onClick={() => onPrivateSessionToggle?.(!privateSession)}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
          >
            <div className="flex items-center gap-3">
              <EyeOff size={17} />
              Private session
            </div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${privateSession ? 'bg-[#fc3c44] text-white' : 'bg-zinc-800 text-zinc-500'}`}>
              {privateSession ? 'On' : 'Off'}
            </span>
          </button>

          {/* Stats — member-only surface */}
          {isSignedIn && (
          <Link
            to="/stats"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
              ${currentPath === '/stats'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
          >
            <BarChart3 size={17} />
            Your Stats
          </Link>
          )}
        </div>

        {/* Library — member-only; guests get a sign-in teaser instead of
            leaking liked/playlist names (also the previous user's data after
            sign-out on shared devices) */}
        {isSignedIn ? (
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2">Library</div>

          <Link
            to="/liked"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
              ${currentPath === '/liked'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
          >
            <Heart size={17} />
            Liked Songs
            {likedCount > 0 && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{likedCount}</span>}
          </Link>

          <Link
            to="/playlists"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
              ${currentPath.startsWith('/playlists')
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
          >
            <ListMusic size={17} />
            Playlists
          </Link>

          <Link
            to="/downloads"
            onClick={onClose}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full
              ${currentPath === '/downloads'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
          >
            <Download size={17} />
            Downloads
          </Link>

          {/* Recent playlists inline — pinned wins over folder grouping;
              unpinned members nest under a collapsible folder row */}
          {(() => {
            const all = Object.values(playlists)
            const pinned = all.filter(p => p.pinned)
            const unfiled = all.filter(p => !p.pinned && (!p.folderId || !folders[p.folderId]))
            const flat = [...pinned, ...unfiled].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt).slice(0, 5)
            const byFolder = {}
            for (const p of all) {
              if (p.pinned || !p.folderId || !folders[p.folderId]) continue
              ;(byFolder[p.folderId] ||= []).push(p)
            }
            const plLink = p => (
              <Link
                key={p.id}
                to={`/playlists/${p.id}`}
                onClick={onClose}
                className={`flex items-center gap-3 pl-6 pr-3 py-2 rounded-xl text-xs font-medium transition-all text-left w-full truncate
                  ${currentPath === `/playlists/${p.id}`
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-500 hover:text-white hover:bg-zinc-800/40'}`}
              >
                {p.pinned ? <Pin size={14} className="shrink-0 fill-[#fc3c44] text-[#fc3c44]" /> : <Music size={14} className="shrink-0" />}
                <span className="truncate">{p.name}</span>
              </Link>
            )
            return (
              <>
                {flat.map(plLink)}
                {Object.entries(byFolder).map(([fid, members]) => {
                  const collapsed = !!collapsedFolders[fid]
                  return (
                    <div key={fid}>
                      <button
                        onClick={() => setCollapsedFolders(c => ({ ...c, [fid]: !collapsed }))}
                        className="flex items-center gap-3 pl-6 pr-3 py-2 rounded-xl text-xs font-medium transition-all text-left w-full text-zinc-500 hover:text-white hover:bg-zinc-800/40"
                      >
                        {collapsed ? <ChevronRight size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
                        {collapsed ? <Folder size={14} className="shrink-0" /> : <FolderOpen size={14} className="shrink-0" />}
                        <span className="truncate">{folders[fid].name}</span>
                        <span className="ml-auto text-[10px] text-zinc-600">{members.length}</span>
                      </button>
                      {!collapsed && members.sort((a, b) => b.createdAt - a.createdAt).map(p => (
                        <Link
                          key={p.id}
                          to={`/playlists/${p.id}`}
                          onClick={onClose}
                          className={`flex items-center gap-3 pl-12 pr-3 py-2 rounded-xl text-xs font-medium transition-all text-left w-full truncate
                            ${currentPath === `/playlists/${p.id}`
                              ? 'bg-zinc-800 text-white'
                              : 'text-zinc-500 hover:text-white hover:bg-zinc-800/40'}`}
                        >
                          <Music size={14} className="shrink-0" />
                          <span className="truncate">{p.name}</span>
                        </Link>
                      ))}
                    </div>
                  )
                })}
              </>
            )
          })()}
        </div>
        ) : (
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2">Library</div>
          <button
            onClick={openSignIn}
            className="flex items-center gap-3 px-3 py-3 rounded-xl text-left w-full bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
          >
            <Lock size={16} className="text-[#fc3c44] shrink-0" />
            <span>
              <span className="block text-sm font-medium text-zinc-200">Your Library</span>
              <span className="block text-xs text-zinc-500">Sign in to unlock likes, playlists & downloads</span>
            </span>
          </button>
        </div>
        )}

        {/* Install prompt — only rendered when the browser offers A2HS */}
        {installPrompt && (
          <div className="flex flex-col gap-0.5 mb-4">
            <button
              onClick={onInstall}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold bg-[#fc3c44] text-white hover:bg-[#e03239] transition-colors"
            >
              <Download size={16} /> Install App
            </button>
          </div>
        )}

        {/* Backup & restore — library safety net */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1 px-2">Backup</div>
          <BackupControls onImportLibrary={onImportLibrary} showToast={showToast} />
        </div>

        {/* Legal links */}
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2">Legal</div>
          <Link
            to="/terms"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left w-full
              ${currentPath === '/terms'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800/40'}`}
          >
            Terms of Service
          </Link>
          <Link
            to="/privacy"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left w-full
              ${currentPath === '/privacy'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800/40'}`}
          >
            Privacy Policy
          </Link>
          <Link
            to="/dmca"
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all text-left w-full
              ${currentPath === '/dmca'
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-500 hover:text-white hover:bg-zinc-800/40'}`}
          >
            DMCA & Disclaimer
          </Link>
        </div>

        {/* Account — sign in / user menu (bottom of sidebar, Spotify style) */}
        <div className="mt-auto pt-4 border-t border-zinc-800/60">
          {privateSession && (
            <div className="flex items-center gap-1.5 px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-amber-400">
              <EyeOff size={12} /> Private
            </div>
          )}
          <UserMenu />
        </div>
      </div>

      {/* Shortcuts Modal */}
      {showShortcuts && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowShortcuts(false)}>
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Play / Pause</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">Space</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Next Track</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">→</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Previous Track</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">←</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Volume Up</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">↑</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Volume Down</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">↓</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Mute / Unmute</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">M</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Toggle Shuffle</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">S</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Toggle Repeat</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">R</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Like / Unlike</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">L</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Seek to 0%</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">0</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Seek to 10-90%</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">1-9</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Seek to Start</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">Home</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Seek to End</span>
                <kbd className="px-2 py-1 bg-zinc-800 rounded text-zinc-300 text-xs">End</kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quality Settings Modal */}
      {showQualitySettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowQualitySettings(false)}>
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Streaming Quality</h2>
              <button onClick={() => setShowQualitySettings(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => { onQualityChange('auto'); setShowQualitySettings(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${qualityPreference === 'auto' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
              >
                <div className="text-left">
                  <div className="font-medium">Auto</div>
                  <div className="text-xs text-zinc-500 mt-1">Adjusts based on connection (WiFi: 320kbps, Cellular: 160kbps)</div>
                </div>
                {qualityPreference === 'auto' && <div className="w-2 h-2 bg-[#fc3c44] rounded-full" />}
              </button>
              <button
                onClick={() => { onQualityChange('low-data'); setShowQualitySettings(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${qualityPreference === 'low-data' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
              >
                <div className="text-left">
                  <div className="font-medium">Low Data</div>
                  <div className="text-xs text-zinc-500 mt-1">Always 96kbps (saves ~50% data on cellular)</div>
                </div>
                {qualityPreference === 'low-data' && <div className="w-2 h-2 bg-[#fc3c44] rounded-full" />}
              </button>
              <button
                onClick={() => { onQualityChange('high-quality'); setShowQualitySettings(false); }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all
                  ${qualityPreference === 'high-quality' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
              >
                <div className="text-left">
                  <div className="font-medium">High Quality</div>
                  <div className="text-xs text-zinc-500 mt-1">Always 320kbps (best sound quality)</div>
                </div>
                {qualityPreference === 'high-quality' && <div className="w-2 h-2 bg-[#fc3c44] rounded-full" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EQ Modal */}
      {showEqSettings && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowEqSettings(false)}>
          <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Equalizer</h2>
              <button onClick={() => setShowEqSettings(false)} className="text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Enable toggle */}
            <button
              onClick={() => onEqChange?.({ ...eqSettings, enabled: !eqSettings?.enabled })}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all mb-4
                ${eqSettings?.enabled ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/40'}`}
            >
              <div className="text-left">
                <div className="font-medium">{eqSettings?.enabled ? 'Enabled' : 'Disabled'}</div>
                <div className="text-xs text-zinc-500 mt-1">3-band EQ via Web Audio</div>
              </div>
              <div className={`w-2 h-2 rounded-full ${eqSettings?.enabled ? 'bg-[#fc3c44]' : 'bg-zinc-700'}`} />
            </button>

            {/* Presets */}
            <div className="flex gap-2 mb-5 flex-wrap">
              {Object.keys(EQ_PRESETS).map(name => (
                <button
                  key={name}
                  onClick={() => onEqChange?.({ ...eqSettings, enabled: true, preset: name, ...EQ_PRESETS[name] })}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize
                    ${eqSettings?.preset === name && eqSettings?.enabled
                      ? 'bg-[#fc3c44] text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
                >
                  {name === 'flat' ? 'Flat' : name === 'bass' ? 'Bass Boost' : name === 'vocal' ? 'Vocal' : 'Treble'}
                </button>
              ))}
            </div>

            {/* Band sliders */}
            {[
              { key: 'low', label: 'Bass', freq: '200 Hz' },
              { key: 'mid', label: 'Mid', freq: '1 kHz' },
              { key: 'high', label: 'Treble', freq: '3 kHz' }
            ].map(({ key, label, freq }) => (
              <div key={key} className="mb-4">
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>{label} <span className="text-zinc-600">({freq})</span></span>
                  <span>{(eqSettings?.[key] ?? 0) > 0 ? '+' : ''}{eqSettings?.[key] ?? 0} dB</span>
                </div>
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={1}
                  disabled={!eqSettings?.enabled}
                  value={eqSettings?.[key] ?? 0}
                  onChange={e => onEqChange?.({ ...eqSettings, enabled: true, preset: 'custom', [key]: parseInt(e.target.value) })}
                  className="w-full accent-[#fc3c44] disabled:opacity-40"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

