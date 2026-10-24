// Parse LRC-formatted synced lyrics into [{time, text}] sorted by time.
// Lines may carry multiple timestamps; metadata tags ([ti:], [ar:], ...) are dropped.
export function parseLrc(lrc) {
  if (!lrc || typeof lrc !== 'string') return []
  const out = []
  for (const line of lrc.split('\n')) {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (!matches.length) continue
    const text = line.replace(/\[[^\]]*\]/g, '').trim()
    for (const m of matches) {
      const time = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0)
      if (text) out.push({ time, text })
    }
  }
  return out.sort((a, b) => a.time - b.time)
}

// Index of the active line for a playback position (last line at or before t).
export function activeLrcIndex(lines, t) {
  let lo = 0, hi = lines.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].time <= t) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}
