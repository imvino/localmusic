const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { PRIMARY_API, FALLBACK_API } = require('./constants');

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
  let url = best ? best.url : null;
  
  // Replace JioSaavn brand logo with local logo
  if (url && url.includes('share-image-2.png')) {
    return '/logo_512x512.png';
  }
  
  return url;
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

// Helper: Generate auth token for JioSaavn streaming URL (returns all quality URLs)
async function generateJioSaavnAuthUrls(encryptedUrl) {
  if (!encryptedUrl) return null;
  
  const bitrates = [96, 160, 320];
  const urls = {};
  
  try {
    // Generate auth tokens for all bitrates in parallel
    const promises = bitrates.map(async (bitrate) => {
      try {
        const response = await axios.get('https://www.jiosaavn.com/api.php', {
          params: {
            __call: 'song.generateAuthToken',
            url: encryptedUrl,
            bitrate: bitrate,
            api_version: 4,
            _format: 'json',
            ctx: 'web6dot0',
            _marker: 0
          },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const data = response.data;
        if (data && data.auth_url && data.status === 'success') {
          return { bitrate, url: data.auth_url };
        }
        return null;
      } catch (error) {
        console.error(`Error generating auth token for ${bitrate}kbps:`, error.message);
        return null;
      }
    });
    
    const results = await Promise.all(promises);
    results.forEach(result => {
      if (result) {
        urls[result.bitrate] = result.url;
      }
    });
    
    return urls;
  } catch (error) {
    console.error('Error generating auth tokens:', error.message);
    return null;
  }
}

// Helper: Generate auth token for JioSaavn streaming URL (single bitrate, for backward compatibility)
async function generateJioSaavnAuthToken(encryptedUrl, bitrate = 320) {
  const urls = await generateJioSaavnAuthUrls(encryptedUrl);
  return urls ? urls[bitrate] : null;
}

// Helper: Fetch from official music service API
async function fetchFromMusicServiceOfficial(__call, params = {}) {
  try {
    const allParams = {
      __call,
      _format: 'json',
      _marker: 0,
      api_version: 4,
      ctx: 'web6dot0',
      ...params
    };
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: allParams,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching from music service:', error.message);
    return null;
  }
}

// Fuzzy match function for album names
function fuzzyMatchAlbumName(searchName, apiName) {
  const searchLower = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const apiLower = apiName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Exact match
  if (searchLower === apiLower) return true;
  
  // Check if API name contains search name (or vice versa)
  if (searchLower.includes(apiLower) || apiLower.includes(searchLower)) return true;
  
  // Normalize common Tamil/English spelling variations
  const normalizeSpelling = (str) => {
    return str
      .replace(/th/g, 't')
      .replace(/aa/g, 'a')
      .replace(/ii/g, 'i')
      .replace(/ee/g, 'e')
      .replace(/oo/g, 'o');
  };
  
  const normalizedSearch = normalizeSpelling(searchLower);
  const normalizedApi = normalizeSpelling(apiLower);
  
  if (normalizedSearch === normalizedApi) return true;
  if (normalizedSearch.includes(normalizedApi) || normalizedApi.includes(normalizedSearch)) return true;
  
  return false;
}

// 3-tier fallback helper for API calls
async function fetchWithFallback(endpoint, params, type = 'songs') {
  
  // Try primary API first
  try {
    console.log(`Trying primary API for ${type}`);
    const response = await axios.get(`${PRIMARY_API}/${endpoint}`, {
      params,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data;
  } catch (primaryError) {
    console.log(`Primary API failed for ${type}, trying fallback API`);
    
    // Try fallback API
    try {
      const response = await axios.get(`${FALLBACK_API}/${endpoint}`, {
        params,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      return response.data;
    } catch (fallbackError) {
      console.error(`Fallback API also failed for ${type}:`, fallbackError.message);
      
      // Try official JioSaavn API as third fallback
      console.log(`Trying official JioSaavn API for ${type}`);
      try {
        let officialParams;
        let officialEndpoint;
        
        if (type === 'songs') {
          officialParams = {
            __call: 'song.getDetails',
            pids: params.ids
          };
        } else if (type === 'albums') {
          officialParams = {
            __call: 'album.getDetails',
            albumid: params.id
          };
        } else if (type === 'playlists') {
          officialParams = {
            __call: 'playlist.getDetails',
            listid: params.id
          };
        }
        
        const officialData = await fetchFromMusicServiceOfficial(officialParams.__call, officialParams);
        
        // Normalize official API response to match primary API structure
        if (officialData) {
          if (type === 'songs') {
            const songs = Array.isArray(officialData) ? officialData : 
                          (officialData.songs ? officialData.songs : [officialData]);
            return {
              data: songs.map(song => ({
                id: song.id,
                name: song.title || song.song || song.name,
                album: song.more_info?.album,
                year: song.year || song.more_info?.release_date?.substring(0, 4),
                duration: parseInt(song.more_info?.duration) || 0,
                image: song.image ? [{ quality: '500x500', url: song.image }] : [],
                artists: {
                  primary: song.more_info?.artistMap?.primary_artists?.map(a => ({
                    id: a.id,
                    name: a.name,
                    image: a.image
                  })) || []
                },
                downloadUrl: song.more_info?.encrypted_media_url ? [{
                  quality: '320kbps',
                  url: song.more_info.encrypted_media_url
                }] : []
              }))
            };
          } else if (type === 'albums') {
            const album = Array.isArray(officialData) ? officialData[0] : officialData;
            return {
              data: {
                id: album.albumid || album.id,
                name: album.title || album.name,
                year: album.year || album.more_info?.release_date?.substring(0, 4),
                image: album.image ? [{ quality: '500x500', url: album.image }] : [],
                songs: album.songs?.map(s => ({
                  id: s.id,
                  name: s.title || s.song || s.name,
                  duration: parseInt(s.more_info?.duration) || 0
                })) || []
              }
            };
          } else if (type === 'playlists') {
            const playlist = Array.isArray(officialData) ? officialData[0] : officialData;
            return {
              data: {
                id: playlist.listid || playlist.id,
                name: playlist.title || playlist.name,
                image: playlist.image ? [{ quality: '500x500', url: playlist.image }] : [],
                songs: playlist.songs?.map(s => ({
                  id: s.id,
                  name: s.title || s.song || s.name,
                  duration: parseInt(s.more_info?.duration) || 0
                })) || []
              }
            };
          }
        }
        
        return null;
      } catch (officialError) {
        console.error(`Official API also failed for ${type}:`, officialError.message);
        return null;
      }
    }
  }
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
  parseDuration,
  generateJioSaavnAuthToken,
  generateJioSaavnAuthUrls,
  fetchFromMusicServiceOfficial,
  fuzzyMatchAlbumName,
  fetchWithFallback
};
