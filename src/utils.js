const fs = require('fs');
const path = require('path');

// Helper to decode HTML entities
function decodeHtmlEntities(text) {
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

// Helper functions for music-library.json
function loadLibrary(libraryFile) {
  try {
    if (fs.existsSync(libraryFile)) {
      const data = fs.readFileSync(libraryFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading library:', error.message);
  }
  return { albums: [] };
}

function saveLibrary(libraryFile, library) {
  try {
    fs.writeFileSync(libraryFile, JSON.stringify(library, null, 2));
  } catch (error) {
    console.error('Error saving library:', error.message);
  }
}

// Helper to detect composer from songs when API doesn't provide it
function detectComposerFromSongs(songs) {
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
function getBestImage(imageObj) {
  if (!imageObj || !Array.isArray(imageObj)) return null;
  const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150');
  return best ? best.url : null;
}

// Helper to get 320kbps download URL
function get320kbpsUrl(downloadUrlArray) {
  if (!downloadUrlArray || !Array.isArray(downloadUrlArray)) return null;
  const url320 = downloadUrlArray.find(u => u.quality === '320kbps');
  return url320?.url || downloadUrlArray[0]?.url || null;
}

// Helper to extract year from copyright string
function extractYearFromCopyright(copyright) {
  if (!copyright) return null;
  const yearMatch = copyright.match(/(\d{4})/);
  return yearMatch ? parseInt(yearMatch[1]) : null;
}

// Helper to sanitize filename
function sanitizeFilename(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
}

// Helper to parse duration string (e.g., "4:29") to seconds
function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  if (typeof duration !== 'string') return 0;
  const parts = duration.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

module.exports = {
  decodeHtmlEntities,
  loadLibrary,
  saveLibrary,
  detectComposerFromSongs,
  getBestImage,
  get320kbpsUrl,
  extractYearFromCopyright,
  sanitizeFilename,
  parseDuration
};
