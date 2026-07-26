require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec } = require('child_process');
const { decodeHtmlEntities, loadLibrary: loadLibraryUtil, detectComposerFromSongs, getBestImage, fetchFromMusicServiceOfficial, fetchWithFallback, generateJioSaavnAuthToken, generateJioSaavnAuthUrls } = require('./utils');
const { PRIMARY_API, FALLBACK_API } = require('./constants');
// const { clerkClient, clerkExpressRequireAuth } = require('@clerk/backend');

const app = express();
const PORT = process.env.PORT || 3001;
const MUSIC_DIR = process.env.MUSIC_DIR || '/Volumes/samsung/Music';
const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');

// Check if we're in production mode
const isProduction = process.env.NODE_ENV === 'production';

// Clerk configuration
const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

// Music Service API Configuration
const MUSIC_API_BASE = PRIMARY_API;

// YouTube Data API Configuration
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_PLAYLIST_ID = 'PL4fGSI1pDJn4WX22qg1Po7qKOwOb4H6Sk'; // YouTube Music Global Charts - Tamil

// Cache for music directory availability and library data
let musicDirAvailable = null;
let libraryCache = null;
let libraryCacheTime = null;

// Indexes for O(1) lookups
let songIdIndex = null; // Map<songId, { song, album }>
let albumIdIndex = null; // Map<albumId, album>

// Download progress tracking
const downloadProgress = new Map(); // { downloadId: { progress, current, total, status, error } }

// Check if MUSIC_DIR is available
function isMusicDirAvailable() {
  if (musicDirAvailable !== null) {
    return musicDirAvailable;
  }
  musicDirAvailable = fs.existsSync(MUSIC_DIR);
  return musicDirAvailable;
}

// Build indexes for O(1) lookups
function buildIndexes() {
  const library = loadLibrary();
  songIdIndex = new Map();
  albumIdIndex = new Map();
  
  library.albums?.forEach(album => {
    albumIdIndex.set(album.id, album);
    album.songs?.forEach(song => {
      songIdIndex.set(song.id, { song, album });
    });
  });
}

// Load library data with caching
function loadLibrary() {
  const now = Date.now();
  // Cache for 5 seconds (reduced from 30 for faster local status updates)
  if (libraryCache && libraryCacheTime && (now - libraryCacheTime) < 5000) {
    return libraryCache;
  }
  
  // In production, library file may not exist - return empty library
  if (!fs.existsSync(LIBRARY_FILE)) {
    libraryCache = { albums: [] };
    libraryCacheTime = now;
    return libraryCache;
  }
  
  libraryCache = loadLibraryUtil(LIBRARY_FILE);
  libraryCacheTime = now;
  return libraryCache;
}

// Invalidate library cache (call after downloads)
function invalidateLibraryCache() {
  libraryCache = null;
  libraryCacheTime = null;
  songIdIndex = null;
  albumIdIndex = null;
}

// Check if a song is local (exists in library and file exists on disk)
function isSongLocal(songId) {
  if (!isMusicDirAvailable()) return false;
  
  // Build indexes if not available
  if (!songIdIndex || !albumIdIndex) {
    buildIndexes();
  }
  
  const indexed = songIdIndex.get(songId);
  if (indexed && indexed.song && indexed.song.audioPath && fs.existsSync(indexed.song.audioPath)) {
    return true;
  }
  return false;
}

// Check if an album is local (exists in library and at least one song file exists)
function isAlbumLocal(albumId) {
  if (!isMusicDirAvailable()) return false;
  
  // Build indexes if not available
  if (!songIdIndex || !albumIdIndex) {
    buildIndexes();
  }
  
  const album = albumIdIndex.get(albumId);
  if (album && album.songs && album.songs.length > 0) {
    // Check if at least one song file exists
    return album.songs.some(s => s.audioPath && fs.existsSync(s.audioPath));
  }
  return false;
}

// Configure CORS
const corsOptions = {
  origin: isProduction 
    ? process.env.VITE_APP_URL || 'https://your-vercel-app.vercel.app'
    : true, // Allow all origins in development
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() })
});

// Serve music files statically (only in development)
if (!isProduction) {
  app.use('/music', express.static(MUSIC_DIR));
}

// Get full library (only in development)
if (!isProduction) {
  app.get('/api/library', (req, res) => {
  try {
    const data = fs.readFileSync(LIBRARY_FILE, 'utf8');
    const library = JSON.parse(data);
    // Decode HTML entities in album and song names
    library.albums?.forEach(album => {
      if (album.name) album.name = decodeHtmlEntities(album.name);
      album.songs?.forEach(song => {
        if (song.name) song.name = decodeHtmlEntities(song.name);
      });
    });
    res.json(library);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read library' });
  }
  });
}

// Get all albums (only in development)
if (!isProduction) {
app.get('/api/albums', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    const albums = data.albums || [];
    // Decode HTML entities in album and song names
    albums.forEach(album => {
      if (album.name) album.name = decodeHtmlEntities(album.name);
      album.songs?.forEach(song => {
        if (song.name) song.name = decodeHtmlEntities(song.name);
      });
    });
    res.json(albums);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read albums' });
  }
  });
}

// Get composer albums metadata
app.get('/api/composer-albums/:composerId', (req, res) => {
  try {
    const { composerId } = req.params;
    
    // Map composer ID to filename
    const composerFileMap = {
      '455243': 'harris-jayaraj-albums-metadata.json'
    };
    
    const filename = composerFileMap[composerId];
    if (!filename) {
      return res.status(404).json({ error: 'Composer metadata not found' });
    }
    
    const metadataFile = path.join(__dirname, '../data', filename);
    
    if (!fs.existsSync(metadataFile)) {
      return res.status(404).json({ error: 'Composer metadata file not found' });
    }
    
    const data = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    
    // Check which albums are in the local library
    const library = loadLibrary();
    const albums = data.albums || [];
    
    albums.forEach(album => {
      if (album.id && albumIdIndex.has(album.id)) {
        album.isLocal = true;
      } else {
        album.isLocal = false;
      }
    });
    
    res.json(data);
  } catch (error) {
    console.error('Error reading composer metadata:', error);
    res.status(500).json({ error: 'Failed to read composer metadata' });
  }
});

// Get songs from an album (only in development)
if (!isProduction) {
app.get('/api/albums/:albumId/songs', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    const album = data.albums?.find(a => a.id === req.params.albumId);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }
    // Decode HTML entities in song names
    const songs = (album.songs || []).map(song => ({
      ...song,
      name: song.name ? decodeHtmlEntities(song.name) : song.name
    }));
    res.json(songs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read songs' });
  }
  });
}

