require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const { exec } = require('child_process');
const { decodeHtmlEntities, loadLibrary, saveLibrary, detectComposerFromSongs, getBestImage, get320kbpsUrl, extractYearFromCopyright, sanitizeFilename, fetchWithFallback } = require('./utils');
const { PRIMARY_API } = require('./constants');

const MUSIC_DIR = '/Volumes/samsung/Music';
const JIO_SAAVN_BASE = PRIMARY_API;
const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');

// Helper functions for composer mappings
function getComposerAliases() {
  try {
    const aliasFile = path.join(__dirname, '../config/composer-aliases.json');
    if (fs.existsSync(aliasFile)) {
      return JSON.parse(fs.readFileSync(aliasFile, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function getComposerOverrides() {
  try {
    const overridesFile = path.join(__dirname, '../config/composer-overrides.json');
    if (fs.existsSync(overridesFile)) {
      return JSON.parse(fs.readFileSync(overridesFile, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function applyComposerAlias(composerName) {
  if (!composerName) return composerName;
  const aliases = getComposerAliases();
  const normalized = composerName.trim();
  const result = aliases[normalized] || aliases[composerName] || normalized;
  return result;
}


function updateLibraryWithSong(songId, songName, albumId, albumName, albumYear, audioPath, totalTracks = null) {
  const library = loadLibrary(LIBRARY_FILE);
  
  // Find or create album
  let album = library.albums?.find(a => a.id === albumId);
  if (!album) {
    album = {
      id: albumId,
      name: decodeHtmlEntities(albumName),
      localPath: path.dirname(audioPath),
      songs: []
    };
    if (!library.albums) library.albums = [];
    library.albums.push(album);
  }
  
  // Update album local path if needed
  album.localPath = path.dirname(audioPath);
  
  // Update total tracks if provided
  if (totalTracks !== null) {
    album.totalTracks = totalTracks;
  }
  
  // Find or create song
  let song = album.songs?.find(s => s.id === songId);
  if (!song) {
    song = {
      id: songId,
      name: decodeHtmlEntities(songName),
      audioPath: audioPath
    };
    if (!album.songs) album.songs = [];
    album.songs.push(song);
  } else {
    // Update existing song path
    song.audioPath = audioPath;
  }
  
  saveLibrary(LIBRARY_FILE, library);
}

function updateLibraryWithAlbum(albumId, albumName, albumYear, albumDir, songs, totalTracks = null) {
  const library = loadLibrary(LIBRARY_FILE);
  
  // Find or create album
  let album = library.albums?.find(a => a.id === albumId);
  if (!album) {
    album = {
      id: albumId,
      name: decodeHtmlEntities(albumName),
      localPath: albumDir,
      songs: []
    };
    if (!library.albums) library.albums = [];
    library.albums.push(album);
  }
  
  // Update album
  album.localPath = albumDir;
  album.songs = songs.map(s => ({
    id: s.id,
    name: decodeHtmlEntities(s.name),
    audioPath: s.audioPath
  }));
  
  // Update total tracks if provided
  if (totalTracks !== null) {
    album.totalTracks = totalTracks;
  }
  
  saveLibrary(LIBRARY_FILE, library);
}

// TMDB API Configuration (optional - for movie metadata)
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BEARER_TOKEN = process.env.TMDB_BEARER_TOKEN;
const TMDB_HEADERS = TMDB_BEARER_TOKEN ? {
  accept: 'application/json',
  Authorization: `Bearer ${TMDB_BEARER_TOKEN}`
} : null;

const tmdbCache = {
  movies: {}
};

async function fetchTmdbMovie(title, year = null) {
  if (!TMDB_HEADERS) return null;
  if (tmdbCache.movies[title]) return tmdbCache.movies[title];
  
  const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  try {
    let searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}&language=en-US`;
    if (year) {
      searchUrl += `&year=${year}`;
    }
    
    let searchRes = await axios.get(searchUrl, { headers: TMDB_HEADERS, timeout: 15000 });

    if (searchRes.data.results && searchRes.data.results.length > 0) {
      const movie = searchRes.data.results.find(m => m.title.toLowerCase() === cleanTitle.toLowerCase()) || searchRes.data.results[0];
      
      const creditsRes = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}/credits?language=en-US`, { headers: TMDB_HEADERS, timeout: 15000 });
      
      const result = {
        id: movie.id,
        posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        cast: creditsRes.data.cast || [],
        crew: creditsRes.data.crew || []
      };
      tmdbCache.movies[title] = result;
      return result;
    }
  } catch (e) {
  }
  return null;
}

async function getComposerFromTmdb(title, year) {
  try {
    const tmdbMovie = await fetchTmdbMovie(title, year);
    if (!tmdbMovie || !tmdbMovie.crew) return null;
    
    const composer = tmdbMovie.crew.find(c => 
      c.department === 'Music' || 
      c.job === 'Music' || 
      c.job === 'Composer' ||
      c.job === 'Original Music Composer'
    );
    
    if (composer) {
      return composer.name;
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function determineBestComposer(albumData, year) {
  
  // 0. Check overrides first
  const overrides = getComposerOverrides();
  if (overrides[albumData.name]) {
    return applyComposerAlias(overrides[albumData.name]);
  }

  const composerCandidates = [];
  
  // 1. Get composer from music service API data (highest priority)
  const musicServiceComposer = getComposerFromMusicService(albumData);
  if (musicServiceComposer) {
    const aliased = applyComposerAlias(musicServiceComposer);
    composerCandidates.push({ source: 'music_service', composer: aliased, priority: 3 });
  }
  
  // 2. Get composer from TMDB
  const tmdbComposer = await getComposerFromTmdb(albumData.name, year);
  if (tmdbComposer) {
    composerCandidates.push({ source: 'tmdb', composer: applyComposerAlias(tmdbComposer), priority: 2 });
  }
  
  // Note: iTunes fallback removed as it often pollutes Tamil metadata with record labels

  // 3. Fall back to detection from songs if no candidates
  if (composerCandidates.length === 0) {
    const detectedComposer = detectComposerFromSongs(albumData.songs);
    if (detectedComposer) {
      return applyComposerAlias(detectedComposer);
    }
    return 'Unknown Composer';
  }
  
  // 4. Determine best composer by frequency and priority
  const composerCounts = {};
  composerCandidates.forEach(candidate => {
    const name = candidate.composer.toLowerCase().trim();
    if (!composerCounts[name]) {
      composerCounts[name] = { count: 0, priority: 0, originalName: candidate.composer };
    }
    composerCounts[name].count++;
    composerCounts[name].priority = Math.max(composerCounts[name].priority, candidate.priority);
  });
  
  // Find composer with highest count, break ties with priority
  let bestComposer = null;
  let maxCount = 0;
  let maxPriority = 0;
  
  Object.entries(composerCounts).forEach(([name, data]) => {
    if (data.count > maxCount || (data.count === maxCount && data.priority > maxPriority)) {
      maxCount = data.count;
      maxPriority = data.priority;
      bestComposer = data.originalName;
    }
  });
  
  return bestComposer || 'Unknown Composer';
}

function getComposerFromMusicService(albumData) {
  if (!albumData.songs || albumData.songs.length === 0) return null;
  
  const composerCounts = {};
  
  albumData.songs.forEach(song => {
    const allArtists = song.artists?.all || [];
    const musicArtists = allArtists.filter(a => 
      a.role === 'music' || 
      a.role === 'music_director' ||
      a.role === 'composer'
    );
    musicArtists.forEach(artist => {
      if (!composerCounts[artist.name]) {
        composerCounts[artist.name] = 0;
      }
      composerCounts[artist.name]++;
    });
  });
  
  // Find composer that appears in most songs
  let bestComposer = null;
  let maxCount = 0;
  
  Object.entries(composerCounts).forEach(([name, count]) => {
    if (count > maxCount) {
      maxCount = count;
      bestComposer = name;
    }
  });
  
  return bestComposer;
}


async function downloadFile(url, destPath, onProgress) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000,
    onDownloadProgress: (progressEvent) => {
      if (onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress({
          progress: percentCompleted,
          current: 'Downloading audio...',
          status: 'downloading'
        });
      }
    }
  });

  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(destPath));
    writer.on('error', reject);
  });
}

async function convertToMp3(inputPath, outputPath, onProgress) {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 320k "${outputPath}" -y`;
    if (onProgress) {
      onProgress({
        progress: 50,
        current: 'Converting to MP3...',
        status: 'converting'
      });
    }
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg error:', stderr);
        reject(error);
      } else {
        if (onProgress) {
          onProgress({
            progress: 75,
            current: 'Writing ID3 tags...',
            status: 'tagging'
          });
        }
        resolve(outputPath);
      }
    });
  });
}

function getBestImageUrl(imageArray) {
  return getBestImage(imageArray);
}

async function writeID3Tags(songPath, songData, albumData, composer, artworkBuffer) {
  // Filter to only include singers (not lyricists, actors, etc.)
  const allArtists = songData.artists?.all || [];
  const singers = allArtists.filter(a =>
    a.role === 'singer' ||
    a.role === 'primary_artists' ||
    a.role === 'primary'
  );

  const artistNames = singers.length > 0
    ? singers.map(a => a.name)
    : (songData.artists?.primary?.map(a => a.name) || ['Unknown Artist']);

  const tags = {
    title: decodeHtmlEntities(songData.name),
    artist: artistNames.join(', '),
    album: decodeHtmlEntities(albumData.name),
    year: albumData.year,
    trackNumber: `${songData.trackNumber || 1}/${albumData.songCount || 1}`,
    performerInfo: composer || 'Unknown Composer', // TPE2 - Album Artist (critical for Navidrome)
    genre: songData.language || albumData.language || 'Unknown',
    copyright: songData.copyright || albumData.copyright || '',
    publisher: songData.label || albumData.label || ''
  };

  // Only set the composer tag if we have multiple composers or it differs from performerInfo
  // Omitting this prevents music players from showing duplicate composer names in the UI.

  if (artworkBuffer) {
    tags.image = {
      mime: 'image/jpeg',
      type: { id: 3, name: 'Front cover' },
      description: 'Album Art',
      imageBuffer: artworkBuffer
    };
  }

  try {
    NodeID3.write(tags, songPath);
    return true;
  } catch (e) {
    return false;
  }
}

async function downloadSingleSong(songId, onProgress) {
  try {
    if (onProgress) {
      onProgress({
        progress: 5,
        current: 'Fetching song details...',
        status: 'downloading'
      });
    }

    // 1. Fetch song details with 3-tier fallback
    const songRes = await fetchWithFallback('songs', { ids: songId }, 'songs');
    const songData = songRes?.data?.[0];
    if (!songData) throw new Error('Song not found');

    // 2. Fetch album details to get all songs (to detect composer properly) with 3-tier fallback
    const albumRes = await fetchWithFallback('albums', { id: songData.album.id }, 'albums');
    const albumData = albumRes?.data;
    if (!albumData) throw new Error('Album not found');

    if (onProgress) {
      onProgress({
        progress: 10,
        current: 'Determining composer...',
        status: 'downloading'
      });
    }

    // 3. Determine composer and year
    const copyrightYear = extractYearFromCopyright(albumData.copyright) ||
                          (albumData.songs?.length > 0 ? extractYearFromCopyright(albumData.songs[0].copyright) : null);
    const correctYear = copyrightYear || albumData.year || new Date().getFullYear();

    const composer = await determineBestComposer(albumData, correctYear);

    // 4. Setup directories
    const composerDir = path.join(MUSIC_DIR, sanitizeFilename(composer));
    const albumDirName = sanitizeFilename(`${albumData.name} ${correctYear}`);
    const albumDir = path.join(composerDir, albumDirName);

    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
    }

    // 5. Determine track number
    const trackIndex = albumData.songs?.findIndex(s => s.id === songData.id) || 0;
    const trackNum = (trackIndex + 1).toString().padStart(2, '0');
    const totalTracks = albumData.songs?.length || 1;
    songData.trackNumber = trackIndex + 1;
    albumData.songCount = totalTracks;
    albumData.year = correctYear;

    // 6. Download files (to temp file first, then convert to MP3)
    const songFilename = `${trackNum}. ${sanitizeFilename(decodeHtmlEntities(songData.name))}.mp3`;
    const songPath = path.join(albumDir, songFilename);
    const tempMp4Path = path.join(albumDir, `.tmp_${sanitizeFilename(decodeHtmlEntities(songData.name))}.mp4`);
    const downloadUrl = get320kbpsUrl(songData.downloadUrl);

    if (!downloadUrl) throw new Error('No download URL available');

    // Ensure we don't redownload if it exists
    if (!fs.existsSync(songPath)) {
      // Download to temp MP4 file with detailed progress
      await downloadFile(downloadUrl, tempMp4Path, (p) => {
        if (onProgress) {
          onProgress({
            ...p,
            current: `Downloading: ${songData.name} (${p.progress}%)`
          });
        }
      });

      // Convert to MP3 with detailed progress
      await convertToMp3(tempMp4Path, songPath, (p) => {
        if (onProgress) {
          onProgress({
            ...p,
            current: p.current === 'Writing ID3 tags...'
              ? `Writing ID3 tags: ${songData.name}`
              : `Converting: ${songData.name}`
          });
        }
      });

      // Remove temp MP4
      if (fs.existsSync(tempMp4Path)) {
        fs.unlinkSync(tempMp4Path);
      }
    }

    // 7. Download Artwork
    const artworkUrl = getBestImageUrl(albumData.image || songData.image);
    let artworkBuffer = null;
    if (artworkUrl) {
      const artworkPath = path.join(albumDir, 'cover.jpg');
      if (!fs.existsSync(artworkPath)) {
        await downloadFile(artworkUrl, artworkPath);
      }
      try {
        artworkBuffer = fs.readFileSync(artworkPath);
      } catch(e) {}
    }

    // 8. Write Tags
    await writeID3Tags(songPath, songData, albumData, composer, artworkBuffer);

    // 9. Update library
    updateLibraryWithSong(songData.id, songData.name, albumData.id, albumData.name, correctYear, songPath, totalTracks);

    return { success: true, path: songPath, filename: songFilename, albumName: albumData.name };
  } catch (error) {
    console.error('Download single song error:', error.message);
    return { success: false, error: error.message };
  }
}

async function downloadAlbum(albumId, onProgress) {
  try {
    if (onProgress) {
      onProgress({
        progress: 5,
        current: 'Fetching album details...',
        status: 'downloading'
      });
    }

    // 1. Fetch album details
    const albumRes = await axios.get(`${JIO_SAAVN_BASE}/albums`, { params: { id: albumId } });
    const albumData = albumRes.data?.data;
    if (!albumData) throw new Error('Album not found');

    const songs = albumData.songs || [];
    if (songs.length === 0) throw new Error('No songs in album');

    if (onProgress) {
      onProgress({
        progress: 10,
        current: 'Determining composer...',
        status: 'downloading'
      });
    }

    // 2. Determine composer and year
    const copyrightYear = extractYearFromCopyright(albumData.copyright) ||
                          extractYearFromCopyright(songs[0]?.copyright);
    const correctYear = copyrightYear || albumData.year || new Date().getFullYear();

    const composer = await determineBestComposer(albumData, correctYear);

    // 3. Setup directories
    const composerDir = path.join(MUSIC_DIR, sanitizeFilename(composer));
    const albumDirName = sanitizeFilename(`${albumData.name} ${correctYear}`);
    const albumDir = path.join(composerDir, albumDirName);

    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
    }

    albumData.year = correctYear;
    albumData.songCount = songs.length;

    // 3.5. Check if album is already downloaded
    if (fs.existsSync(albumDir)) {
      const songIds = songs.map(s => s.id).join(',');
      const songDetailsRes = await axios.get(`${JIO_SAAVN_BASE}/songs`, { params: { ids: songIds } });
      const fullSongs = songDetailsRes.data?.data || [];
      
      let allSongsExist = true;
      for (let i = 0; i < fullSongs.length; i++) {
        const songData = fullSongs[i];
        const trackNum = (i + 1).toString().padStart(2, '0');
        const songFilename = `${trackNum}. ${sanitizeFilename(decodeHtmlEntities(songData.name))}.mp3`;
        const songPath = path.join(albumDir, songFilename);
        
        if (!fs.existsSync(songPath)) {
          allSongsExist = false;
          break;
        }
      }
      
      if (allSongsExist) {
        if (onProgress) {
          onProgress({
            progress: 100,
            current: 'Album already downloaded',
            status: 'complete'
          });
        }
        return { success: true, results: [], albumDir, alreadyDownloaded: true };
      }
    }

    // 4. Download Artwork
    const artworkUrl = getBestImageUrl(albumData.image);
    let artworkBuffer = null;
    if (artworkUrl) {
      const artworkPath = path.join(albumDir, 'cover.jpg');
      if (!fs.existsSync(artworkPath)) {
        await downloadFile(artworkUrl, artworkPath);
      }
      try {
        artworkBuffer = fs.readFileSync(artworkPath);
      } catch(e) {}
    }

    // 5. Download all songs sequentially
    const results = [];
    // Need full song details to get download URLs with 3-tier fallback
    const songIds = songs.map(s => s.id).join(',');
    const songDetailsRes = await fetchWithFallback('songs', { ids: songIds }, 'songs');
    const fullSongs = songDetailsRes?.data || [];

    for (let i = 0; i < fullSongs.length; i++) {
      const songData = fullSongs[i];
      const trackNum = (i + 1).toString().padStart(2, '0');
      const songFilename = `${trackNum}. ${sanitizeFilename(decodeHtmlEntities(songData.name))}.mp3`;
      const songPath = path.join(albumDir, songFilename);
      const tempMp4Path = path.join(albumDir, `.tmp_${sanitizeFilename(decodeHtmlEntities(songData.name))}.mp4`);

      const downloadUrl = get320kbpsUrl(songData.downloadUrl);
      if (!downloadUrl) {
        results.push({ name: songData.name, success: false, error: 'No download URL' });
        continue;
      }

      // Update progress for current song (show progress after each song completes)
      const songProgress = Math.round(((i + 1) / fullSongs.length) * 100);
      if (onProgress) {
        onProgress({
          progress: songProgress,
          current: `Downloading song ${i + 1}/${fullSongs.length}: ${songData.name}`,
          currentSong: i + 1,
          totalSongs: fullSongs.length,
          status: 'downloading'
        });
      }

      try {
        if (!fs.existsSync(songPath)) {
          // Download to temp MP4 file with album-aware progress
          await downloadFile(downloadUrl, tempMp4Path, (p) => {
            if (onProgress) {
              const albumPercent = Math.min(99, Math.round(((i) / fullSongs.length) * 100 + (p.progress / fullSongs.length)));
              onProgress({
                progress: albumPercent,
                current: `Downloading song ${i + 1}/${fullSongs.length}: ${songData.name} (${p.progress}%)`,
                currentSong: i + 1,
                totalSongs: fullSongs.length,
                status: 'downloading'
              });
            }
          });

          // Convert to MP3 with album-aware progress
          await convertToMp3(tempMp4Path, songPath, (p) => {
            if (onProgress) {
              const albumPercent = Math.min(99, Math.round(((i) / fullSongs.length) * 100 + (p.progress / fullSongs.length)));
              const phase = p.current === 'Writing ID3 tags...' ? 'Tagging' : 'Converting';
              onProgress({
                progress: albumPercent,
                current: `${phase} ${i + 1}/${fullSongs.length}: ${songData.name}`,
                currentSong: i + 1,
                totalSongs: fullSongs.length,
                status: p.status || 'downloading'
              });
            }
          });

          // Remove temp MP4
          if (fs.existsSync(tempMp4Path)) {
            fs.unlinkSync(tempMp4Path);
          }
        }

        songData.trackNumber = i + 1;
        await writeID3Tags(songPath, songData, albumData, composer, artworkBuffer);
        results.push({ name: songData.name, success: true });
      } catch (e) {
        results.push({ name: songData.name, success: false, error: e.message });
        // Clean up temp file if it exists
        if (fs.existsSync(tempMp4Path)) {
          fs.unlinkSync(tempMp4Path);
        }
      }
    }

    // 6. Update library with all successfully downloaded songs
    const downloadedSongs = fullSongs
      .filter((song, idx) => results[idx]?.success)
      .map((song, idx) => {
        const trackNum = (idx + 1).toString().padStart(2, '0');
        const songFilename = `${trackNum}. ${sanitizeFilename(decodeHtmlEntities(song.name))}.mp3`;
        return {
          id: song.id,
          name: song.name,
          audioPath: path.join(albumDir, songFilename)
        };
      });

    if (downloadedSongs.length > 0) {
      updateLibraryWithAlbum(albumData.id, albumData.name, correctYear, albumDir, downloadedSongs, songs.length);
    }

    return { success: true, results, albumDir };
  } catch (error) {
    console.error('Download album error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  downloadSingleSong,
  downloadAlbum
};
