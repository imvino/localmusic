const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = 3001;
const MUSIC_DIR = '/Volumes/samsung/Music';
const LIBRARY_FILE = path.join(__dirname, 'music-library.json');

// JioSaavn API Configuration
const JIO_SAAVN_BASE = 'https://saavn.sumit.co/api';

// YouTube Data API Configuration
const YOUTUBE_API_KEY = 'AIzaSyB1GS6tGy_DThbfAR3-piB-EdLwS5rz-5A';
const YOUTUBE_PLAYLIST_ID = 'PL4fGSI1pDJn4WX22qg1Po7qKOwOb4H6Sk'; // YouTube Music Global Charts - Tamil

// Spotify Playlist Data (Static - extracted from Spotify playlist 37i9dQZF1DX4Im4BTs2WMg)
const SPOTIFY_PLAYLIST = [
  { name: 'Pavazha Malli - From "Think Indie"', artist: 'Sai Abhyankkar, Shruti Haasan, Vivek' },
  { name: 'Raga of Revenge (From "DC")', artist: 'Anirudh Ravichander' },
  { name: 'God Mode - From "Karuppu"', artist: 'Sai Abhyankkar, Gana Muthu, Vishnu Edavan' },
  { name: 'Aura 10/10 (From "Meesaya Murukku 2")', artist: 'Hiphop Tamizha, Thamizh Aadhavan' },
  { name: 'Mutta Kalakki (From "Youth")', artist: 'G. V. Prakash, Ken Karunaas' },
  { name: 'Karuppa Kooda Va', artist: 'Sai Abhyankkar, V.M. Mahalingam, Pa. Vijay' },
  { name: 'Aravindh', artist: 'Anirudh Ravichander, Super Subu' },
  { name: 'Raavana Mavandaa (From "Jana Nayagan")', artist: 'Anirudh Ravichander, Vivek' },
  { name: 'Raathu Raasan - From "Karuppu"', artist: 'Sai Abhyankkar, V.M. Mahalingam, Paal Dabba, Vivek' },
  { name: 'Dheema', artist: 'Anirudh Ravichander, Vignesh Shivan' },
  { name: 'Verappa - Extended - From "Karuppu"', artist: 'Sai Abhyankkar, Arivu, Arun Srinivasan' },
  { name: 'Singari - From "Dude"', artist: 'Sai Abhyankkar, Pradeep Ranganathan, Sai Smriti, Semv.iii' },
  { name: 'ICEBOY', artist: 'Asal Kolaar, SHIV PAUL' },
  { name: 'Neelothi (From "Sirai")', artist: 'Sooraj Santhosh, Chinmayi, Justin Prabhakaran, Sarathi' },
  { name: 'Vari Vari (Unna Kaadhaliche)', artist: 'Dhee' },
  { name: 'Seelay Seelay', artist: 'Sean Roldan, Chinmayi, Uma Devi' },
  { name: 'Goindhamma (From "Meesaya Murukku 2")', artist: 'Hiphop Tamizha, Kaushik Krish, Gana Vinoth, Gana Ulagam Dharani, Gana Sudhakar' },
  { name: 'Aaja Raja (From "KH x RK Reunion")', artist: 'Anirudh Ravichander, Chintu' },
  { name: 'Naanga Naalu Peru - From "Karuppu"', artist: 'Sai Abhyankkar, Silambarasan TR, Asal Kolaar, Arun Srinivasan' },
  { name: 'Adada Mazhaida', artist: 'Yuvan Shankar Raja, Rahul Nambiar, Saindhavi, Na.Muthukumar' },
  { name: 'Aiyo Kadhaley', artist: 'Sean Roldan, Vijaynarain, Mohan Rajan' },
  { name: 'Oorum Blood - From "Dude"', artist: 'Sai Abhyankkar, Pradeep Ranganathan, Sai Smriti, Semv.iii' }
];

// Cache for music directory availability and library data
let musicDirAvailable = null;
let libraryCache = null;
let libraryCacheTime = null;

// Check if MUSIC_DIR is available
function isMusicDirAvailable() {
  if (musicDirAvailable !== null) {
    return musicDirAvailable;
  }
  musicDirAvailable = fs.existsSync(MUSIC_DIR);
  return musicDirAvailable;
}

// Load library data with caching
function loadLibrary() {
  const now = Date.now();
  // Cache for 30 seconds
  if (libraryCache && libraryCacheTime && (now - libraryCacheTime) < 30000) {
    return libraryCache;
  }
  
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const data = fs.readFileSync(LIBRARY_FILE, 'utf8');
      libraryCache = JSON.parse(data);
      libraryCacheTime = now;
      return libraryCache;
    }
  } catch (error) {
    console.error('Error loading library:', error.message);
  }
  
  libraryCache = { albums: [] };
  libraryCacheTime = now;
  return libraryCache;
}

