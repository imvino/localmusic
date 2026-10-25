// Daily-mix construction — pure functions extracted from DiscoverView so the
// bucketing/capping math is unit-testable (spec: a broad seeded history must
// not produce a single-artist echo).
import { normalizeArtistName, isContentBlocked, slimSong } from './sync'

// Max N songs per artist — keeps a mix varied instead of one artist's discography.
export const capPerArtist = (songs, max = 3) => {
  const counts = new Map()
  return songs.filter(s => {
    const k = normalizeArtistName(s.artist || s.artists?.primary?.[0]?.name || s.primaryArtists || '')
    const n = counts.get(k) || 0
    if (n >= max) return false
    counts.set(k, n + 1)
    return true
  })
}

// Group top playCount-weighted artists into ≤3 buckets of ~3 artists each.
// Each bucket becomes one Daily Mix (lead artist names it, "& more" suffix
// when multi-artist). Skipped songs de-rank via net = plays − 2×skips.
export function buildMixBuckets(playCounts, skipCounts = {}) {
  try {
    const net = (e) => (e.count || 1) - 2 * (skipCounts[e.id]?.count || 0)
    const byArtist = new Map()
    for (const e of Object.values(playCounts || {})) {
      if (!e?.id || !e.artist) continue
      const key = normalizeArtistName(e.artist)
      if (!key) continue
      if (!byArtist.has(key)) byArtist.set(key, { name: e.artist, songs: [], total: 0 })
      const c = byArtist.get(key)
      c.songs.push(e)
      c.total += e.count || 1
    }
    const artists = [...byArtist.values()].sort((a, b) => b.total - a.total).slice(0, 9)
    if (!artists.length) return []
    const size = Math.ceil(artists.length / 3)
    const buckets = []
    for (let i = 0; i < artists.length; i += size) {
      buckets.push(artists.slice(i, i + size))
    }
    return buckets.map(bucket => ({
      lead: bucket[0].name,
      multi: bucket.length > 1,
      // own top songs across the bucket's artists, per-artist capped
      seeds: capPerArtist(
        bucket.flatMap(c => c.songs.filter(e => net(e) > 0).sort((x, y) => net(y) - net(x))),
        4
      ).slice(0, 10),
      // ≤3 distinct-artist suggestion seeds — one per bucket artist
      suggSeeds: bucket.map(c => c.songs.filter(e => net(e) > 0).sort((x, y) => net(y) - net(x))[0]).filter(Boolean)
    }))
  } catch { return [] }
}

// Assemble one mix from a bucket + fetched per-seed suggestions:
// member's own seeds first, then discovery fill, dedup + blocklist +
// capPerArtist, trimmed to 20.
export function assembleDailyMix(bucket, suggestions = {}, blockCtx, index = 0) {
  const ctx = blockCtx || {}
  const seen = new Set()
  const seeds = bucket.seeds
    .filter(s => s?.id && !isContentBlocked(s, ctx) && !seen.has(s.id) && seen.add(s.id))
    .map(s => slimSong(s) || s)
  const fill = bucket.suggSeeds.flatMap(s => suggestions?.[s.id] || [])
    .filter(s => s?.id && !seen.has(s.id) && seen.add(s.id) && !isContentBlocked(s, ctx))
    .map(s => slimSong(s) || s)
  return {
    title: `Daily Mix ${index + 1} — ${bucket.lead}${bucket.multi ? ' & more' : ''}`,
    songs: capPerArtist([...seeds, ...fill], 3).slice(0, 20)
  }
}
