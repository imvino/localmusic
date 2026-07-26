const axios = require('axios');
const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const { sanitizeFilename, loadLibrary, saveLibrary, decodeHtmlEntities } = require('../src/utils');
const { PRIMARY_API } = require('../src/constants');

const MUSIC_DIR = '/Volumes/samsung/Music';
const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');
const JIO_SAAVN_BASE = PRIMARY_API;

// Helper to normalize string for comparison
function normalizeString(str) {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
}


// Match album by directory path
async function matchAlbum(albumId, albumDir) {
  try {
    // Fetch album details from music service
    const albumRes = await axios.get(`${JIO_SAAVN_BASE}/albums`, { params: { id: albumId } });
    const albumData = albumRes.data?.data;
    if (!albumData) {
      console.error('Album not found on music service');
      return;
    }

    console.log(`Matching album: ${albumData.name} (${albumData.year})`);
    console.log(`Local directory: ${albumDir}`);

    // Get all MP3 files in the directory
    const files = fs.readdirSync(albumDir);
    const mp3Files = files.filter(f => f.toLowerCase().endsWith('.mp3')).sort();

    console.log(`Found ${mp3Files.length} MP3 files locally`);
    console.log(`Album has ${albumData.songs?.length || 0} songs`);

    // Read local songs
    const localSongs = [];
    for (const mp3File of mp3Files) {
      const songPath = path.join(albumDir, mp3File);
      try {
        const tags = NodeID3.read(songPath);
        localSongs.push({
          path: songPath,
          name: tags.title || mp3File.replace('.mp3', ''),
          artist: tags.artist || '',
          album: tags.album || ''
        });
      } catch (e) {
        console.warn(`Failed to read ${mp3File}:`, e.message);
      }
    }

    // Match songs by name
    const matchedSongs = [];
    for (const jioSong of albumData.songs || []) {
      const jioName = normalizeString(jioSong.name);
      const jioArtists = (jioSong.artists?.primary || []).map(a => normalizeString(a.name)).join('');
      
      // Find best match
      let bestMatch = null;
      let bestScore = 0;
      
      for (const localSong of localSongs) {
        const localName = normalizeString(localSong.name);
        const localArtist = normalizeString(localSong.artist);
        
        // Calculate similarity score
        let score = 0;
        
        // Name similarity
        if (jioName === localName) score += 100;
        else if (jioName.includes(localName) || localName.includes(jioName)) score += 50;
        
        // Artist similarity
        if (jioArtists && localArtist) {
          if (jioArtists === localArtist) score += 50;
          else if (jioArtists.includes(localArtist) || localArtist.includes(jioArtists)) score += 25;
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = localSong;
        }
      }
      
      if (bestMatch && bestScore >= 50) {
        matchedSongs.push({
          id: jioSong.id,
          name: jioSong.name,
          audioPath: bestMatch.path,
          matchScore: bestScore
        });
        console.log(`  ✓ Matched: "${jioSong.name}" -> "${bestMatch.name}" (score: ${bestScore})`);
      } else {
        console.log(`  ✗ No match for: "${jioSong.name}"`);
      }
    }

    if (matchedSongs.length > 0) {
      // Update library
      const library = loadLibrary(LIBRARY_FILE);
      
      // Remove existing album if present
      library.albums = library.albums.filter(a => a.id !== albumId);
      
      // Add new album entry
      library.albums.push({
        id: albumId,
        name: albumData.name,
        year: albumData.year,
        localPath: albumDir,
        songs: matchedSongs.map(s => ({
          id: s.id,
          name: s.name,
          audioPath: s.audioPath
        }))
      });
      
      saveLibrary(LIBRARY_FILE, library);
      console.log(`\n✓ Updated library with ${matchedSongs.length} songs`);
    } else {
      console.log('\n✗ No songs matched');
    }
    
  } catch (error) {
    console.error('Error matching album:', error.message);
  }
}

// Main execution
const albumId = process.argv[2];
const albumDir = process.argv[3];

if (!albumId) {
  console.log('Usage: node match-album.js <albumId> [albumDir]');
  console.log('Example: node match-album.js 38218146 "/Volumes/samsung/Music/Yuvan Shankar Raja/Sarvam 2009"');
  process.exit(1);
}

if (!albumDir) {
  // Try to find the directory by searching MUSIC_DIR
  console.log('Searching for album directory...');
  const items = fs.readdirSync(MUSIC_DIR, { withFileTypes: true });
  
  for (const item of items) {
    if (item.isDirectory()) {
      const composerDir = path.join(MUSIC_DIR, item.name);
      const subItems = fs.readdirSync(composerDir, { withFileTypes: true });
      
      for (const subItem of subItems) {
        if (subItem.isDirectory()) {
          const albumPath = path.join(composerDir, subItem.name);
          const files = fs.readdirSync(albumPath);
          if (files.some(f => f.toLowerCase().endsWith('.mp3'))) {
            console.log(`Found: ${albumPath}`);
            matchAlbum(albumId, albumPath);
            process.exit(0);
          }
        }
      }
    }
  }
  
  console.log('No album directory found. Please specify the path manually.');
  process.exit(1);
} else {
  matchAlbum(albumId, albumDir);
}
