const axios = require('axios');
const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const { exec } = require('child_process');

const MUSIC_DIR = '/Volumes/samsung/Music';
const JIO_SAAVN_BASE = 'https://saavn.sumit.co/api';
const LIBRARY_FILE = path.join(__dirname, 'music-library.json');

// Helper functions for music-library.json
function loadLibrary() {
  try {
    if (fs.existsSync(LIBRARY_FILE)) {
      const data = fs.readFileSync(LIBRARY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading library:', error.message);
  }
  return { albums: [] };
}

function saveLibrary(library) {
  try {
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(library, null, 2));
  } catch (error) {
    console.error('Error saving library:', error.message);
  }
}

function updateLibraryWithSong(songId, songName, albumId, albumName, albumYear, audioPath) {
  const library = loadLibrary();
  
  // Find or create album
  let album = library.albums?.find(a => a.id === albumId);
  if (!album) {
    album = {
      id: albumId,
      name: albumName,
      localPath: path.dirname(audioPath),
      songs: []
    };
    if (!library.albums) library.albums = [];
    library.albums.push(album);
  }
  
  // Update album local path if needed
  album.localPath = path.dirname(audioPath);
  
  // Find or create song
  let song = album.songs?.find(s => s.id === songId);
  if (!song) {
    song = {
      id: songId,
      name: songName,
      audioPath: audioPath
    };
    if (!album.songs) album.songs = [];
    album.songs.push(song);
  } else {
    // Update existing song path
    song.audioPath = audioPath;
  }
  
  saveLibrary(library);
}

function updateLibraryWithAlbum(albumId, albumName, albumYear, albumDir, songs) {
  const library = loadLibrary();
  
  // Find or create album
  let album = library.albums?.find(a => a.id === albumId);
  if (!album) {
    album = {
      id: albumId,
      name: albumName,
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
    name: s.name,
    audioPath: s.audioPath
  }));
  
  saveLibrary(library);
}

// TMDB API Configuration
const TMDB_API_KEY = '9951f6fd62760bffe5c47ba59777221c';
const TMDB_HEADERS = {
  accept: 'application/json',
  Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5OTUxZjZmZDYyNzYwYmZmZTVjNDdiYTU5Nzc3MjIxYyIsIm5iZiI6MTU1NDM5ODk3My41NzMsInN1YiI6IjVjYTYzZWZkYzNhMzY4NjE0ZTE2ZDU5YiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.eCo-hmtR4nKaEzbk9SAQuj6QTQBmFcXCJUAsnAc6GmE'
};

const tmdbCache = {
  movies: {}
};

async function fetchTmdbMovie(title, year = null) {
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
    console.warn(`TMDB Movie search failed for ${title}:`, e.message);
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

function detectComposerFromSongs(songs) {
  if (!songs || songs.length === 0) return null;
  
  const artistCounts = {};
  
  songs.forEach(song => {
    const allArtists = song.artists?.all?.map(a => a.name) || song.allArtists || [];
    allArtists.forEach(artist => {
      if (!artistCounts[artist]) artistCounts[artist] = 0;
      artistCounts[artist]++;
    });
  });
  
  const totalSongs = songs.length;
  const candidates = Object.entries(artistCounts)
    .filter(([_, count]) => count === totalSongs)
    .map(([artist]) => artist);
  
  if (candidates.length === 0) return null;
  
  const nonSingerCandidates = candidates.filter(artist => {
    const firstArtistCount = songs.filter(song => {
      const allArtists = song.artists?.all?.map(a => a.name) || song.allArtists || [];
      return allArtists[0] === artist;
    }).length;
    return firstArtistCount < totalSongs;
  });
  
  if (nonSingerCandidates.length > 0) return nonSingerCandidates[0];
  return candidates[0];
}

async function downloadFile(url, destPath) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000
  });

  const writer = fs.createWriteStream(destPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => resolve(destPath));
    writer.on('error', reject);
  });
}

async function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputPath}" -vn -ar 44100 -ac 2 -b:a 320k "${outputPath}" -y`;
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error('FFmpeg error:', stderr);
        reject(error);
      } else {
        resolve(outputPath);
      }
    });
  });
}

function getBestImageUrl(imageArray) {
  if (!imageArray || !Array.isArray(imageArray) || imageArray.length === 0) return null;
  const sorted = [...imageArray].sort((a, b) => {
    const qualityMap = { '50x50': 1, '150x150': 2, '500x500': 3 };
    return (qualityMap[b.quality] || 0) - (qualityMap[a.quality] || 0);
  });
  return sorted[0].url;
}

function get320kbpsUrl(downloadUrlArray) {
  if (!downloadUrlArray || !Array.isArray(downloadUrlArray)) return null;
  const url320 = downloadUrlArray.find(u => u.quality === '320kbps');
  return url320?.url || downloadUrlArray[0]?.url || null;
}

function extractYearFromCopyright(copyright) {
  if (!copyright) return null;
  const yearMatch = copyright.match(/(\d{4})/);
  return yearMatch ? parseInt(yearMatch[1]) : null;
}