// Scan music library endpoint (only in development)
if (!isProduction) {
app.post('/api/scan', (req, res) => {
  
  exec('node scripts/scan-library.js', { cwd: path.join(__dirname, '..') }, (error, stdout, stderr) => {
    if (error) {
      console.error('Scan error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
    
    invalidateLibraryCache();
    
    // Parse the output to get album/song counts
    // Primary: match the explicit "Remaining:" line
    // Fallback: match any line like "- 45 albums with 268 songs" (when no removals)
    const remainingMatch = stdout.match(/Remaining: (\d+) albums with (\d+) songs/)
      || stdout.match(/\b(\d+)\s+albums\s+with\s+(\d+)\s+songs\b/);
    const removedAlbumsMatch = stdout.match(/Removed (\d+) albums/);
    const removedSongsMatch = stdout.match(/Removed (\d+) songs/);
    
    const albums = remainingMatch ? parseInt(remainingMatch[1], 10) : 0;
    const songs = remainingMatch ? parseInt(remainingMatch[2], 10) : 0;
    const removedAlbums = removedAlbumsMatch ? parseInt(removedAlbumsMatch[1], 10) : 0;
    const removedSongs = removedSongsMatch ? parseInt(removedSongsMatch[1], 10) : 0;
    
    // Check file size
    let fileSizeMB = 0;
    let sizeWarning = false;
    if (fs.existsSync(LIBRARY_FILE)) {
      const stats = fs.statSync(LIBRARY_FILE);
      fileSizeMB = stats.size / (1024 * 1024); // Convert to MB
      sizeWarning = fileSizeMB > 5; // 5MB threshold
    }
    
    
    res.json({
      success: true,
      message: stdout.trim(),
      albums: albums,
      songs: songs,
      removedAlbums: removedAlbums,
      removedSongs: removedSongs,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(2)),
      sizeWarning: sizeWarning
    });
  });
  });
}

// Stream a song with range support (local or proxied)
// In production, require authentication
const streamHandler = async (req, res, bitrate = '320') => {
  try {
    // Build indexes if not available
    if (!songIdIndex || !albumIdIndex) {
      buildIndexes();
    }
    
    const indexed = songIdIndex.get(req.params.songId);
    const song = indexed?.song;
    
    // Check if song is local AND music directory is available
    if (song && song.audioPath && isMusicDirAvailable() && fs.existsSync(song.audioPath)) {
      const filePath = song.audioPath;
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;
        const file = fs.createReadStream(filePath, { start, end });
        
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg',
        });
        
        file.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg',
        });
        fs.createReadStream(filePath).pipe(res);
      }
      return;
    }
    
    // If not local, try to proxy from external stream URL
    try {
      let streamUrl;
      
      // Try primary API first (saavn.sumit.co)
      try {
        const response = await axios.get(`${MUSIC_API_BASE}/songs`, { params: { ids: req.params.songId } });
        const songsData = response.data?.data;
        
        if (songsData && songsData.length > 0) {
          const songData = songsData[0];
          const downloadUrls = songData.downloadUrl || [];
          streamUrl = downloadUrls.find(u => u.quality === '320kbps')?.url || 
                      downloadUrls.find(u => u.quality === '160kbps')?.url || null;
        }
      } catch (primaryError) {
        console.log('Primary API failed for stream, trying fallback API');
        try {
          const fallbackResponse = await axios.get(`${FALLBACK_API}/songs?ids=${req.params.songId}`);
          const fallbackData = fallbackResponse.data?.data;
          
          if (fallbackData && fallbackData.length > 0) {
            const fallbackSong = fallbackData[0];
            const downloadUrls = fallbackSong.downloadUrl || [];
            streamUrl = downloadUrls.find(u => u.quality === '320kbps')?.url || 
                        downloadUrls.find(u => u.quality === '160kbps')?.url || null;
          }
        } catch (fallbackError) {
          console.error('Fallback API also failed for stream:', fallbackError.message);
          
          // Try official JioSaavn API as third fallback
          console.log('Trying official JioSaavn API for stream');
          try {
            const officialResponse = await axios.get('https://www.jiosaavn.com/api.php', {
              params: {
                __call: 'song.getDetails',
                _format: 'json',
                _marker: 0,
                api_version: 4,
                ctx: 'web6dot0',
                pids: req.params.songId
              },
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const officialData = officialResponse.data;
            
            // Handle different response structures
            let officialSong = null;
            if (Array.isArray(officialData) && officialData.length > 0) {
              officialSong = officialData[0];
            } else if (officialData.songs && Array.isArray(officialData.songs) && officialData.songs.length > 0) {
              officialSong = officialData.songs[0];
            } else if (officialData.id) {
              officialSong = officialData;
            }
            
            if (officialSong && officialSong.more_info?.encrypted_media_url) {
              // Generate auth token to get authenticated streaming URL with requested bitrate
              const authUrl = await generateJioSaavnAuthToken(officialSong.more_info.encrypted_media_url, parseInt(bitrate));
              streamUrl = authUrl;
            }
          } catch (officialError) {
            console.error('Official API also failed for stream:', officialError.message);
          }
        }
      }
      
      if (!streamUrl) {
        return res.status(404).json({ error: 'Stream URL not available' });
      }
      
      // Support HTTP Range requests for adaptive streaming
      const range = req.headers.range;
      const headers = { 
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
        'Referer': 'https://www.jiosaavn.com/',
        'Origin': 'https://www.jiosaavn.com'
      };
      
      if (range) {
        headers['Range'] = range;
      }
      
      // Proxy the stream from external URL
      const streamResponse = await axios.get(streamUrl, {
        responseType: 'stream',
        headers
      });
      
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range');
      
      // Forward range response headers
      if (streamResponse.status === 206) {
        res.status(206);
        if (streamResponse.headers['content-range']) {
          res.setHeader('Content-Range', streamResponse.headers['content-range']);
        }
      }
      
      if (streamResponse.headers['content-length']) {
        res.setHeader('Content-Length', streamResponse.headers['content-length']);
      }
      
      streamResponse.data.pipe(res);
    } catch (error) {
      console.error('Stream proxy error:', error.message);
      res.status(500).json({ error: 'Failed to stream song' });
    }
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Failed to stream song' });
  }
};

// Register stream endpoint (auth temporarily disabled for deployment)
app.get('/api/stream/:songId', async (req, res) => {
  const { songId } = req.params;
  const bitrate = req.query.bitrate || '320'; // Default to 320kbps
  
  // Call streamHandler with bitrate
  await streamHandler(req, res, bitrate);
});

// Get artwork (only in development)
if (!isProduction) {
  app.get('/api/artwork/:albumId', (req, res) => {
    try {
      // Build indexes if not available
      if (!songIdIndex || !albumIdIndex) {
        buildIndexes();
      }

      const album = albumIdIndex.get(req.params.albumId);
      if (!album || !album.localArtworkPath) {
        return res.status(404).json({ error: 'Artwork not found' });
      }
      res.sendFile(album.localArtworkPath);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get artwork' });
    }
  });
}

// Helper: Fetch from music service API (for discover endpoints) using 3-tier fallback
async function fetchFromMusicService(endpoint, params = {}) {
  // Extract endpoint type from URL
  const endpointPath = endpoint.replace('/api/', '');
  const type = endpointPath.includes('songs') ? 'songs' : 
               endpointPath.includes('albums') ? 'albums' : 
               endpointPath.includes('playlists') ? 'playlists' : 'songs';
  
  return await fetchWithFallback(endpointPath, params, type);
}

// Helper: Fetch YouTube playlist items
async function fetchYouTubePlaylist(playlistId, maxResults = 50) {
  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/playlistItems', {
      params: {
        part: 'snippet,contentDetails',
        playlistId: playlistId,
        key: YOUTUBE_API_KEY,
        maxResults: maxResults
      }
    });

    const items = response.data?.items || [];
    return items.map(item => {
      const snippet = item.snippet;
      // Extract song name from title (remove common suffixes and special characters)
      let title = snippet.title
        .replace(/Music Video/gi, '')
        .replace(/Official Video/gi, '')
        .replace(/Video Song/gi, '')
        .replace(/Lyric Video/gi, '')
        .replace(/\|.*$/, '') // Remove anything after |
        .replace(/@/g, '') // Remove @ symbols
        .replace(/\(\)/g, '') // Remove empty parentheses
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim();

      // Try to extract artist from title if it's in format "Song Name | Artist"
      let artist = snippet.videoOwnerChannelTitle || snippet.channelTitle;
      const titleParts = snippet.title.split('|');
      if (titleParts.length > 1) {
        const potentialArtist = titleParts[titleParts.length - 1].trim();
        if (potentialArtist.length < 50) { // Reasonable artist name length
          artist = potentialArtist;
        }
      }

      return {
        youtubeVideoId: snippet.resourceId?.videoId,
        title: title,
        originalTitle: snippet.title,
        artist: artist,
        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
        publishedAt: snippet.publishedAt,
        playlistId: snippet.playlistId
      };
    });
  } catch (error) {
    console.error('Error fetching YouTube playlist:', error.message);
    return [];
  }
}

