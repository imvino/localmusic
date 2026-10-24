// Extract a dominant color from artwork for adaptive player/header gradients.
// Falls back to a neutral tint if the CDN image can't be sampled (CORS-taint).
const cache = new Map()

export function getDominantColor(url) {
  if (!url) return Promise.resolve(null)
  if (cache.has(url)) return Promise.resolve(cache.get(url))
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        const s = 24
        c.width = c.height = s
        const ctx = c.getContext('2d')
        ctx.drawImage(img, 0, 0, s, s)
        const { data } = ctx.getImageData(0, 0, s, s)
        let r = 0, g = 0, b = 0, n = 0
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2]
          // skip near-black/white pixels — they make mud gradients
          const max = Math.max(pr, pg, pb), min = Math.min(pr, pg, pb)
          if (max < 40 || min > 230) continue
          r += pr; g += pg; b += pb; n++
        }
        const color = n ? [r / n | 0, g / n | 0, b / n | 0] : null
        cache.set(url, color)
        resolve(color)
      } catch { cache.set(url, null); resolve(null) }
    }
    img.onerror = () => { cache.set(url, null); resolve(null) }
    img.src = url
  })
}