function sanitizeFilename(name) {
  if (!name) return 'Unknown';
  return name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
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
    title: songData.name,
    artist: artistNames.join(', '),
    album: albumData.name,
    year: albumData.year,
    trackNumber: `${songData.trackNumber || 1}/${albumData.songCount || 1}`,
    performerInfo: composer || 'Unknown Composer', // TPE2 - Album Artist (critical for Navidrome)
    genre: songData.language || albumData.language || 'Unknown',
    composer: composer || 'Unknown Composer',
    copyright: songData.copyright || albumData.copyright || '',
    publisher: songData.label || albumData.label || ''
  };

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
    console.warn(`Failed to write ID3 tags: ${e.message}`);
    return false;
  }
}

async function downloadSingleSong(songId) {
  try {
    // 1. Fetch song details
    const songRes = await axios.get(`${JIO_SAAVN_BASE}/songs`, { params: { ids: songId } });
    const songData = songRes.data?.data?.[0];
    if (!songData) throw new Error('Song not found');

    // 2. Fetch album details to get all songs (to detect composer properly)
    const albumRes = await axios.get(`${JIO_SAAVN_BASE}/albums`, { params: { id: songData.album.id } });
    const albumData = albumRes.data?.data;
    if (!albumData) throw new Error('Album not found');

    // 3. Determine composer and year
    const copyrightYear = extractYearFromCopyright(albumData.copyright) || 
                          (albumData.songs?.length > 0 ? extractYearFromCopyright(albumData.songs[0].copyright) : null);
    const correctYear = copyrightYear || albumData.year || new Date().getFullYear();
    
    let composer = await getComposerFromTmdb(albumData.name, correctYear);
    if (!composer) {
      composer = detectComposerFromSongs(albumData.songs) || albumData.artists?.primary?.[0]?.name || 'Unknown Composer';
    }

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
    const songFilename = `${trackNum}. ${sanitizeFilename(songData.name)}.mp3`;
    const songPath = path.join(albumDir, songFilename);
    const tempMp4Path = path.join(albumDir, `.tmp_${sanitizeFilename(songData.name)}.mp4`);
    const downloadUrl = get320kbpsUrl(songData.downloadUrl);
    
    if (!downloadUrl) throw new Error('No download URL available');

    // Ensure we don't redownload if it exists
    if (!fs.existsSync(songPath)) {
      // Download to temp MP4 file
      await downloadFile(downloadUrl, tempMp4Path);
      
      // Convert to MP3
      await convertToMp3(tempMp4Path, songPath);
      
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
    updateLibraryWithSong(songData.id, songData.name, albumData.id, albumData.name, correctYear, songPath);

    return { success: true, path: songPath, filename: songFilename };
  } catch (error) {
    console.error('Download single song error:', error.message);
    return { success: false, error: error.message };
  }
}

async function downloadAlbum(albumId) {
  try {
    // 1. Fetch album details
    const albumRes = await axios.get(`${JIO_SAAVN_BASE}/albums`, { params: { id: albumId } });
    const albumData = albumRes.data?.data;
    if (!albumData) throw new Error('Album not found');

    const songs = albumData.songs || [];
    if (songs.length === 0) throw new Error('No songs in album');

    // 2. Determine composer and year
    const copyrightYear = extractYearFromCopyright(albumData.copyright) || 
                          extractYearFromCopyright(songs[0]?.copyright);
    const correctYear = copyrightYear || albumData.year || new Date().getFullYear();
    
    let composer = await getComposerFromTmdb(albumData.name, correctYear);
    if (!composer) {
      composer = detectComposerFromSongs(songs) || albumData.artists?.primary?.[0]?.name || 'Unknown Composer';
    }

    // 3. Setup directories
    const composerDir = path.join(MUSIC_DIR, sanitizeFilename(composer));
    const albumDirName = sanitizeFilename(`${albumData.name} ${correctYear}`);
    const albumDir = path.join(composerDir, albumDirName);
    
    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
    }

    albumData.year = correctYear;
    albumData.songCount = songs.length;

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
    // Need full song details to get download URLs
    const songIds = songs.map(s => s.id).join(',');
    const songDetailsRes = await axios.get(`${JIO_SAAVN_BASE}/songs`, { params: { ids: songIds } });
    const fullSongs = songDetailsRes.data?.data || [];

    for (let i = 0; i < fullSongs.length; i++) {
      const songData = fullSongs[i];
      const trackNum = (i + 1).toString().padStart(2, '0');
      const songFilename = `${trackNum}. ${sanitizeFilename(songData.name)}.mp3`;
      const songPath = path.join(albumDir, songFilename);
      const tempMp4Path = path.join(albumDir, `.tmp_${sanitizeFilename(songData.name)}.mp4`);
      
      const downloadUrl = get320kbpsUrl(songData.downloadUrl);
      if (!downloadUrl) {
        results.push({ name: songData.name, success: false, error: 'No download URL' });
        continue;
      }

      try {
        if (!fs.existsSync(songPath)) {
          // Download to temp MP4 file
          await downloadFile(downloadUrl, tempMp4Path);
          
          // Convert to MP3
          await convertToMp3(tempMp4Path, songPath);
          
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
        const songFilename = `${trackNum}. ${sanitizeFilename(song.name)}.mp3`;
        return {
          id: song.id,
          name: song.name,
          audioPath: path.join(albumDir, songFilename)
        };
      });

    if (downloadedSongs.length > 0) {
      updateLibraryWithAlbum(albumData.id, albumData.name, correctYear, albumDir, downloadedSongs);
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