// Check if a song is local (exists in library and file exists on disk)
function isSongLocal(songId) {
  if (!isMusicDirAvailable()) return false;
  
  const library = loadLibrary();
  for (const album of library.albums || []) {
    const song = album.songs?.find(s => s.id === songId);
    if (song && song.audioPath && fs.existsSync(song.audioPath)) {
      return true;
    }
  }
  return false;
}

// Check if an album is local (exists in library and at least one song file exists)
function isAlbumLocal(albumId) {
  if (!isMusicDirAvailable()) return false;
  
  const library = loadLibrary();
  const album = library.albums?.find(a => a.id === albumId);
  if (album && album.songs && album.songs.length > 0) {
    // Check if at least one song file exists
    return album.songs.some(s => s.audioPath && fs.existsSync(s.audioPath));
  }
  return false;
}

app.use(cors());
app.use(express.json());

// Serve music files statically
app.use('/music', express.static(MUSIC_DIR));

// Get full library
app.get('/api/library', (req, res) => {
  try {
    const data = fs.readFileSync(LIBRARY_FILE, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: 'Failed to read library' });
  }
});

// Get all albums
app.get('/api/albums', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    res.json(data.albums || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read albums' });
  }
});

// Get songs from an album
app.get('/api/albums/:albumId/songs', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    const album = data.albums?.find(a => a.id === req.params.albumId);
    if (!album) {
      return res.status(404).json({ error: 'Album not found' });
    }
    res.json(album.songs || []);
  } catch (error) {
    res.status(500).json({ error: 'Failed to read songs' });
  }
});

// Stream a song with range support
app.get('/api/stream/:songId', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    let song = null;
    
    for (const album of data.albums || []) {
      song = album.songs?.find(s => s.id === req.params.songId);
      if (song) break;
    }
    
    if (!song || !song.audioPath) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const filePath = song.audioPath;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found' });
    }

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
  } catch (error) {
    console.error('Stream error:', error);
    res.status(500).json({ error: 'Failed to stream song' });
  }
});

// Get artwork
app.get('/api/artwork/:albumId', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8'));
    const album = data.albums?.find(a => a.id === req.params.albumId);
    if (!album || !album.localArtworkPath) {
      return res.status(404).json({ error: 'Artwork not found' });
    }
    res.sendFile(album.localArtworkPath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get artwork' });
  }
});

