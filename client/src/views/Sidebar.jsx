import { Compass, RefreshCw, Keyboard, X, Trash2, Download, ListMusic, Clock, Settings } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useState, useRef } from 'react'
import { useAuth } from '@clerk/react'

const API_BASE = import.meta.env.VITE_API_URL
const isProduction = import.meta.env.MODE === 'production'

const NAV_ITEMS = [
  { id: 'discover', label: 'Discover', icon: Compass, path: '/discover' },
]

export default function Sidebar({ searchQuery, onSearch, showToast, onClose, qualityPreference, onQualityChange }) {
  const location = useLocation()
  const currentPath = location.pathname
  const { isSignedIn } = useAuth()
  const [isScanning, setIsScanning] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showQualitySettings, setShowQualitySettings] = useState(false)

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
        </div>

        {/* Registered User Features - Only visible when signed in */}
        {isSignedIn && (
          <div className="flex flex-col gap-0.5">
            <div className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-2 px-2">Library</div>

            {/* Offline Music - Coming Soon */}
            <button
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-3">
                <Download size={17} />
                Offline Music
              </div>
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Soon</span>
            </button>

            {/* My Playlist - Coming Soon */}
            <button
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-3">
                <ListMusic size={17} />
                My Playlist
              </div>
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Soon</span>
            </button>

            {/* Recently Played - Coming Soon */}
            <button
              className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full text-zinc-400 hover:text-white hover:bg-zinc-800/40"
            >
              <div className="flex items-center gap-3">
                <Clock size={17} />
                Recently Played
              </div>
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">Soon</span>
            </button>
          </div>
        )}

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
    </div>
  )
}