// Helper: Match YouTube song with music service
async function matchWithMusicService(songName, artist) {
  try {
    // Clean up song name and artist for search
    const cleanSongName = songName.replace(/\s+/g, ' ').trim();
    const cleanArtist = artist.replace(/\s+/g, ' ').trim();

    // Try multiple search strategies
    const searchStrategies = [
      `${cleanSongName} ${cleanArtist} tamil`,
      `${cleanSongName} tamil`,
      cleanSongName
    ];

    for (const searchQuery of searchStrategies) {
      let response;
      try {
        response = await axios.get(`${MUSIC_API_BASE}/search`, {
          params: {
            query: searchQuery,
            limit: 10
          },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
      } catch (primaryError) {
        // If rate limited (429), try fallback API
        if (primaryError.response?.status === 429) {
          console.log('Primary API rate limited, trying fallback API for search');
          try {
            response = await axios.get(`${FALLBACK_API}/search`, {
              params: {
                query: searchQuery,
                limit: 10
              },
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });
          } catch (fallbackError) {
            console.error('Fallback API also failed:', fallbackError.message);
            continue;
          }
        } else {
          throw primaryError;
        }
      }

      const songs = response.data?.data?.songs?.results || response.data?.data?.songs;
      if (!songs || songs.length === 0) {
        continue;
      }

      // Find best match with more flexible logic
      const bestMatch = songs.find(song => {
        const songTitle = (song.title || '').toLowerCase();
        const songArtist = (song.primaryArtists || '').toLowerCase();
        const searchTitle = cleanSongName.toLowerCase();
        const searchArtist = cleanArtist.toLowerCase();

        // Remove common suffixes from song title for comparison
        const cleanSongTitle = songTitle
          .replace(/from ".*?"/gi, '')
          .replace(/from \".*?\"/gi, '')
          .replace(/\(.*?\)/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        const cleanSearchTitle = searchTitle
          .replace(/from ".*?"/gi, '')
          .replace(/from \".*?\"/gi, '')
          .replace(/\(.*?\)/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // More flexible matching: title should contain search title or vice versa
        const titleMatch = cleanSongTitle.includes(cleanSearchTitle) || cleanSearchTitle.includes(cleanSongTitle);
        
        // If title matches very well (contains the search title), accept it even if artist doesn't match
        // YouTube artist field is unreliable (often channel/label name)
        return titleMatch;
      });

      if (bestMatch) {
        // Fetch song details with download URLs
        const songId = bestMatch.id;
        const songDetailsResponse = await axios.get(`${MUSIC_API_BASE}/songs`, {
          params: { ids: songId },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        const songDetails = songDetailsResponse.data?.data?.[0];
        if (!songDetails) {
          continue;
        }

        // Helper to get best image URL
        const getBestImage = (imageObj) => {
          if (!imageObj || !Array.isArray(imageObj)) return null;
          const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150');
          let url = best ? best.url : null;
          
          // Replace JioSaavn brand logo with local logo
          if (url && url.includes('share-image-2.png')) {
            return '/logo_512x512.png';
          }
          
          return url;
        };

        return {
          id: songDetails.id,
          name: songDetails.name || songDetails.title,
          artists: songDetails.artists,
          album: songDetails.album?.name,
          year: songDetails.year,
          image: getBestImage(songDetails.image) ? [{ quality: '500x500', url: getBestImage(songDetails.image) }] : [],
          downloadUrl: songDetails.downloadUrl || [],
          duration: songDetails.duration,
          availableOnService: true
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error matching with music service:', error.message);
    return null;
  }
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

// Get album details by ID using unofficial API (same as jio-saavn-downloader.js)
app.get('/api/album/:id', async (req, res) => {
  const albumId = req.params.id;
  let albumName = req.query.name; // Get album name from query parameter
  
  // If album name not provided, try to fetch it from primary API
  if (!albumName) {
    try {
      console.log('Album name not provided, fetching from primary API');
      const searchResponse = await axios.get(`${PRIMARY_API}/search`, {
        params: { query: albumId, type: 'album' },
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      const searchAlbum = searchResponse.data?.data?.results?.albums?.[0];
      if (searchAlbum && searchAlbum.id === albumId && searchAlbum.name) {
        albumName = searchAlbum.name;
        console.log('Found album name from primary API:', albumName);
      }
    } catch (nameFetchError) {
      console.error('Failed to fetch album name from primary API:', nameFetchError.message);
    }
  }
  
  // Primary method: Use official JioSaavn search API to get album token
  try {
    console.log('Using official JioSaavn search API as primary method');
    // Search by album name (if available) or ID to get the token
    const searchQuery = albumName || albumId;
    const officialSearchResponse = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'search.getAlbumResults',
        q: searchQuery,
        p: 1,
        n: 10,
        _format: 'json',
        _marker: 0,
        ctx: 'web6dot0'
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    const searchData = officialSearchResponse.data;
    if (searchData && searchData.results && Array.isArray(searchData.results)) {
      const albumDoc = searchData.results.find(a => a.albumid === albumId);
      if (albumDoc && albumDoc.perma_url) {
        // Extract token from perma_url
        const tokenMatch = albumDoc.perma_url.match(/\/([^\/]+)$/);
        const token = tokenMatch ? tokenMatch[1] : null;
        
        if (token) {
          console.log('Found album token from search API:', token);
          // Fetch album details using the token
          const tokenResponse = await axios.get('https://www.jiosaavn.com/api.php', {
            params: {
              __call: 'webapi.get',
              type: 'album',
              id: albumId,
              token: token,
              includeMetaTags: 0,
              ctx: 'web6dot0',
              api_version: 4,
              _format: 'json',
              _marker: 0
            },
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          
          const tokenData = tokenResponse.data;
          const songs = tokenData?.list || [];
          
          if (songs.length > 0) {
            const totalDuration = songs.reduce((sum, s) => sum + (parseInt(s.more_info?.duration) || 0), 0);
            const primaryArtists = tokenData.more_info?.artistMap?.primary_artists || [];
            
            const album = {
              id: albumId,
              name: decodeHtmlEntities(tokenData.title || tokenData.name),
              year: tokenData.year || tokenData.more_info?.release_date?.substring(0, 4) || 0,
              language: tokenData.language,
              artists: primaryArtists.map(a => ({ id: a.id, name: a.name, image: a.image })),
              composers: [],
              copyright: tokenData.copyright_text || '',
              playCount: tokenData.play_count || 0,
              songCount: songs.length,
              totalDuration: totalDuration,
              image: tokenData.image ? [{ quality: '500x500', url: tokenData.image }] : [],
              isLocal: isAlbumLocal(albumId),
              songs: songs.map(song => ({
                id: song.id,
                name: decodeHtmlEntities(song.title || song.song),
                artists: { primary: song.more_info?.artistMap?.primary_artists?.map(a => ({ id: a.id, name: a.name })) || [] },
                composers: [],
                album: decodeHtmlEntities(tokenData.title || tokenData.name),
                duration: parseInt(song.more_info?.duration) || 0,
                playCount: song.play_count || 0,
                year: tokenData.year || 0,
                image: song.image ? [{ quality: '500x500', url: song.image }] : [],
                downloadUrl: song.more_info?.encrypted_media_url ? [{ quality: '320kbps', url: song.more_info.encrypted_media_url }] : [],
                isLocal: isSongLocal(song.id)
              }))
            };
            
            return res.json({ success: true, data: album });
          }
        }
      }
    }
  } catch (primaryError) {
    console.error('Official search API failed:', primaryError.message);
  }

  // Fallback: Try primary API
  try {
    const response = await axios.get(`${PRIMARY_API}/albums`, {
      params: { id: albumId },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const data = response.data?.data;
    if (!data) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Fetch song details with download URLs using 3-tier fallback
    const songIds = data.songs ? data.songs.map(s => s.id) : [];
    let songDetailsMap = {};
    if (songIds.length > 0) {
      const songsResponse = await fetchWithFallback('songs', { ids: songIds.join(',') }, 'songs');
      const songsData = songsResponse?.data || [];
      songDetailsMap = songsData.reduce((acc, song) => {
        acc[song.id] = song;
        return acc;
      }, {});
    }

    // Calculate total duration and play count
    const totalDuration = data.songs ? data.songs.reduce((sum, song) => sum + (song.duration || 0), 0) : 0;
    const totalPlayCount = data.songs ? data.songs.reduce((sum, song) => sum + (song.playCount || song.play_count || 0), 0) : 0;

    // Extract composers from songs (artists with role "music")
    const composersMap = new Map();
    if (data.songs) {
      data.songs.forEach(song => {
        if (song.artists && song.artists.all) {
          song.artists.all.forEach(artist => {
            if (artist.role === 'music' || artist.role === 'music_director') {
              if (!composersMap.has(artist.name)) {
                composersMap.set(artist.name, { id: artist.id, name: artist.name, image: artist.image });
              }
            }
          });
        }
      });
    }
    let composers = Array.from(composersMap.values());
    
    // If no composers found from API, try to detect from song analysis
    if (composers.length === 0) {
      const detectedComposer = detectComposerFromSongs(data.songs);
      if (detectedComposer) {
        composers = [{ id: null, name: detectedComposer, image: null }];
      }
    }

    // Extract primary artists from songs (artists with role "primary_artists" or "singer")
    const primaryArtistsMap = new Map();
    if (data.songs) {
      data.songs.forEach(song => {
        if (song.artists && song.artists.primary) {
          song.artists.primary.forEach(artist => {
            if (!primaryArtistsMap.has(artist.name)) {
              primaryArtistsMap.set(artist.name, { id: artist.id, name: artist.name, image: artist.image });
            }
          });
        }
      });
    }
    const primaryArtists = Array.from(primaryArtistsMap.values());

    // Normalize the response format
    const album = {
      id: data.id,
      name: decodeHtmlEntities(data.name || data.title),
      year: data.year,
      language: data.language,
      artists: data.artists || data.primaryArtists || primaryArtists,
      composers: data.composers || data.music_director || composers,
      copyright: data.copyright || data.copyright_text || '',
      playCount: data.playCount || totalPlayCount,
      songCount: data.songCount || data.songs?.length || 0,
      totalDuration: totalDuration,
      image: getBestImage(data.image) ? [{ quality: '500x500', url: getBestImage(data.image) }] : [],
      isLocal: isAlbumLocal(data.id),
      songs: data.songs ? data.songs.map(song => {
        const songDetails = songDetailsMap[song.id] || {};
        return {
          id: song.id,
          name: decodeHtmlEntities(song.name || song.title),
          artists: song.artists,
          composers: song.composers || song.music_director || [],
          album: decodeHtmlEntities(data.name || data.title),
          duration: song.duration,
          playCount: song.playCount || song.play_count || 0,
          year: song.year || data.year,
          image: getBestImage(song.image) ? [{ quality: '500x500', url: getBestImage(song.image) }] : [],
          downloadUrl: songDetails.downloadUrl || [],
          isLocal: isSongLocal(song.id)
        };
      }) : []
    };

    res.json({ success: true, data: album });
  } catch (primaryError) {
    console.error('Primary API failed, trying fallback:', primaryError.message);
    
    // Fallback to alternative music service API
    try {
      const fallbackResponse = await axios.get(`${FALLBACK_API}/albums?id=${albumId}`);
      const fallbackData = fallbackResponse.data?.data;
      
      if (!fallbackData || !fallbackData.songs) {
        return res.status(404).json({ error: 'Album not found' });
      }

      // Normalize fallback API response to match our format
      const totalDuration = fallbackData.songs.reduce((sum, song) => sum + parseDuration(song.duration), 0);
      
      // Extract composers from primary artists
      const primaryArtists = fallbackData.artists?.primary || [];
      const composers = primaryArtists.map(artist => ({ id: artist.id, name: artist.name, image: artist.image?.[0]?.url || null }));

      const album = {
        id: albumId,
        name: decodeHtmlEntities(fallbackData.name),
        year: fallbackData.year || 0,
        language: fallbackData.language,
        artists: primaryArtists.map(artist => ({ id: artist.id, name: artist.name, image: artist.image?.[0]?.url || null })),
        composers: composers,
        copyright: fallbackData.songs?.[0]?.copyright || '',
        playCount: 0,
        songCount: fallbackData.songs?.length || 0,
        totalDuration: totalDuration,
        image: fallbackData.image || [],
        isLocal: isAlbumLocal(albumId),
        songs: fallbackData.songs.map(song => ({
          id: song.id,
          name: decodeHtmlEntities(song.name),
          artists: { primary: song.artists?.primary?.map(artist => ({ id: artist.id, name: artist.name })) || [] },
          composers: [],
          album: decodeHtmlEntities(fallbackData.name),
          duration: parseDuration(song.duration),
          playCount: 0,
          year: fallbackData.year || 0,
          image: song.image || [],
          downloadUrl: song.downloadUrl || [],
          isLocal: isSongLocal(song.id)
        }))
      };

      res.json({ success: true, data: album });
    } catch (fallbackError) {
      console.error('Fallback API also failed:', fallbackError.message);
      
      // Try search API as third fallback (doesn't require album token)
      try {
        console.log('Trying search API for album');
        const searchResponse = await axios.get(`${PRIMARY_API}/search`, {
          params: { query: albumId, type: 'album' },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const searchAlbum = searchResponse.data?.data?.results?.albums?.[0];
        if (searchAlbum && searchAlbum.id === albumId) {
          return res.json({ success: true, data: searchAlbum });
        }
      } catch (searchError) {
        console.error('Search API failed:', searchError.message);
        
        // Try official JioSaavn search API as additional fallback
        try {
          console.log('Trying official JioSaavn search API');
          const officialSearchData = await fetchFromMusicServiceOfficial('search.getResults', { 
            q: albumId, 
            p: 1, 
            n: 1,
            ctx: 'web6dot0',
            _format: 'json',
            _marker: 0
          });
          
          if (officialSearchData && officialSearchData.albums && officialSearchData.albums.response && officialSearchData.albums.response.docs) {
            const searchAlbum = officialSearchData.albums.response.docs[0];
            if (searchAlbum && searchAlbum.id === albumId) {
              // Normalize official search response to match our format
              const album = {
                id: searchAlbum.id,
                name: decodeHtmlEntities(searchAlbum.title || searchAlbum.album),
                year: searchAlbum.year || searchAlbum.more_info?.year || 0,
                language: searchAlbum.language,
                artists: searchAlbum.artistMap?.primary_artists?.map(a => ({ id: a.id, name: a.name, image: a.image })) || [],
                composers: [],
                copyright: searchAlbum.copyright_text || '',
                playCount: searchAlbum.play_count || 0,
                songCount: searchAlbum.more_info?.song_count || 0,
                totalDuration: 0,
                image: searchAlbum.image ? [{ quality: '500x500', url: searchAlbum.image }] : [],
                isLocal: isAlbumLocal(albumId),
                songs: []
              };
              return res.json({ success: true, data: album });
            }
          }
        } catch (officialSearchError) {
          console.error('Official search API also failed:', officialSearchError.message);
        }
      }
      
      // Try official JioSaavn API as fourth fallback
      console.log('Trying official JioSaavn API for album');
      try {
        // Use webapi.get with album token instead of album.getDetails
        const officialParams = {
          __call: 'webapi.get',
          type: 'album',
          id: albumId,
          includeMetaTags: 0,
          ctx: 'web6dot0',
          api_version: 4,
          _format: 'json',
          _marker: 0
        };
        const officialData = await fetchFromMusicServiceOfficial(officialParams.__call, officialParams);
        console.log('Official API response:', officialData ? 'Success' : 'No data');
        console.log('Official API has songs?', officialData?.list ? 'Yes' : 'No');
        console.log('Official API songs count:', officialData?.list?.length || 0);
        
        // Official API returns songs in 'list' array
        const songs = officialData?.list || [];
        
        if (songs.length > 0) {
          // Normalize official API response
          const totalDuration = songs.reduce((sum, song) => sum + (parseInt(song.more_info?.duration) || 0), 0);
          
          const primaryArtists = officialData.more_info?.artistMap?.primary_artists || [];
          const composers = primaryArtists.map(artist => ({ id: artist.id, name: artist.name, image: artist.image }));

          const album = {
            id: albumId,
            name: decodeHtmlEntities(officialData.title || officialData.name),
            year: officialData.year || officialData.more_info?.release_date?.substring(0, 4) || 0,
            language: officialData.language,
            artists: primaryArtists.map(artist => ({ id: artist.id, name: artist.name, image: artist.image })),
            composers: composers,
            copyright: officialData.copyright_text || '',
            playCount: officialData.play_count || 0,
            songCount: songs.length,
            totalDuration: totalDuration,
            image: officialData.image ? [{ quality: '500x500', url: officialData.image }] : [],
            isLocal: isAlbumLocal(albumId),
            songs: songs.map(song => ({
              id: song.id,
              name: decodeHtmlEntities(song.title || song.song),
              artists: { primary: song.more_info?.artistMap?.primary_artists?.map(a => ({ id: a.id, name: a.name })) || [] },
              composers: [],
              album: decodeHtmlEntities(officialData.title || officialData.name),
              duration: parseInt(song.more_info?.duration) || 0,
              playCount: song.play_count || 0,
              year: officialData.year || 0,
              image: song.image ? [{ quality: '500x500', url: song.image }] : [],
              downloadUrl: song.more_info?.encrypted_media_url ? [{ quality: '320kbps', url: song.more_info.encrypted_media_url }] : [],
              isLocal: isSongLocal(song.id)
            }))
          };

          return res.json({ success: true, data: album });
        }
      } catch (officialError) {
        console.error('Official JioSaavn API also failed:', officialError.message);
      }
      
      // Final fallback: Get album token from artist API, then fetch with token
      try {
        console.log('Trying to get album token from artist API');
        // Search for the album to find which artist it belongs to
        const searchResponse = await axios.get(`${PRIMARY_API}/search`, {
          params: { query: albumId, type: 'album' },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const searchAlbum = searchResponse.data?.data?.results?.albums?.[0];
        if (searchAlbum && searchAlbum.id === albumId && searchAlbum.artists && searchAlbum.artists.length > 0) {
          const artistId = searchAlbum.artists[0].id;
          console.log('Found artist ID:', artistId);
          
          // Get artist details to get the album with perma_url
          const artistResponse = await axios.get(`${PRIMARY_API}/artist/${artistId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          
          const artistData = artistResponse.data?.data;
          if (artistData && artistData.albums) {
            const albumWithToken = artistData.albums.find(a => a.id === albumId);
            if (albumWithToken && albumWithToken.perma_url) {
              // Extract token from perma_url
              const tokenMatch = albumWithToken.perma_url.match(/\/([^\/]+)$/);
              const token = tokenMatch ? tokenMatch[1] : null;
              
              if (token) {
                console.log('Found album token:', token);
                // Fetch album details using the token
                const tokenResponse = await axios.get('https://www.jiosaavn.com/api.php', {
                  params: {
                    __call: 'webapi.get',
                    type: 'album',
                    id: albumId,
                    token: token,
                    includeMetaTags: 0,
                    ctx: 'web6dot0',
                    api_version: 4,
                    _format: 'json',
                    _marker: 0
                  },
                  headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                
                const tokenData = tokenResponse.data;
                const songs = tokenData?.list || [];
                
                if (songs.length > 0) {
                  const totalDuration = songs.reduce((sum, s) => sum + (parseInt(s.more_info?.duration) || 0), 0);
                  const primaryArtists = tokenData.more_info?.artistMap?.primary_artists || [];
                  
                  const album = {
                    id: albumId,
                    name: decodeHtmlEntities(tokenData.title || tokenData.name),
                    year: tokenData.year || tokenData.more_info?.release_date?.substring(0, 4) || 0,
                    language: tokenData.language,
                    artists: primaryArtists.map(a => ({ id: a.id, name: a.name, image: a.image })),
                    composers: [],
                    copyright: tokenData.copyright_text || '',
                    playCount: tokenData.play_count || 0,
                    songCount: songs.length,
                    totalDuration: totalDuration,
                    image: tokenData.image ? [{ quality: '500x500', url: tokenData.image }] : [],
                    isLocal: isAlbumLocal(albumId),
                    songs: songs.map(song => ({
                      id: song.id,
                      name: decodeHtmlEntities(song.title || song.song),
                      artists: { primary: song.more_info?.artistMap?.primary_artists?.map(a => ({ id: a.id, name: a.name })) || [] },
                      composers: [],
                      album: decodeHtmlEntities(tokenData.title || tokenData.name),
                      duration: parseInt(song.more_info?.duration) || 0,
                      playCount: song.play_count || 0,
                      year: tokenData.year || 0,
                      image: song.image ? [{ quality: '500x500', url: song.image }] : [],
                      downloadUrl: song.more_info?.encrypted_media_url ? [{ quality: '320kbps', url: song.more_info.encrypted_media_url }] : [],
                      isLocal: isSongLocal(song.id)
                    }))
                  };
                  
                  return res.json({ success: true, data: album });
                }
              }
            }
          }
        }
      } catch (tokenError) {
        console.error('Token-based fetch also failed:', tokenError.message);
      }
      
      res.status(503).json({ 
        error: 'Album details temporarily unavailable',
        message: 'External JioSaavn APIs are currently rate-limited. Please try again in a few minutes or browse songs from the artist page.',
        retryable: true
      });
    }
  }
});

// Get song details with playable URL
app.get('/api/song/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if song is local first
    let localAudioPath = null;
    if (isMusicDirAvailable()) {
      const library = loadLibrary();
      for (const album of library.albums || []) {
        const song = album.songs?.find(s => s.id === id);
        if (song && song.audioPath && fs.existsSync(song.audioPath)) {
          localAudioPath = song.audioPath;
          break;
        }
      }
    }
    
    // If song is local, return local stream URL
    if (localAudioPath) {
      const song = {
        id: id,
        name: path.basename(localAudioPath, '.mp3').replace(/^\d+\.\s+/, ''),
        streamUrl: `/api/stream/${id}`,
        isLocal: true
      };
      return res.json({ success: true, data: song });
    }
    
    // Otherwise, fetch from saavn.sumit.co API with fallback
    let songData;
    let externalStreamUrl;
    
    try {
      const response = await axios.get(`${MUSIC_API_BASE}/songs`, { params: { ids: id } });
      const songsData = response.data?.data;
      
      if (songsData && songsData.length > 0) {
        songData = songsData[0];
        const downloadUrls = songData.downloadUrl || [];
        externalStreamUrl = downloadUrls.find(u => u.quality === '320kbps')?.url || 
                            downloadUrls.find(u => u.quality === '160kbps')?.url || null;
      }
    } catch (primaryError) {
      console.log('Primary API failed for song, trying fallback API');
      try {
        const fallbackResponse = await axios.get(`${FALLBACK_API}/songs?ids=${id}`);
        const fallbackData = fallbackResponse.data?.data;
        const fallbackSong = fallbackData?.[0];
        
        if (fallbackSong) {
          songData = {
            id: fallbackSong.id,
            name: fallbackSong.name,
            album: fallbackSong.album,
            year: fallbackSong.year,
            duration: fallbackSong.duration,
            image: fallbackSong.image || [],
            artists: fallbackSong.artists?.primary || [],
            downloadUrl: fallbackSong.downloadUrl || []
          };
          const downloadUrls = fallbackSong.downloadUrl || [];
          externalStreamUrl = downloadUrls.find(u => u.quality === '320kbps')?.url || 
                              downloadUrls.find(u => u.quality === '160kbps')?.url || null;
        }
      } catch (fallbackError) {
        console.error('Fallback API also failed for song:', fallbackError.message);
        
        // Try official JioSaavn API as third fallback
        console.log('Trying official JioSaavn API for song');
        try {
          const officialResponse = await axios.get('https://www.jiosaavn.com/api.php', {
            params: {
              __call: 'song.getDetails',
              _format: 'json',
              _marker: 0,
              api_version: 4,
              ctx: 'web6dot0',
              pids: id
            },
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const officialData = officialResponse.data;
          
          // Handle different response structures
          let officialSong = null;
          if (Array.isArray(officialData) && officialData.length > 0) {
            officialSong = officialData[0];
          } else if (officialData.songs && Array.isArray(officialData.songs) && officialData.songs.length > 0) {
            officialSong = officialData.songs[0];
          } else if (officialData.id) {
            officialSong = officialData;
          }
          
          if (officialSong) {
            songData = {
              id: officialSong.id,
              name: officialSong.title || officialSong.song || officialSong.name,
              album: officialSong.more_info?.album,
              year: officialSong.year || officialSong.more_info?.release_date?.substring(0, 4),
              duration: parseInt(officialSong.more_info?.duration) || 0,
              image: officialSong.image ? [{ quality: '500x500', url: officialSong.image }] : [],
              artists: {
                primary: officialSong.more_info?.artistMap?.primary_artists?.map(a => ({
                  id: a.id,
                  name: a.name,
                  image: a.image
                })) || []
              },
              downloadUrl: officialSong.more_info?.encrypted_media_url ? [{
                quality: '320kbps',
                url: officialSong.more_info.encrypted_media_url
              }] : []
            };
            const downloadUrls = songData.downloadUrl || [];
            externalStreamUrl = downloadUrls.find(u => u.quality === '320kbps')?.url || 
                                downloadUrls.find(u => u.quality === '160kbps')?.url || null;
          }
        } catch (officialError) {
          console.error('Official API also failed for song:', officialError.message);
        }
      }
    }
    
    if (!songData) {
      return res.status(404).json({ error: 'Song not found or unavailable' });
    }
    
    // Return the song data with proxied stream URL
    const song = {
      id: songData.id,
      name: songData.name,
      album: songData.album?.name,
      albumId: songData.album?.id,
      year: songData.year,
      duration: songData.duration,
      image: songData.image || [],
      artists: songData.artists,
      streamUrl: externalStreamUrl ? `/api/stream/${id}` : null,
      previewUrl: songData.url, // Provide the service page URL as fallback
      downloadUrl: songData.downloadUrl || [],
      isLocal: false
    };
    
    res.json({ success: true, data: song });
  } catch (error) {
    console.error('Song details error:', error);
    res.status(500).json({ error: 'Failed to fetch song details' });
  }
});

// Integrate downloader (only in development)
if (!isProduction) {
  const downloader = require('./downloader');

  // SSE endpoint for download progress
  app.get('/api/download-progress/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendProgress = () => {
    const progress = downloadProgress.get(downloadId);
    if (progress) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };

  // Send initial progress
  sendProgress();

  // Send progress updates every 100ms
  const interval = setInterval(sendProgress, 100);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
  });
});

// Helper to generate unique download ID
function generateDownloadId() {
  return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

app.post('/api/download-song', async (req, res) => {
  try {
    const { songId } = req.body;
    if (!songId) {
      return res.status(400).json({ error: 'Song ID is required' });
    }

    const downloadId = generateDownloadId();
    
    // Initialize progress
    downloadProgress.set(downloadId, {
      progress: 0,
      current: 'Starting download...',
      status: 'downloading',
      error: null
    });

    // Start download in background
    downloader.downloadSingleSong(songId, (progress) => {
      downloadProgress.set(downloadId, progress);
    }).then(result => {
      if (result.success) {
        // Invalidate cache so isSongLocal returns true for the downloaded song
        invalidateLibraryCache();
        downloadProgress.set(downloadId, {
          progress: 100,
          current: 'Complete',
          status: 'complete',
          error: null,
          albumName: result.albumName
        });
      } else {
        downloadProgress.set(downloadId, {
          progress: 0,
          current: 'Failed',
          status: 'error',
          error: result.error || 'Unknown error'
        });
      }
    }).catch(error => {
      downloadProgress.set(downloadId, {
        progress: 0,
        current: 'Failed',
        status: 'error',
        error: error.message
      });
    });

    res.json({ success: true, downloadId, albumName: 'Loading...' });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to start download' });
  }
});

app.post('/api/download-album', async (req, res) => {
  try {
    const { albumId } = req.body;
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    const downloadId = generateDownloadId();
    
    // Initialize progress
    downloadProgress.set(downloadId, {
      progress: 0,
      current: 'Starting album download...',
      currentSong: 0,
      totalSongs: 0,
      status: 'downloading',
      error: null
    });

    // Start download in background
    downloader.downloadAlbum(albumId, (progress) => {
      downloadProgress.set(downloadId, progress);
    }).then(result => {
      if (result.success) {
        // Invalidate cache so isSongLocal returns true for downloaded songs
        invalidateLibraryCache();
        downloadProgress.set(downloadId, {
          progress: 100,
          current: result.alreadyDownloaded ? 'Album already downloaded' : 'Complete',
          status: 'complete',
          error: null
        });
      } else {
        downloadProgress.set(downloadId, {
          progress: 0,
          current: 'Failed',
          status: 'error',
          error: result.error || 'Unknown error'
        });
      }
    }).catch(error => {
      downloadProgress.set(downloadId, {
        progress: 0,
        current: 'Failed',
        status: 'error',
        error: error.message
      });
    });

    res.json({ success: true, downloadId });
  } catch (error) {
    console.error('Album download error:', error);
    res.status(500).json({ error: 'Failed to start album download' });
  }
  });
}

// Get trending songs using official API
app.get('/api/trending', async (req, res) => {
  try {
    const language = 'tamil';
    const limit = parseInt(req.query.limit) || 20;

    // Use official API to search for songs
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'search.getAlbumResults',
        _format: 'json',
        _marker: 0,
        api_version: 4,
        ctx: 'web6dot0',
        q: language,
        p: 1,
        n: limit * 2
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const results = response.data?.results;
    if (!results) {
      return res.json({ success: true, data: [] });
    }

    // Extract songs from albums (get first song from each album)
    const songs = [];
    Object.values(results).forEach(album => {
      if (album.language && album.language.toLowerCase() === language.toLowerCase() && songs.length < limit) {
        songs.push({
          id: album.id,
          name: album.title,
          artists: album.more_info?.artistMap?.artists || [],
          album: album.title,
          year: album.year,
          image: album.image ? [{ quality: '500x500', url: album.image }] : [],
          isLocal: isSongLocal(album.id)
        });
      }
    });

    res.json({ success: true, data: songs });
  } catch (error) {
    console.error('Trending error:', error);
    res.json({ success: true, data: [] });
  }
});

// Get new releases (albums) using official API
app.get('/api/new-releases', async (req, res) => {
  try {
    const language = 'tamil';
    const limit = parseInt(req.query.limit) || 20;

    // Use official API to search for albums
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'search.getAlbumResults',
        _format: 'json',
        _marker: 0,
        api_version: 4,
        ctx: 'web6dot0',
        q: language,
        p: 1,
        n: limit * 3
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const results = response.data?.results;
    if (!results) {
      return res.json({ success: true, data: [] });
    }

    // Filter by language and sort by year
    const albums = Object.values(results)
      .filter(album => album.language && album.language.toLowerCase() === language.toLowerCase())
      .sort((a, b) => (b.year || 0) - (a.year || 0))
      .slice(0, limit)
      .map(album => ({
        id: album.id,
        name: album.title,
        year: album.year,
        language: album.language,
        image: album.image ? [{ quality: '500x500', url: album.image }] : [],
        isLocal: isAlbumLocal(album.id)
      }));

    res.json({ success: true, data: albums });
  } catch (error) {
    console.error('New releases error:', error);
    res.json({ success: true, data: [] });
  }
});

// Get featured playlists using official API
app.get('/api/featured-playlists', async (req, res) => {
  try {
    const language = 'tamil';
    const limit = parseInt(req.query.limit) || 20;

    // Use official API to search for playlists
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'search.getPlaylistResults',
        _format: 'json',
        _marker: 0,
        api_version: 4,
        ctx: 'web6dot0',
        q: language,
        p: 1,
        n: limit * 2
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const results = response.data?.results;
    if (!results) {
      return res.json({ success: true, data: [] });
    }

    // Filter by language
    const playlists = Object.values(results)
      .filter(playlist => playlist.language && playlist.language.toLowerCase() === language.toLowerCase())
      .slice(0, limit)
      .map(playlist => ({
        id: playlist.id,
        name: playlist.title,
        language: playlist.language,
        image: playlist.image ? [{ quality: '500x500', url: playlist.image }] : []
      }));

    res.json({ success: true, data: playlists });
  } catch (error) {
    console.error('Featured playlists error:', error);
    res.json({ success: true, data: [] });
  }
});

// Get charts (return specific editorial playlists)
app.get('/api/charts', async (req, res) => {
  try {
    const language = 'tamil';
    const limit = parseInt(req.query.limit) || 10;

    // Specific playlist IDs for charts
    const chartPlaylistIds = {
      tamil: [
        '1134651042', // Tamil: India Superhits Top 50
        '1026391929', // Most Searched Songs - Tamil
        '1139646951', // Most Streamed Love Songs: Tamil
        '109815423',  // Top Kuthu - Tamil
        '1133105280', // Tamil Hit Songs
        '823779394',  // Most Searched Hits 2020 - Tamil
        '809058495',  // 2000s Top Kuthu
        '6722204',    // Ilaiyaraaja - Love Songs - Tamil
      ]
    };

    const ids = chartPlaylistIds[language.toLowerCase()] || chartPlaylistIds.tamil;

    // Fetch details for each playlist using unofficial API
    const playlistPromises = ids.slice(0, limit).map(id =>
      fetchFromMusicService('/api/playlists', { id, limit: 50 })
    );

    const results = await Promise.all(playlistPromises);
    const charts = results
      .filter(result => result && result.success)
      .map(result => ({
        id: result.data.id,
        name: result.data.name,
        type: 'playlist',
        image: result.data.image || [],
        url: result.data.url || '',
        songCount: result.data.songCount || result.data.songs?.length || 0,
        language: result.data.language || language,
        explicitContent: result.data.explicitContent || false
      }));

    res.json({ success: true, data: charts });
  } catch (error) {
    console.error('Charts error:', error);
    res.status(500).json({ error: 'Failed to fetch charts' });
  }
});

// Get songs from a playlist
app.get('/api/playlist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 200;
    let data = await fetchFromMusicService('/api/playlists', { id, limit });

    // If primary API fails, try fallback API
    if (!data || !data.success) {
      console.log('Primary API failed for playlist, trying fallback API');
      try {
        const fallbackResponse = await axios.get(`${FALLBACK_API}/playlists`, {
          params: { id, limit },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        data = fallbackResponse.data;
      } catch (fallbackError) {
        console.error('Fallback API also failed for playlist:', fallbackError.message);
        
        // Try official JioSaavn API as third fallback
        console.log('Trying official JioSaavn API for playlist');
        try {
          const allParams = {
            __call: 'playlist.getDetails',
            _format: 'json',
            _marker: 0,
            api_version: 4,
            ctx: 'web6dot0',
            listid: id
          };
          const response = await axios.get('https://www.jiosaavn.com/api.php', {
            params: allParams,
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const officialData = response.data;
          
          if (officialData) {
            // Normalize official API response to match our format
            // Official API returns an object with more_info containing songs
            
            // Songs are in more_info.contents as comma-separated IDs
            const songIds = officialData.more_info?.contents?.split(',') || [];
            
            // Fetch songs by IDs
            let songsArray = [];
            if (songIds.length > 0) {
              try {
                // Try with different parameter names
                const songsResponse = await axios.get('https://www.jiosaavn.com/api.php', {
                  params: {
                    __call: 'song.getDetails',
                    _format: 'json',
                    _marker: 0,
                    api_version: 4,
                    ctx: 'web6dot0',
                    ids: songIds.join(',')
                  },
                  headers: { 'User-Agent': 'Mozilla/5.0' }
                });
                const songsData = songsResponse.data;
                songsArray = Array.isArray(songsData) ? songsData : [];
                
                // If still empty, try fetching songs one by one
                if (songsArray.length === 0 && songIds.length > 0) {
                  const individualSongs = await Promise.all(
                    songIds.slice(0, 50).map(async (songId) => {
                      try {
                        const singleResponse = await axios.get('https://www.jiosaavn.com/api.php', {
                          params: {
                            __call: 'song.getDetails',
                            _format: 'json',
                            _marker: 0,
                            api_version: 4,
                            ctx: 'web6dot0',
                            pids: songId
                          },
                          headers: { 'User-Agent': 'Mozilla/5.0' }
                        });
                        const songData = singleResponse.data;
                        if (Array.isArray(songData) && songData.length > 0) {
                          return songData[0]; // Return first element if array
                        }
                        // If response has songs array, extract the first song
                        if (songData.songs && Array.isArray(songData.songs) && songData.songs.length > 0) {
                          return songData.songs[0];
                        }
                        return songData;
                      } catch (e) {
                        return null;
                      }
                    })
                  );
                  songsArray = individualSongs.filter(s => s !== null);
                }
              } catch (songsError) {
                console.error('Failed to fetch songs:', songsError.message);
              }
            }
            
            data = {
              success: true,
              data: {
                id: id,
                name: officialData.title || officialData.more_info?.subtitle_desc?.[1] || 'Playlist',
                image: officialData.image ? [{ quality: '500x500', url: officialData.image }] : [],
                songCount: songsArray.length,
                songs: songsArray.map(song => ({
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
              }
            };
          }
        } catch (officialError) {
          console.error('Official API also failed for playlist:', officialError.message);
          return res.status(500).json({ error: 'Failed to fetch playlist' });
        }
      }
    }

    if (!data || !data.success) {
      return res.status(500).json({ error: 'Failed to fetch playlist' });
    }

    // Add isLocal flag to songs and decode HTML entities
    if (data.data && data.data.songs) {
      data.data.songs = data.data.songs.map(song => ({
        ...song,
        name: decodeHtmlEntities(song.name || song.title),
        album: song.album ? decodeHtmlEntities(song.album) : song.album,
        isLocal: isSongLocal(song.id)
      }));
    }

    res.json({ success: true, data: data.data });
  } catch (error) {
    console.error('Playlist error:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Test endpoint for artist albums with pagination and language filtering
app.get('/api/artist/:id/albums-test', async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const totalPages = Math.min(parseInt(req.query.totalPages) || 5, 10); // Max 10 pages
  const language = req.query.language || 'tamil';
  const limit = parseInt(req.query.limit) || 50;

  console.log(`Fetching albums for artist ${id}: page=${page}, totalPages=${totalPages}, language=${language}, limit=${limit}`);

  try {
    // Fetch multiple pages in parallel
    const pagePromises = [];
    for (let i = 1; i <= totalPages; i++) {
      pagePromises.push(
        fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
          artistId: id,
          p: i,
          n_song: 0, // Don't fetch songs, only albums
          n_album: limit,
          sort_order: 'latest',
          more: true,
          includeMetaTags: 0
        })
      );
    }

    const allPagesData = await Promise.all(pagePromises);

    // Aggregate all albums from all pages
    let allAlbums = [];
    allPagesData.forEach((pageData, index) => {
      if (pageData?.topAlbums) {
        console.log(`Page ${index + 1}: Found ${pageData.topAlbums.length} albums`);
        allAlbums = allAlbums.concat(pageData.topAlbums);
      }
    });

    console.log(`Total albums fetched: ${allAlbums.length}`);

    // Filter by language (client-side filtering)
    const filteredAlbums = language === 'all' 
      ? allAlbums 
      : allAlbums.filter(album => {
          const albumLanguage = album.language?.toLowerCase() || '';
          return albumLanguage === language.toLowerCase();
        });

    console.log(`Albums after ${language} filter: ${filteredAlbums.length}`);

    // Normalize albums
    const normalizedAlbums = filteredAlbums.map(album => {
      let albumId = album.id;
      let imageUrl = album.image;
      if (imageUrl && typeof imageUrl === 'string') {
        imageUrl = imageUrl.replace('-150x150.jpg', '-500x500.jpg');
      }

      return {
        id: albumId,
        name: album.title || album.name,
        year: album.year,
        language: album.language,
        image: imageUrl ? [{ quality: '500x500', url: imageUrl }] : [],
        playCount: album.play_count || 0,
        isLocal: false
      };
    });

    // Apply pagination to filtered results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedAlbums = normalizedAlbums.slice(startIndex, endIndex);
    
    const totalFilteredPages = Math.ceil(normalizedAlbums.length / limit);

    const response = {
      success: true,
      data: {
        totalAlbums: allAlbums.length,
        filteredAlbums: normalizedAlbums.length,
        totalPages: totalFilteredPages,
        currentPage: page,
        albums: paginatedAlbums
      }
    };

    console.log(`Returning page ${page} of ${totalFilteredPages} with ${paginatedAlbums.length} albums`);

    res.json(response);

  } catch (error) {
    console.error('Artist albums test error:', error);
    res.status(500).json({ error: 'Failed to fetch artist albums' });
  }
});

// Get artist details and top songs
app.get('/api/artist/:id', async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(req.query.limit) || 50;
  const language = 'all';
  const sort = req.query.sort || 'popular';

  // Decode the ID if it's an encoded artist name (from fallback API)
  const decodedId = decodeURIComponent(id);
  const isEncodedName = isNaN(id) && id !== decodedId;
  const isArtistName = isNaN(id) && !id.match(/^\d+$/);

  // If it's an encoded name or just an artist name (not numeric ID), we need to search for the artist first
  if (isEncodedName || isArtistName) {
    try {
      // Search for the artist using the fallback API
      const searchResponse = await axios.get(`${FALLBACK_API}/search?query=${encodeURIComponent(decodedId)}`);
      const searchResults = searchResponse.data;
      
      // The fallback API returns data in a different structure
      const songs = searchResults?.response?.songs || searchResults?.results || searchResults?.songs || [];
      
      if (songs.length > 0) {
        // Extract artist info from the first song
        const firstSong = songs[0];
        const artistName = firstSong.more_info?.singers?.split(',')[0]?.trim() || 
                          firstSong.description?.split('·')[0]?.trim() || 
                          decodedId;
        
        // Return a basic artist profile using the fallback API data
        const artistData = {
          id: id,
          name: artistName,
          followerCount: 0,
          isVerified: false,
          dominantLanguage: firstSong.more_info?.language || 'Unknown',
          bio: '',
          image: firstSong.image ? [{ quality: '500x500', url: firstSong.image }] : [],
          similarArtists: [],
          topSongs: songs.slice(0, limit).map(song => ({
            id: song.id,
            name: song.title || song.song,
            album: { name: song.album },
            year: song.year || 0,
            duration: 0,
            image: song.image ? [{ quality: '500x500', url: song.image }] : [],
            artists: { primary: song.more_info?.singers ? song.more_info.singers.split(', ').map(name => ({ id: encodeURIComponent(name.trim()), name: name.trim() })) : [] },
            downloadUrl: song.api_url?.song ? [{ quality: 'api', url: song.api_url.song }] : [],
            playCount: 0,
            isLocal: isSongLocal(song.id)
          })),
          topAlbums: []
        };
        
        return res.json({ success: true, data: artistData });
      } else {
        return res.status(404).json({ error: 'Artist not found' });
      }
    } catch (searchError) {
      console.error('Artist search failed:', searchError.message);
      return res.status(500).json({ error: 'Failed to fetch artist' });
    }
  }

  // Original logic for numeric IDs
  try {
    // Map sort to official API format
    let sort_order = '';
    if (sort === 'date') sort_order = 'latest';
    else if (sort === 'name') sort_order = 'alphabetical';
    else if (sort === 'popular') sort_order = 'popularity';

    // Map language to official API format
    let category = language === 'all' ? '' : language;

    // Fetch from official API using artist.getArtistPageDetails
    const officialData = await fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
      artistId: id,
      p: 1,
      n_song: limit,
      n_album: limit,
      category: category,
      sort_order: sort_order,
      more: true,
      includeMetaTags: 0
    });

    if (!officialData) {
      console.error(`Failed to fetch artist ${id} from official API: No data returned`);
      return res.status(500).json({ error: 'Failed to fetch artist from official API' });
    }

    const artistData = officialData;
    

    // Helper for images
    const getBestImage = (imageObj) => {
      if (typeof imageObj === 'string') {
        // Replace JioSaavn brand logo with local logo for string URLs
        if (imageObj.includes('share-image-2.png')) {
          return '/logo_512x512.png';
        }
        return imageObj;
      }
      if (!imageObj || !Array.isArray(imageObj)) return null;
      const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150') || imageObj[imageObj.length - 1];
      let url = best ? best.url : null;
      
      // Replace JioSaavn brand logo with local logo
      if (url && url.includes('share-image-2.png')) {
        return '/logo_512x512.png';
      }
      
      return url;
    };

    // Normalize Bio
    let bioText = '';
    if (artistData.bio) {
      try {
        const parsedBio = typeof artistData.bio === 'string' ? JSON.parse(artistData.bio) : artistData.bio;
        if (Array.isArray(parsedBio) && parsedBio.length > 0) {
          bioText = parsedBio[0]?.text || parsedBio[0]?.title || '';
        }
      } catch(e) {
        bioText = typeof artistData.bio === 'string' && artistData.bio !== '[]' ? artistData.bio : '';
      }
    }

    // Normalize Similar Artists
    let similarArtists = [];
    if (artistData.similarArtists && Array.isArray(artistData.similarArtists)) {
      similarArtists = artistData.similarArtists.map(a => ({
        id: a.perma_url ? a.perma_url.split('/').filter(Boolean).pop() : a.id,
        name: a.name,
        image: [{ quality: '500x500', url: a.image_url || a.image }]
      }));
    }

    const normalizedArtist = {
      id: artistData.artistId || id,
      name: artistData.name,
      followerCount: artistData.follower_count,
      isVerified: artistData.isVerified,
      dominantLanguage: artistData.dominantLanguage,
      bio: bioText,
      image: [{ quality: '500x500', url: typeof artistData.image === 'string' ? artistData.image : getBestImage(artistData.image) }],
      similarArtists: similarArtists
    };

    // Normalize Top Songs
    let topSongs = Array.isArray(artistData.topSongs) ? artistData.topSongs : [];
    
    if (topSongs.length > 0) {
      const songIds = topSongs.map(s => s.id);
      try {
        // Fetch rich metadata for songs to get downloadUrl using 3-tier fallback
        const songsResponse = await fetchWithFallback('songs', { ids: songIds.join(',') }, 'songs');
        const richSongsData = songsResponse?.data || [];
        const songDetailsMap = richSongsData.reduce((acc, song) => {
          acc[song.id] = song;
          return acc;
        }, {});

        normalizedArtist.topSongs = topSongs.map(song => {
          const rich = songDetailsMap[song.id] || {};
          return {
            id: song.id,
            name: song.title || song.name,
            album: { name: rich.album?.name || song.more_info?.album },
            year: rich.year || song.year,
            duration: rich.duration || song.more_info?.duration,
            image: rich.image || (song.image ? [{ quality: '500x500', url: song.image }] : []),
            artists: rich.artists || { primary: [{ name: artistData.name }] },
            downloadUrl: rich.downloadUrl || [],
            playCount: rich.playCount || song.play_count || 0,
            isLocal: isSongLocal(song.id)
          };
        });
      } catch (err) {
        console.error('Failed to fetch rich song data:', err.message);
        // Fallback if rich data fails
        normalizedArtist.topSongs = topSongs.map(song => ({
          id: song.id,
          name: song.title || song.name,
          album: { name: song.more_info?.album },
          year: song.year,
          duration: song.more_info?.duration,
          image: song.image ? [{ quality: '500x500', url: song.image }] : [],
          downloadUrl: [],
          playCount: song.play_count || 0,
          isLocal: isSongLocal(song.id)
        }));
      }
    } else {
      // Fallback: Search for songs by artist name if topSongs is empty
      try {
        const searchResponse = await fetchFromMusicServiceOfficial('search.getSongResults', {
          q: artistData.name,
          p: 1,
          n: limit,
          language: language
        });
        
        if (searchResponse && searchResponse.results) {
          const searchSongs = Object.values(searchResponse.results);
          const songIds = searchSongs.map(s => s.id || s.tokenid).filter(Boolean);
          
          if (songIds.length > 0) {
            // Fetch rich song data using 3-tier fallback
            const songsResponse = await fetchWithFallback('songs', { ids: songIds.join(',') }, 'songs');
            const richSongsData = songsResponse?.data || [];
            normalizedArtist.topSongs = richSongsData.map(song => ({
              id: song.id,
              name: song.name || song.title,
              album: { name: song.album?.name },
              year: song.year,
              duration: song.duration,
              image: song.image ? [{ quality: '500x500', url: song.image.find(img => img.quality === '500x500')?.url || song.image[0]?.url }] : [],
              artists: song.artists || { primary: [{ name: artistData.name }] },
              downloadUrl: song.downloadUrl || [],
              playCount: song.playCount || 0,
              isLocal: isSongLocal(song.id)
            }));
          } else {
            normalizedArtist.topSongs = [];
          }
        } else {
          normalizedArtist.topSongs = [];
        }
      } catch (fallbackError) {
        console.error('Fallback song search failed:', fallbackError.message);
        normalizedArtist.topSongs = [];
      }
    }

    // Normalize Top Albums
    let topAlbums = Array.isArray(artistData.topAlbums) ? artistData.topAlbums : [];
    normalizedArtist.topAlbums = topAlbums.map(album => {
      // Use the direct album.id field which contains the numeric ID
      let albumId = album.id;

      // Convert image URL from 150x150 to 500x500
      let imageUrl = album.image;
      if (imageUrl && typeof imageUrl === 'string') {
        imageUrl = imageUrl.replace('-150x150.jpg', '-500x500.jpg');
      }

      return {
        id: albumId,
        name: album.title || album.name,
        year: album.year,
        image: imageUrl ? [{ quality: '500x500', url: imageUrl }] : [],
        playCount: album.play_count || 0,
        isLocal: isAlbumLocal(albumId)
      };
    });

    res.json({ success: true, data: normalizedArtist });
  } catch (error) {
    console.error('Artist error:', error);
    res.status(500).json({ error: 'Failed to fetch artist' });
  }
});

// Comprehensive search endpoint (online music search)
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Get limit and page from query params, with defaults
    const limit = parseInt(req.query.n) || 20;
    const page = parseInt(req.query.p) || 1;

    // Search across multiple types in parallel using official API
    // Use search.getResults for songs (it works), separate endpoints for other types
    const [songsData, albumsData, artistsData, playlistsData] = await Promise.all([
      fetchFromMusicServiceOfficial('search.getResults', { q: query, p: page, n: limit }),
      fetchFromMusicServiceOfficial('search.getAlbumResults', { q: query, p: page, n: limit }),
      fetchFromMusicServiceOfficial('search.getArtistResults', { q: query, p: page, n: limit }),
      fetchFromMusicServiceOfficial('search.getPlaylistResults', { q: query, p: page, n: limit })
    ]);

    // Helper to normalize API response format
    const normalizeResults = (data, type) => {
      if (!data || !data.results) return [];
      // Official API returns results as a list (not object with numeric keys)
      const results = Array.isArray(data.results) ? data.results : Object.values(data.results);
      return results.map(item => {
        // Normalize artist data structure
        let artists = { primary: [] };
        if (item.more_info?.artistMap?.primary_artists) {
          artists.primary = item.more_info.artistMap.primary_artists.map(a => ({
            id: a.id,
            name: a.name,
            image: a.image,
            role: a.role || 'primary_artists'
          }));
        } else if (item.primary_artists) {
          // Handle string format: "Artist1, Artist2"
          if (typeof item.primary_artists === 'string') {
            artists.primary = item.primary_artists.split(',').map(name => ({
              id: encodeURIComponent(name.trim()),
              name: name.trim(),
              image: null,
              role: 'primary_artists'
            }));
          } else if (Array.isArray(item.primary_artists)) {
            artists.primary = item.primary_artists.map(a => ({
              id: a.id || encodeURIComponent(a.name),
              name: a.name,
              image: a.image || null,
              role: a.role || 'primary_artists'
            }));
          }
        } else if (item.artists) {
          // Use artists field if primary_artists not available
          if (typeof item.artists === 'string') {
            artists.primary = item.artists.split(',').map(name => ({
              id: encodeURIComponent(name.trim()),
              name: name.trim(),
              image: null,
              role: 'primary_artists'
            }));
          } else if (Array.isArray(item.artists)) {
            artists.primary = item.artists.map(a => ({
              id: a.id || encodeURIComponent(a.name),
              name: a.name,
              image: a.image || null,
              role: a.role || 'primary_artists'
            }));
          }
        }

        // Convert 50x50 to 150x150 for better resolution on artist images
        const imageUrl = item.image ? item.image.replace('50x50', '150x150') : item.image;

        // Handle album field - could be string or object
        let album = null;
        if (item.more_info?.album) {
          if (typeof item.more_info.album === 'string') {
            album = { name: item.more_info.album };
          } else if (typeof item.more_info.album === 'object') {
            album = item.more_info.album;
          }
        }

        // Get song name from multiple possible fields
        const songName = item.song || item.title || item.name || item.more_info?.song || item.more_info?.title || '';

        // Try to extract album name from album_url if album field is null
        if (!album && item.album_url) {
          const albumMatch = item.album_url.match(/\/album\/([^\/]+)/);
          if (albumMatch) {
            album = { name: decodeHtmlEntities(albumMatch[1].replace(/-/g, ' ')) };
          }
        }

        return {
          ...item,
          id: item.id || item.tokenid || item.albumid,
          name: songName,
          artists: artists,
          album: album,
          year: item.year || item.more_info?.year || null,
          image: imageUrl ? [{ quality: '150x150', url: imageUrl }] : [],
          isLocal: type === 'song' ? isSongLocal(item.id || item.tokenid) :
                   type === 'album' ? isAlbumLocal(item.albumid || item.id || item.tokenid) : false
        };
      });
    };

    // Fetch artist images for search results
    let artistsWithImages = normalizeResults(artistsData, 'artist');
    if (artistsWithImages.length > 0) {
      artistsWithImages = await Promise.all(artistsWithImages.map(async (artist) => {
        try {
          const artistDetail = await fetchFromMusicServiceOfficial('artist.getArtistPageDetails', {
            artistId: artist.id,
            p: 1,
            n_song: 1,
            n_album: 1
          });
          if (artistDetail && artistDetail.image) {
            const imageUrl = artistDetail.image ? artistDetail.image.replace('50x50', '150x150') : '';
            return {
              ...artist,
              image: imageUrl ? [{ quality: '150x150', url: imageUrl }] : []
            };
          }
        } catch (e) {
          // If detail fetch fails, keep original artist data
        }
        return artist;
      }));
    }

    const response = {
      success: true,
      data: {
        topResult: null, // Will be set from the most relevant result
        songs: normalizeResults(songsData, 'song'),
        albums: normalizeResults(albumsData, 'album'),
        artists: artistsWithImages,
        playlists: normalizeResults(playlistsData, 'playlist')
      }
    };

    // Set top result - prioritize songs, then albums
    if (response.data.songs.length > 0) {
      const { type, ...topSong } = response.data.songs[0];
      response.data.topResult = { ...topSong, type: 'song' };
    } else if (response.data.albums.length > 0) {
      const { type, ...topAlbum } = response.data.albums[0];
      response.data.topResult = { ...topAlbum, type: 'album' };
    }

    res.json(response);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// Get trending songs from YouTube playlist matched with music service
app.get('/api/trending-youtube', async (req, res) => {
  try {
    const playlistId = req.query.playlistId || YOUTUBE_PLAYLIST_ID;
    const limit = parseInt(req.query.limit) || 20;

    const youtubeSongs = await fetchYouTubePlaylist(playlistId, limit);

    // Match each YouTube song with music service
    const matchedSongs = [];
    for (const youtubeSong of youtubeSongs.slice(0, limit)) {
      const serviceMatch = await matchWithMusicService(youtubeSong.title, youtubeSong.artist);

      if (serviceMatch) {
        matchedSongs.push({
          ...serviceMatch,
          youtubeVideoId: youtubeSong.youtubeVideoId,
          youtubeThumbnail: youtubeSong.thumbnail,
          youtubeArtist: youtubeSong.artist,
          youtubeTitle: youtubeSong.title,
          availableOnService: true,
          isLocal: isSongLocal(serviceMatch.id)
        });
      } else {
        matchedSongs.push({
          id: youtubeSong.youtubeVideoId,
          name: youtubeSong.title,
          artists: { primary: [{ name: youtubeSong.artist }] },
          album: null,
          year: null,
          image: youtubeSong.thumbnail ? [{ quality: '500x500', url: youtubeSong.thumbnail }] : [],
          downloadUrl: [],
          duration: null,
          youtubeVideoId: youtubeSong.youtubeVideoId,
          youtubeThumbnail: youtubeSong.thumbnail,
          youtubeArtist: youtubeSong.artist,
          youtubeTitle: youtubeSong.title,
          availableOnService: false,
          isLocal: false
        });
      }
    }

    res.json({ success: true, data: matchedSongs });
  } catch (error) {
    console.error('YouTube trending error:', error);
    res.status(500).json({ error: 'Failed to fetch YouTube trending songs' });
  }
});

// JioSaavn API Proxy Endpoints

// Get footer details (Top Artists, Top Playlists)
app.get('/api/jio/footer-details', async (req, res) => {
  try {
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'webapi.getFooterDetails',
        language: 'tamil',
        api_version: 4,
        _format: 'json',
        _marker: 0
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const data = response.data;
    
    // Fetch artist images using search
    const artistsWithImages = await Promise.all((data.artist || []).map(async (artist) => {
      try {
        const searchRes = await axios.get('https://www.jiosaavn.com/api.php', {
          params: {
            __call: 'search.getArtistResults',
            q: artist.title,
            api_version: 4,
            _format: 'json',
            _marker: 0,
            n: 1,
            p: 1
          },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const results = searchRes.data?.results || [];
        const foundArtist = results.find(r => r.id === artist.id);
        const imageUrl = foundArtist?.image || '';
        // Convert 50x50 to 150x150
        const highResImage = imageUrl.replace('50x50', '150x150');
        return {
          ...artist,
          image: highResImage
        };
      } catch (err) {
        return artist;
      }
    }));

    // Fetch playlist images using search
    const playlistsWithImages = await Promise.all((data.playlist || []).map(async (playlist) => {
      try {
        const searchRes = await axios.get('https://www.jiosaavn.com/api.php', {
          params: {
            __call: 'search.getPlaylistResults',
            q: playlist.title,
            api_version: 4,
            _format: 'json',
            _marker: 0,
            n: 1,
            p: 1
          },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const results = searchRes.data?.results || [];
        const foundPlaylist = results.find(r => r.id === playlist.id);
        return {
          ...playlist,
          image: foundPlaylist?.image || ''
        };
      } catch (err) {
        return playlist;
      }
    }));

    res.json({ success: true, data: { artist: artistsWithImages, playlist: playlistsWithImages } });
  } catch (error) {
    console.error('Footer details error:', error.message);
    res.json({ success: false, data: { artist: [], playlist: [] } });
  }
});

// Get featured playlists
app.get('/api/jio/featured-playlists', async (req, res) => {
  try {
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'content.getFeaturedPlaylists',
        fetch_from_serialized_files: true,
        p: 1,
        n: 50,
        api_version: 4,
        _format: 'json',
        _marker: 0,
        ctx: 'web6dot0',
        languages: 'tamil'
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    res.json({ success: true, data: response.data?.data || [] });
  } catch (error) {
    console.error('Featured playlists error:', error.message);
    res.json({ success: false, data: [] });
  }
});

// Get new releases (songs)
app.get('/api/jio/new-releases', async (req, res) => {
  try {
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: {
        __call: 'content.getAlbums',
        api_version: 4,
        _format: 'json',
        _marker: 0,
        n: 50,
        p: 1,
        ctx: 'web6dot0',
        languages: 'tamil'
      },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const songs = (response.data?.data || []).filter(item => item.type === 'song');
    res.json({ success: true, data: songs });
  } catch (error) {
    console.error('New releases error:', error.message);
    res.json({ success: false, data: [] });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', musicDir: MUSIC_DIR });
});

// Build indexes on startup
buildIndexes();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
