// Shared utilities for Vercel Edge Functions
// ES6 module version of src/utils.js (excluding file system operations)

// Helper to decode HTML entities
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return text;
  const entityMap = {
    '&quot;': '"',
    '&amp;': '&',
    '&apos;': "'",
    '&lt;': '<',
    '&gt;': '>',
    '&#39;': "'",
    '&#x27;': "'",
    '&nbsp;': ' '
  };
  return text.replace(/&quot;|&amp;|&apos;|&lt;|&gt;|&#39;|&#x27;|&nbsp;/g, match => entityMap[match]);
}

// Helper to detect composer from songs when API doesn't provide it
export function detectComposerFromSongs(songs) {
  if (!songs || songs.length === 0) return null;
  
  const artistCounts = {};
  
  songs.forEach(song => {
    const allArtists = song.artists?.all || [];
    // Only count artists with music-related roles, not lyricists, actors, etc.
    const musicArtists = allArtists.filter(a => 
      a.role === 'music' || 
      a.role === 'music_director' ||
      a.role === 'composer' ||
      a.role === 'primary_artists' ||
      a.role === 'singer'
    );
    musicArtists.forEach(artist => {
      if (!artistCounts[artist.name]) artistCounts[artist.name] = 0;
      artistCounts[artist.name]++;
    });
  });
  
  const totalSongs = songs.length;
  const candidates = Object.entries(artistCounts)
    .filter(([_, count]) => count === totalSongs)
    .map(([artist]) => artist);
  
  if (candidates.length === 0) return null;
  
  // Prefer artists who are not always the first listed (likely not singers)
  const nonSingerCandidates = candidates.filter(artist => {
    const firstArtistCount = songs.filter(song => {
      const allArtists = song.artists?.all || [];
      return allArtists[0]?.name === artist;
    }).length;
    return firstArtistCount < totalSongs;
  });
  
  if (nonSingerCandidates.length > 0) return nonSingerCandidates[0];
  return candidates[0];
}

// Helper to get best image URL from array structure
export function getBestImage(imageObj) {
  if (!imageObj || !Array.isArray(imageObj)) return null;
  const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150');
  let url = best ? best.url : null;
  
  // Replace JioSaavn brand logo with local logo
  if (url && url.includes('share-image-2.png')) {
    return '/logo_512x512.png';
  }
  
  return url;
}

// Helper to get 320kbps download URL
export function get320kbpsUrl(downloadUrlArray) {
  if (!downloadUrlArray || !Array.isArray(downloadUrlArray)) return null;
  const url320 = downloadUrlArray.find(u => u.quality === '320kbps');
  return url320?.url || downloadUrlArray[0]?.url || null;
}

// Helper to extract year from copyright string
export function extractYearFromCopyright(copyright) {
  if (!copyright) return null;
  const yearMatch = copyright.match(/(\d{4})/);
  return yearMatch ? parseInt(yearMatch[1]) : null;
}

// Helper to parse duration string (e.g., "4:29") to seconds
export function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return 0;
  const parts = duration.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

// Helper: Fetch from official music service API
export async function fetchFromMusicServiceOfficial(__call, params = {}) {
  try {
    const allParams = {
      __call,
      _format: 'json',
      _marker: 0,
      api_version: 4,
      ctx: 'web6dot0',
      ...params
    };
    const url = new URL('https://www.jiosaavn.com/api.php');
    Object.keys(allParams).forEach(key => url.searchParams.append(key, allParams[key]));
    
    const response = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return await response.json();
  } catch (error) {
    console.error('Error fetching from music service:', error.message);
    return null;
  }
}
