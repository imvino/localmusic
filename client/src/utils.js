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

// Helper to detect connection type (WiFi/cellular) for adaptive bitrate
export function getConnectionType() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  if (!connection) return 'unknown'
  
  // Check effectiveType for cellular networks
  if (connection.effectiveType) {
    const slowTypes = ['slow-2g', '2g', '3g']
    if (slowTypes.includes(connection.effectiveType)) {
      return 'cellular-slow'
    }
  }
  
  // Check if on cellular
  if (connection.type === 'cellular') {
    return 'cellular'
  }
  
  // Default to WiFi if not cellular
  return 'wifi'
}

// Helper to get max bitrate based on connection type and user preference
export function getMaxBitrate(connectionType, userPreference = 'auto') {
  if (userPreference === 'low-data') {
    return 96
  }
  
  if (userPreference === 'high-quality') {
    return 320
  }
  
  // Auto mode - adapt based on connection
  if (connectionType === 'cellular-slow') {
    return 96
  }
  
  if (connectionType === 'cellular') {
    return 160
  }
  
  // WiFi or unknown
  return 320
}
