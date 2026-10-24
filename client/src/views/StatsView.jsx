import { useMemo, useState } from 'react'
import { BarChart3, Music, Mic2, Clock3, Heart, TrendingUp, Play, Trash2 } from 'lucide-react'
import { decodeHtmlEntities } from '../utils'
import ArtImage from '../components/ArtImage'

const relTime = (ts) => {
  if (!ts) return ''
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export default function StatsView({ likedSongs, onSongClick, showToast }) {
  const [version, setVersion] = useState(0)
  const [confirmClear, setConfirmClear] = useState(false)
  const history = useMemo(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('playHistory') || '[]')
      return Array.isArray(raw) ? raw : []
    } catch { return [] }
  }, [version])

  const clearHistory = () => {
    try { localStorage.setItem('playHistory', '[]') } catch { /* quota */ }
    setConfirmClear(false)
    setVersion(v => v + 1)
    showToast?.('Play history cleared')
  }

  const stats = useMemo(() => {
    const songCounts = new Map()
    const artistCounts = new Map()
    let minutes = 0
    for (const s of history) {
      if (!s?.id) continue
      const entry = songCounts.get(s.id) || { ...s, count: 0 }
      entry.count++
      songCounts.set(s.id, entry)
      const artist = s.artist || s.artists?.primary?.[0]?.name
      if (artist) artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1)
      minutes += (parseInt(s.duration) || 0) / 60
    }
    return {
      plays: history.length,
      minutes: Math.round(minutes),
      topSongs: [...songCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10),
      topArtists: [...artistCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    }
  }, [history])

  return (
    <div className="p-4 md:p-8 pb-32">
      <h1 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
        <BarChart3 className="text-[#fc3c44]" /> Your Stats
      </h1>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center text-zinc-500 gap-3">
          <TrendingUp size={40} />
          <p className="text-sm">Nothing yet — start listening and your stats will show up here.</p>
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <StatCard icon={Music} label="Plays" value={stats.plays} />
            <StatCard icon={Clock3} label="Minutes" value={stats.minutes} />
            <StatCard icon={Heart} label="Liked" value={likedSongs?.size ?? 0} />
            <StatCard icon={Mic2} label="Artists" value={stats.topArtists.length} />
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Top songs */}
            <section>
              <h2 className="text-lg font-bold text-white mb-4">Top Songs</h2>
              <div className="flex flex-col gap-1">
                {stats.topSongs.map((song, i) => (
                  <div
                    key={song.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSongClick?.(song, stats.topSongs, i)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSongClick?.(song, stats.topSongs, i) } }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group cursor-pointer"
                  >
                    <span className="text-zinc-500 text-sm w-5 text-right shrink-0">{i + 1}</span>
                    <div className="relative shrink-0">
                      <ArtImage image={song.image} alt="" className="w-9 h-9 rounded" iconSize={14} fallback={Music} />
                      <div className="absolute inset-0 rounded bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play size={12} className="text-white" fill="currentColor" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{decodeHtmlEntities(song.name || song.title)}</p>
                      <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">{song.count} plays</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Top artists */}
            <section>
              <h2 className="text-lg font-bold text-white mb-4">Top Artists</h2>
              <div className="flex flex-col gap-1">
                {stats.topArtists.map(([name, count], i) => (
                  <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-800/60">
                    <span className="text-zinc-500 text-sm w-5 text-right shrink-0">{i + 1}</span>
                    <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <Mic2 size={14} className="text-zinc-600" />
                    </div>
                    <span className="text-sm text-white truncate flex-1">{decodeHtmlEntities(name)}</span>
                    <span className="text-xs text-zinc-500 shrink-0">{count} plays</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Recently played — newest first, Spotify's "Recently played" feed */}
          <section className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Recently played</h2>
              {confirmClear ? (
                <div className="flex items-center gap-2">
                  <button onClick={clearHistory} className="px-3 py-1.5 text-xs font-medium rounded-full bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
                    Clear history
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="px-3 py-1.5 text-xs font-medium rounded-full bg-zinc-800 text-zinc-400 hover:text-white transition-colors">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <Trash2 size={13} /> Clear
                </button>
              )}
            </div>
            <div className="flex flex-col gap-1">
              {history.slice(0, 20).map((song, i) => (
                <div
                  key={`${song.id}-${song.ts || i}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSongClick?.(song, history.slice(0, 20), i)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSongClick?.(song, history.slice(0, 20), i) } }}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-zinc-800/60 transition-colors group cursor-pointer"
                >
                  <div className="relative shrink-0">
                    <ArtImage image={song.image} alt="" className="w-9 h-9 rounded" iconSize={14} fallback={Music} />
                    <div className="absolute inset-0 rounded bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play size={12} className="text-white" fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{decodeHtmlEntities(song.name || song.title)}</p>
                    <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0">{relTime(song.ts)}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-4 flex items-center gap-3">
      <Icon size={20} className="text-[#fc3c44] shrink-0" />
      <div className="min-w-0">
        <div className="text-xl font-bold text-white">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  )
}
