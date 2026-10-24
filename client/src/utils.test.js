import { describe, it, expect } from 'vitest'
import { getImageSrc, upgradeImageUrl, getBestImageUrl, getSongArtwork } from './utils'

describe('upgradeImageUrl', () => {
  it('upgrades 150x150 JioSaavn thumbs to 500x500', () => {
    expect(upgradeImageUrl('https://c.saavncdn.com/171/Kaappaan-Tamil-2019-20190722053625-150x150.jpg'))
      .toBe('https://c.saavncdn.com/171/Kaappaan-Tamil-2019-20190722053625-500x500.jpg')
  })
  it('upgrades 50x50 to 500x500', () => {
    expect(upgradeImageUrl('https://c.saavncdn.com/171/Kaappaan-50x50.jpg'))
      .toBe('https://c.saavncdn.com/171/Kaappaan-500x500.jpg')
  })
  it('leaves non-thumb URLs alone', () => {
    expect(upgradeImageUrl('https://c.saavncdn.com/171/Kaappaan-500x500.jpg'))
      .toBe('https://c.saavncdn.com/171/Kaappaan-500x500.jpg')
  })
})

describe('getImageSrc', () => {
  it('handles plain string URLs', () => {
    expect(getImageSrc('https://c.saavncdn.com/x-150x150.jpg'))
      .toBe('https://c.saavncdn.com/x-500x500.jpg')
  })
  it('handles arrays of {quality,url} — the shape that broke discover', () => {
    const arr = [
      { quality: '50x50', url: 'https://c.saavncdn.com/a-50x50.jpg' },
      { quality: '150x150', url: 'https://c.saavncdn.com/a-150x150.jpg' },
      { quality: '500x500', url: 'https://c.saavncdn.com/a-500x500.jpg' }
    ]
    expect(getImageSrc(arr)).toBe('https://c.saavncdn.com/a-500x500.jpg')
  })
  it('prefers the highest quality in arrays', () => {
    const arr = [{ quality: '50x50', url: 'https://c.saavncdn.com/b-50x50.jpg' }]
    expect(getImageSrc(arr)).toBe('https://c.saavncdn.com/b-500x500.jpg')
  })
  it('handles bare {url} objects', () => {
    expect(getImageSrc({ url: 'https://c.saavncdn.com/c-150x150.jpg' }))
      .toBe('https://c.saavncdn.com/c-500x500.jpg')
  })
  it('returns "" for empty/null/undefined — callers fall back to placeholders', () => {
    expect(getImageSrc(null)).toBe('')
    expect(getImageSrc('')).toBe('')
    expect(getImageSrc(undefined)).toBe('')
    expect(getImageSrc([])).toBe('')
  })
  it('never emits [object Object]', () => {
    const arr = [{ quality: '50x50', url: 'https://c.saavncdn.com/d-50x50.jpg' }]
    expect(getImageSrc(arr).includes('[object')).toBe(false)
  })
})

describe('getBestImageUrl', () => {
  it('keeps existing behavior for valid arrays', () => {
    const arr = [{ quality: '150x150', url: 'https://c.saavncdn.com/x-150x150.jpg' }]
    expect(getBestImageUrl(arr)).toBe('https://c.saavncdn.com/x-150x150.jpg')
  })
})

describe('getSongArtwork', () => {
  it('prefers explicit URL fields, falls back to image arrays', () => {
    expect(getSongArtwork({ artworkUrl: 'art.png', imageUrl: 'img.png' })).toBe('art.png')
    expect(getSongArtwork({ image: [{ quality: '150x150', url: 'https://c.saavncdn.com/s-150x150.jpg' }] }))
      .toBe('https://c.saavncdn.com/s-500x500.jpg')
    expect(getSongArtwork({})).toBe('')
  })
})