import { useDownloadStore } from '../stores/downloadStore'
import { X, Download, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react'
import { useState } from 'react'

export default function DownloadManager() {
  const { downloads, removeDownload, clearCompleted } = useDownloadStore()
  const [isMinimized, setIsMinimized] = useState(false)

  const downloadList = Object.values(downloads)
  const activeCount = downloadList.filter(d => d.status === 'downloading').length
  const completedCount = downloadList.filter(d => d.status === 'complete').length

  if (downloadList.length === 0) {
    return null
  }

  return (
    <div className="fixed bottom-24 md:bottom-0 left-4 right-4 md:left-auto md:right-4 w-auto md:w-96 max-h-[300px] md:max-h-[500px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Download size={18} className="text-[#fc3c44]" />
          <h3 className="font-semibold text-white">Downloads</h3>
          {activeCount > 0 && (
            <span className="text-xs bg-[#fc3c44] text-white px-2 py-0.5 rounded-full font-medium">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {completedCount > 0 && (
            <button
              onClick={clearCompleted}
              className="text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-zinc-800"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-zinc-400 hover:text-white transition-colors p-1"
          >
            <ChevronDown size={18} className={`transition-transform ${isMinimized ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Downloads List */}
      {!isMinimized && (
        <div className="overflow-y-auto flex-1 min-h-0">
          {downloadList.map(download => (
            <div
              key={download.downloadId}
              className="p-3 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    {download.songName}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {download.albumName}
                  </p>
                </div>
                <button
                  onClick={() => removeDownload(download.downloadId)}
                  className="text-zinc-400 hover:text-white transition-colors flex-shrink-0 p-1 hover:bg-zinc-700 rounded"
                  title="Remove from queue"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Status and Progress */}
              {download.status === 'downloading' && (
                <>
                  <div className="w-full bg-zinc-700 rounded-full h-1.5 mb-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-[#fc3c44] to-[#ff6b6b] h-full transition-all duration-300"
                      style={{ width: `${download.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400 truncate flex-1">
                      {download.currentSong && download.totalSongs
                        ? `${download.currentSong}/${download.totalSongs} songs (${download.progress}%)`
                        : (download.current || 'Downloading...')}
                    </span>
                    <span className="text-xs font-semibold text-[#fc3c44] ml-2 flex-shrink-0">
                      {download.progress}%
                    </span>
                  </div>
                </>
              )}

              {download.status === 'complete' && (
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle size={14} />
                  <span className="text-xs font-medium">Downloaded</span>
                </div>
              )}

              {download.status === 'error' && (
                <div className="flex items-center gap-2 text-red-500">
                  <AlertCircle size={14} />
                  <span className="text-xs font-medium truncate">
                    {download.error || 'Download failed'}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