// Helper: Fetch from unofficial JioSaavn API (for discover endpoints)
async function fetchFromSaavn(endpoint, params = {}) {
  try {
    const response = await axios.get(`https://saavn.sumit.co${endpoint}`, {
      params,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching from Saavn:', error.message);
    return null;
  }
}

// Helper: Fetch from official JioSaavn API
async function fetchFromSaavnOfficial(__call, params = {}) {
  try {
    const allParams = {
      __call,
      _format: 'json',
      _marker: 0,
      api_version: 4,
      ctx: 'web6dot0',
      ...params
    };
    console.log('Fetching official API:', __call, 'params:', allParams);
    const response = await axios.get('https://www.jiosaavn.com/api.php', {
      params: allParams,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching from Saavn:', error.message);
    return null;
  }
}

// Helper: Fetch Spotify playlist (static data)
function fetchSpotifyPlaylist() {
  return SPOTIFY_PLAYLIST;
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

// Helper: Match YouTube song with JioSaavn
async function matchWithJioSaavn(songName, artist) {
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
      const response = await axios.get(`${JIO_SAAVN_BASE}/search`, {
        params: {
          query: searchQuery,
          limit: 10
        },
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const songs = response.data?.data?.songs?.results;
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
        const songDetailsResponse = await axios.get(`${JIO_SAAVN_BASE}/songs`, {
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
          return best ? best.url : null;
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
          availableOnJioSaavn: true
        };
      }
    }

    return null;
  } catch (error) {
    console.error('Error matching with JioSaavn:', error.message);
    return null;
  }
}

// Get album details by ID using unofficial API (same as jio-saavn-downloader.js)
app.get('/api/album/:id', async (req, res) => {
  try {
    const albumId = req.params.id;
    const response = await axios.get('https://saavn.sumit.co/api/albums', {
      params: { id: albumId },
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const data = response.data?.data;
    if (!data) {
      return res.status(404).json({ error: 'Album not found' });
    }

    // Helper to extract best image URL from array structure
    const getBestImage = (imageObj) => {
      if (!imageObj || !Array.isArray(imageObj)) return null;
      const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150');
      return best ? best.url : null;
    };

    // Fetch song details with download URLs
    const songIds = data.songs ? data.songs.map(s => s.id) : [];
    let songDetailsMap = {};
    if (songIds.length > 0) {
      const songsResponse = await axios.get('https://saavn.sumit.co/api/songs', {
        params: { ids: songIds.join(',') },
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const songsData = songsResponse.data?.data || [];
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
    const composers = Array.from(composersMap.values());

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
      name: data.name || data.title,
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
          name: song.name || song.title,
          artists: song.artists,
          composers: song.composers || song.music_director || [],
          album: data.name || data.title,
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
  } catch (error) {
    console.error('Album details error:', error);
    res.status(500).json({ error: 'Failed to fetch album details' });
  }
});

// Integrate downloader
const downloader = require('./downloader');

app.post('/api/download-song', async (req, res) => {
  try {
    const { songId } = req.body;
    if (!songId) {
      return res.status(400).json({ error: 'Song ID is required' });
    }

    const result = await downloader.downloadSingleSong(songId);
    
    if (result.success) {
      res.json({ success: true, message: 'Song downloaded successfully', filename: result.filename });
    } else {
      res.status(500).json({ error: result.error || 'Failed to download song' });
    }
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download song' });
  }
});

app.post('/api/download-album', async (req, res) => {
  try {
    const { albumId } = req.body;
    if (!albumId) {
      return res.status(400).json({ error: 'Album ID is required' });
    }

    // Since album download takes a long time, we'll respond immediately
    // and process in the background. In a real app we'd use WebSockets
    // or Server-Sent Events to track progress
    downloader.downloadAlbum(albumId).then(result => {
      if (result.success) {
        console.log(`Album ${albumId} downloaded successfully`);
      } else {
        console.error(`Album ${albumId} download failed:`, result.error);
      }
    });

    res.json({ success: true, message: 'Album download started in background' });
  } catch (error) {
    console.error('Album download error:', error);
    res.status(500).json({ error: 'Failed to start album download' });
  }
});

// Get trending Tamil songs using official API (same as jio-saavn-downloader)
app.get('/api/trending', async (req, res) => {
  try {
    const language = req.query.language || 'tamil';
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

// Get new Tamil releases (albums) using official API (same as jio-saavn-downloader)
app.get('/api/new-releases', async (req, res) => {
  try {
    const language = req.query.language || 'tamil';
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

// Get featured Tamil playlists using official API (same as jio-saavn-downloader)
app.get('/api/featured-playlists', async (req, res) => {
  try {
    const language = req.query.language || 'tamil';
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

// Get charts (return specific editorial playlists that match JioSaavn website)
app.get('/api/charts', async (req, res) => {
  try {
    const language = req.query.language || 'tamil';
    const limit = parseInt(req.query.limit) || 10;

    // Specific playlist IDs that match JioSaavn's actual charts page
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
      fetchFromSaavn('/api/playlists', { id, limit: 50 })
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
    const data = await fetchFromSaavn('/api/playlists', { id, limit });

    if (!data || !data.success) {
      return res.status(500).json({ error: 'Failed to fetch playlist' });
    }

    // Add isLocal flag to songs
    if (data.data && data.data.songs) {
      data.data.songs = data.data.songs.map(song => ({
        ...song,
        isLocal: isSongLocal(song.id)
      }));
    }

    res.json({ success: true, data: data.data });
  } catch (error) {
    console.error('Playlist error:', error);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

// Get songs from an album
app.get('/api/album/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await fetchFromSaavn('/api/albums', { id });

    if (!data || !data.success) {
      return res.status(500).json({ error: 'Failed to fetch album' });
    }

    res.json({ success: true, data: data.data });
  } catch (error) {
    console.error('Album error:', error);
    res.status(500).json({ error: 'Failed to fetch album' });
  }
});

// Get artist details and top songs
app.get('/api/artist/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const language = req.query.language || 'all';
    const sort = req.query.sort || 'popular';

    // Map sort to official API format
    let sort_order = '';
    if (sort === 'date') sort_order = 'latest';
    else if (sort === 'name') sort_order = 'alphabetical';
    else if (sort === 'popular') sort_order = 'popularity';

    // Map language to official API format
    let category = language === 'all' ? '' : language;

    // Fetch from official API using artist.getArtistPageDetails
    const officialData = await fetchFromSaavnOfficial('artist.getArtistPageDetails', {
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
      return res.status(500).json({ error: 'Failed to fetch artist from official API' });
    }

    const artistData = officialData;

    // Helper for images
    const getBestImage = (imageObj) => {
      if (typeof imageObj === 'string') return imageObj; 
      if (!imageObj || !Array.isArray(imageObj)) return null;
      const best = imageObj.find(img => img.quality === '500x500') || imageObj.find(img => img.quality === '150x150') || imageObj[imageObj.length - 1];
      return best ? best.url : null;
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
        // Fetch rich metadata for songs to get downloadUrl
        const songsResponse = await axios.get('https://saavn.sumit.co/api/songs', {
          params: { ids: songIds.join(',') },
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const richSongsData = songsResponse.data?.data || [];
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
      normalizedArtist.topSongs = [];
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

// Comprehensive search endpoint (online JioSaavn search)
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const language = req.query.language || 'all';
    if (!query) {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    // Search across multiple types in parallel using official API
    const [songsData, albumsData, artistsData, playlistsData] = await Promise.all([
      fetchFromSaavnOfficial('search.getSongResults', { q: query, p: 1, n: 100, language }),
      fetchFromSaavnOfficial('search.getAlbumResults', { q: query, p: 1, n: 100, language }),
      fetchFromSaavnOfficial('search.getArtistResults', { q: query, p: 1, n: 50, language }),
      fetchFromSaavnOfficial('search.getPlaylistResults', { q: query, p: 1, n: 50, language })
    ]);

    // Helper to normalize API response format
    const normalizeResults = (data, type) => {
      if (!data || !data.results) return [];
      // Official API returns results as an object with numeric keys
      return Object.values(data.results).map(item => ({
        ...item,
        id: item.id || item.tokenid,
        name: item.title || item.name,
        image: item.image ? [{ quality: '150x150', url: item.image }] : [],
        isLocal: type === 'song' ? isSongLocal(item.id || item.tokenid) :
                 type === 'album' ? isAlbumLocal(item.id || item.tokenid) : false
      }));
    };

    const response = {
      success: true,
      data: {
        topResult: null, // Will be set from the most relevant result
        songs: normalizeResults(songsData, 'song'),
        albums: normalizeResults(albumsData, 'album'),
        artists: normalizeResults(artistsData, 'artist'),
        playlists: normalizeResults(playlistsData, 'playlist')
      }
    };

    // Set top result - prioritize songs, then albums
    if (response.data.songs.length > 0) {
      response.data.topResult = { type: 'song', ...response.data.songs[0] };
    } else if (response.data.albums.length > 0) {
      response.data.topResult = { type: 'album', ...response.data.albums[0] };
    }

    res.json(response);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to perform search' });
  }
});

// Get trending songs from YouTube playlist matched with JioSaavn
app.get('/api/trending-youtube', async (req, res) => {
  try {
    const playlistId = req.query.playlistId || YOUTUBE_PLAYLIST_ID;
    const limit = parseInt(req.query.limit) || 20;

    const youtubeSongs = await fetchYouTubePlaylist(playlistId, limit);

    // Match each YouTube song with JioSaavn
    const matchedSongs = [];
    for (const youtubeSong of youtubeSongs.slice(0, limit)) {
      const jioSaavnMatch = await matchWithJioSaavn(youtubeSong.title, youtubeSong.artist);

      if (jioSaavnMatch) {
        matchedSongs.push({
          ...jioSaavnMatch,
          youtubeVideoId: youtubeSong.youtubeVideoId,
          youtubeThumbnail: youtubeSong.thumbnail,
          youtubeArtist: youtubeSong.artist,
          youtubeTitle: youtubeSong.title,
          availableOnJioSaavn: true
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
          availableOnJioSaavn: false
        });
      }
    }

    res.json({ success: true, data: matchedSongs });
  } catch (error) {
    console.error('YouTube trending error:', error);
    res.status(500).json({ error: 'Failed to fetch YouTube trending songs' });
  }
});

// Get trending songs from Spotify playlist matched with JioSaavn
app.get('/api/trending-spotify', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;

    const spotifySongs = fetchSpotifyPlaylist();

    // Match each Spotify song with JioSaavn
    const matchedSongs = [];
    for (const spotifySong of spotifySongs.slice(0, limit)) {
      const jioSaavnMatch = await matchWithJioSaavn(spotifySong.name, spotifySong.artist);

      if (jioSaavnMatch) {
        matchedSongs.push({
          ...jioSaavnMatch,
          spotifyName: spotifySong.name,
          spotifyArtist: spotifySong.artist,
          availableOnJioSaavn: true
        });
      } else {
        matchedSongs.push({
          id: `spotify-${matchedSongs.length}`,
          name: spotifySong.name,
          artists: { primary: [{ name: spotifySong.artist }] },
          album: null,
          year: null,
          image: [],
          downloadUrl: [],
          duration: null,
          spotifyName: spotifySong.name,
          spotifyArtist: spotifySong.artist,
          availableOnJioSaavn: false
        });
      }
    }

    res.json({ success: true, data: matchedSongs });
  } catch (error) {
    console.error('Spotify trending error:', error);
    res.status(500).json({ error: 'Failed to fetch Spotify trending songs' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', musicDir: MUSIC_DIR });
});

app.listen(PORT, () => {
  console.log(`Music server running on http://localhost:${PORT}`);
  console.log(`Music directory: ${MUSIC_DIR}`);
});
