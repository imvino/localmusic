import { describe, it, expect } from 'vitest'
import { capPerArtist, buildMixBuckets, assembleDailyMix } from './dailyMix'

const song = (id, artist, count = 5) => ({ id, name: `Song ${id}`, artist, count })

describe('capPerArtist', () => {
  it('caps a dominant artist', () => {
    const out = capPerArtist([
      song('a1', 'ARR'), song('a2', 'ARR'), song('a3', 'ARR'), song('a4', 'ARR'),
      song('b1', 'Anirudh')
    ], 3)
    expect(out.filter(s => s.artist === 'ARR')).toHaveLength(3)
    expect(out).toHaveLength(4)
  })
})

describe('buildMixBuckets', () => {
  it('broad history produces multi-artist buckets, not a single-artist echo', () => {
    const pc = {}
    const artists = ['A.R. Rahman', 'Anirudh Ravichander', 'Harris Jayaraj',
      'Yuvan Shankar Raja', 'Sid Sriram', 'Ilaiyaraaja', 'Sean Roldan']
    artists.forEach((a, i) => {
      for (let j = 0; j < 4; j++) pc[`s${i}${j}`] = song(`s${i}${j}`, a, 10 - i)
    })
    const buckets = buildMixBuckets(pc, {})
    expect(buckets.length).toBeGreaterThanOrEqual(2)
    // every bucket after the first must contain >1 distinct artist
    const multi = buckets.filter(b => b.multi)
    expect(multi.length).toBeGreaterThanOrEqual(2)
    // suggestion seeds span distinct artists within a bucket
    for (const b of buckets.slice(0, 2)) {
      const seedArtists = new Set(b.suggSeeds.map(s => s.artist))
      expect(seedArtists.size).toBe(b.suggSeeds.length)
    }
  })

  it('single-artist history degrades to one honest artist-named bucket', () => {
    const pc = { a: song('a', 'ARR', 20), b: song('b', 'ARR', 15), c: song('c', 'ARR', 5) }
    const buckets = buildMixBuckets(pc, {})
    expect(buckets).toHaveLength(1)
    expect(buckets[0].multi).toBe(false)
    expect(buckets[0].lead).toBe('ARR')
  })

  it('empty history → no buckets', () => {
    expect(buildMixBuckets({}, {})).toEqual([])
  })

  it('heavily-skipped songs drop out of seed selection', () => {
    const pc = {
      good: song('good', 'ARR', 10),
      skipped: song('skipped', 'ARR', 10)
    }
    const sk = { skipped: { count: 8 } } // net = 10 − 16 < 0
    const buckets = buildMixBuckets(pc, sk)
    expect(buckets[0].seeds.map(s => s.id)).not.toContain('skipped')
    expect(buckets[0].suggSeeds.map(s => s.id)).toEqual(['good'])
  })
})

describe('assembleDailyMix', () => {
  it('mix contains multiple artists when history + suggestions support breadth', () => {
    const pc = {}
    ;['ARR', 'Anirudh', 'Yuvan'].forEach((a, i) => {
      for (let j = 0; j < 4; j++) pc[`s${i}${j}`] = song(`s${i}${j}`, a, 10)
    })
    const buckets = buildMixBuckets(pc, {})
    const bucket = buckets[0]
    // suggestions return other artists' songs per seed
    const suggestions = {}
    for (const s of bucket.suggSeeds) {
      suggestions[s.id] = [song(`f1-${s.id}`, 'Ghibran', 0), song(`f2-${s.id}`, 'D. Imman', 0)]
    }
    const mix = assembleDailyMix(bucket, suggestions, null, 0)
    const artists = new Set(mix.songs.map(s => s.artist))
    expect(artists.size).toBeGreaterThan(1)
    expect(mix.songs.length).toBeLessThanOrEqual(20)
    // no artist exceeds the cap
    const counts = {}
    for (const s of mix.songs) counts[s.artist] = (counts[s.artist] || 0) + 1
    expect(Math.max(...Object.values(counts))).toBeLessThanOrEqual(4)
  })

  it('blocked content is excluded', () => {
    const pc = { a: song('a', 'ARR', 10), b: song('b', 'Anirudh', 9) }
    const buckets = buildMixBuckets(pc, {})
    const mix = assembleDailyMix(buckets[0], {}, { hiddenSongs: { a: true } }, 0)
    expect(mix.songs.map(s => s.id)).not.toContain('a')
  })
})
