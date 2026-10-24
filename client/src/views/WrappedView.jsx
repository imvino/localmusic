import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, Share2, Loader2, Music } from 'lucide-react'
import { decodeHtmlEntities, getImageSrc } from '../utils'

// Wrapped-lite — Spotify Wrapped's shareable recap, computed locally from
// playCounts (durable per-song totals). Entries with ts:0/missing (legacy
// merges) all land in the same bucket — we can't split by year reliably,
// so the card is honestly an all-time recap labeled with the year.
export default function WrappedView({ showToast }) {
  const navigate = useNavigate()
  const canvasRef = useRef(null)
  const [sharing, setSharing] = useState(false)
  const year = new Date().getFullYear()

  const recap = useMemo(() => {
    try {
      const pc = JSON.parse(localStorage.getItem('playCounts') || '{}')
      const entries = Object.values(pc).filter(e => e?.id && (e.count || 0) > 0)
      if (!entries.length) return null
      const artists = new Map()
      let minutes = 0, plays = 0
      for (const e of entries) {
        if (e.artist) artists.set(e.artist, (artists.get(e.artist) || 0) + (e.count || 1))
        minutes += ((parseInt(e.duration) || 0) / 60) * (e.count || 1)
        plays += e.count || 1
      }
      return {
        topSongs: [...entries].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 5),
        topArtists: [...artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
        minutes: Math.round(minutes),
        plays
      }
    } catch { return null }
  }, [])

  // Canvas card — each artwork loads with crossOrigin='anonymous' (required
  // for an origin-clean canvas; referrerPolicy does NOT help here). Per-image
  // failures are skipped; text-only only when ALL artwork fails.
  const buildCard = async () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height

    const loadImg = (url) => new Promise(resolve => {
      if (!url) return resolve(null)
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    const imgs = await Promise.all(
      recap.topSongs.slice(0, 4).map(s => loadImg(getImageSrc(s.image)))
    )
    const loaded = imgs.filter(Boolean)

    // Background
    const grad = ctx.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, '#fc3c44')
    grad.addColorStop(0.55, '#5b1b4f')
    grad.addColorStop(1, '#09090b')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // Artwork grid (2x2) in the top area when any image loaded
    if (loaded.length) {
      const size = 200, gap = 8, totalW = size * 2 + gap
      const x0 = (W - totalW) / 2, y0 = 90
      imgs.slice(0, 4).forEach((img, i) => {
        const x = x0 + (i % 2) * (size + gap)
        const y = y0 + Math.floor(i / 2) * (size + gap)
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x, y, size, size, 16)
        ctx.clip()
        if (img) ctx.drawImage(img, x, y, size, size)
        else {
          ctx.fillStyle = '#27272a'
          ctx.fillRect(x, y, size, size)
        }
        ctx.restore()
      })
    }

    ctx.textAlign = 'center'
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 56px system-ui, sans-serif'
    ctx.fillText(`${year} Wrapped`, W / 2, loaded.length ? 560 : 200)
    ctx.font = '600 30px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.85)'
    ctx.fillText(`${recap.minutes.toLocaleString()} minutes · ${recap.plays.toLocaleString()} plays`, W / 2, loaded.length ? 615 : 255)

    ctx.textAlign = 'left'
    let y = loaded.length ? 700 : 340
    ctx.font = '600 26px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.6)'
    ctx.fillText('TOP SONGS', 80, y)
    y += 46
    recap.topSongs.forEach((s, i) => {
      ctx.font = '500 30px system-ui, sans-serif'
      ctx.fillStyle = '#fff'
      const name = decodeHtmlEntities(s.name || '')
      ctx.fillText(`${i + 1}. ${name.length > 28 ? name.slice(0, 28) + '…' : name}`, 80, y)
      ctx.textAlign = 'right'
      ctx.font = '500 26px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.fillText(`${s.count}×`, W - 80, y)
      ctx.textAlign = 'left'
      y += 48
    })

    y += 24
    ctx.font = '600 26px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.6)'
    ctx.fillText('TOP ARTISTS', 80, y)
    y += 46
    recap.topArtists.forEach(([name, count], i) => {
      ctx.font = '500 30px system-ui, sans-serif'
      ctx.fillStyle = '#fff'
      const n = decodeHtmlEntities(name)
      ctx.fillText(`${i + 1}. ${n.length > 28 ? n.slice(0, 28) + '…' : n}`, 80, y)
      ctx.textAlign = 'right'
      ctx.font = '500 26px system-ui, sans-serif'
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.fillText(`${count}×`, W - 80, y)
      ctx.textAlign = 'left'
      y += 48
    })

    ctx.textAlign = 'center'
    ctx.font = '500 24px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.45)'
    ctx.fillText('Torsongs — for friends & family', W / 2, H - 60)

    return canvas
  }

  const handleShare = async () => {
    setSharing(true)
    try {
      const canvas = await buildCard()
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
      const file = blob ? new File([blob], `torsongs-wrapped-${year}.png`, { type: 'image/png' }) : null
      const text = `My Torsongs ${year} Wrapped: ${recap.minutes.toLocaleString()} minutes, ${recap.plays.toLocaleString()} plays. Top: ${recap.topSongs.slice(0, 3).map(s => s.name).join(', ')}`
      if (file && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${year} Wrapped` })
      } else if (navigator.share) {
        await navigator.share({ title: `${year} Wrapped`, text })
      } else {
        await navigator.clipboard.writeText(text)
        showToast?.('Recap copied to clipboard', 'success')
      }
    } catch (e) {
      if (e?.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(`My Torsongs ${year} Wrapped: ${recap.minutes.toLocaleString()} minutes, ${recap.plays.toLocaleString()} plays`)
          showToast?.('Recap copied to clipboard', 'success')
        } catch { showToast?.('Could not share', 'error') }
      }
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="p-4 md:p-8 pb-32">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mb-6 transition-colors">
        <ArrowLeft size={16} /> Back
      </button>

      {!recap ? (
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center text-zinc-500 gap-3">
          <Sparkles size={40} />
          <h1 className="text-2xl font-bold text-white">{year} Wrapped</h1>
          <p className="text-sm max-w-xs">No listening data yet — play some songs and your recap will appear here.</p>
        </div>
      ) : (
        <div className="max-w-md mx-auto">
          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-[#fc3c44] via-[#5b1b4f] to-zinc-950 p-6 mb-6 shadow-2xl">
            <div className="text-center mb-6">
              <div className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70 mb-1">Torsongs</div>
              <h1 className="text-3xl font-black text-white">{year} Wrapped</h1>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {recap.topSongs.slice(0, 4).map(s => (
                <div key={s.id} className="aspect-square rounded-lg overflow-hidden bg-zinc-800 flex items-center justify-center">
                  {getImageSrc(s.image)
                    ? <img src={getImageSrc(s.image)} alt="" className="w-full h-full object-cover" />
                    : <Music size={24} className="text-zinc-600" />}
                </div>
              ))}
            </div>
            <div className="text-center text-white/90 font-semibold mb-6">
              {recap.minutes.toLocaleString()} minutes · {recap.plays.toLocaleString()} plays
            </div>
            <div className="space-y-2">
              {recap.topSongs.map((s, i) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-white truncate"><span className="text-white/50 mr-2">{i + 1}.</span>{decodeHtmlEntities(s.name || '')}</span>
                  <span className="text-white/50 shrink-0 ml-3">{s.count}×</span>
                </div>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
              {recap.topArtists.map(([name, count], i) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-white/80 truncate"><span className="text-white/40 mr-2">{i + 1}.</span>{decodeHtmlEntities(name)}</span>
                  <span className="text-white/40 shrink-0 ml-3">{count}×</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleShare}
            disabled={sharing}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#fc3c44] hover:bg-[#e03239] disabled:opacity-60 text-white text-sm font-semibold rounded-full transition-colors touch-target"
          >
            {sharing ? <Loader2 size={16} className="animate-spin" /> : <Share2 size={16} />}
            {sharing ? 'Building card…' : 'Share your Wrapped'}
          </button>
          <canvas ref={canvasRef} width={720} height={1280} className="hidden" />
        </div>
      )}
    </div>
  )
}
