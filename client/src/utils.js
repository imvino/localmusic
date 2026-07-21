export async function getiTunesArtwork(albumName, artistName) {
  try {
    const query = artistName ? `${albumName} ${artistName}` : albumName
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=1`
    )
    const data = await response.json()
    if (data.results && data.results.length > 0) {
      // iTunes provides artwork at 100x100, 600x600, and other sizes
      // We'll use the 600x600 version by replacing 100x100 with 600x600
      const artwork = data.results[0].artworkUrl100
      return artwork.replace('100x100', '600x600')
    }
    return null
  } catch (error) {
    console.error('Failed to fetch iTunes artwork:', error)
    return null
  }
}

// Helper to decode HTML entities
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

// Helper to get best image URL from image array
export function getBestImageUrl(imageArray) {
  if (!imageArray || !Array.isArray(imageArray) || imageArray.length === 0) return null
  const sorted = imageArray.sort((a, b) => {
    const qualityMap = { '50x50': 1, '150x150': 2, '500x500': 3 }
    return (qualityMap[b.quality] || 0) - (qualityMap[a.quality] || 0)
  })
  let url = sorted[0]?.url || null
  
  // Replace JioSaavn brand logo with local logo
  if (url && url.includes('share-image-2.png')) {
    return '/logo_512x512.png'
  }
  
  return url
}

// Helper to get artist image URL (prefers 150x150 for better resolution in small containers)
export function getArtistImageUrl(imageArray) {
  if (!imageArray || !Array.isArray(imageArray) || imageArray.length === 0) return null
  const sorted = imageArray.sort((a, b) => {
    const qualityMap = { '150x150': 3, '500x500': 2, '50x50': 1 }
    return (qualityMap[b.quality] || 0) - (qualityMap[a.quality] || 0)
  })
  let url = sorted[0]?.url || null
  
  // Replace JioSaavn brand logo with local logo
  if (url && url.includes('share-image-2.png')) {
    return '/logo_512x512.png'
  }
  
  return url
}

// Helper to format duration from seconds
export function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Helper to format time from seconds
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
