const fs = require('fs');
const path = require('path');
const { loadLibrary, saveLibrary } = require('../src/utils');

const MUSIC_DIR = '/Volumes/samsung/Music';
const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');

// Validate existing library - remove entries where files don't exist
function validateLibrary() {
  if (!fs.existsSync(LIBRARY_FILE)) {
    console.log('No existing library file found');
    return { albums: [] };
  }

  const library = loadLibrary(LIBRARY_FILE);
  const originalAlbumCount = library.albums.length;
  const originalSongCount = library.albums.reduce((sum, a) => sum + a.songs.length, 0);

  // Filter albums to only keep those with at least one existing song
  library.albums = library.albums.filter(album => {
    // Filter songs to only keep those where the file exists
    album.songs = album.songs.filter(song => {
      if (song.audioPath && fs.existsSync(song.audioPath)) {
        return true;
      }
      console.log(`Removing missing song: ${song.name} (${song.audioPath})`);
      return false;
    });

    // Remove album if it has no songs left
    if (album.songs.length === 0) {
      console.log(`Removing empty album: ${album.name}`);
      return false;
    }
    return true;
  });

  const removedAlbums = originalAlbumCount - library.albums.length;
  const removedSongs = originalSongCount - library.albums.reduce((sum, a) => sum + a.songs.length, 0);

  return {
    library,
    removedAlbums,
    removedSongs,
    remainingAlbums: library.albums.length,
    remainingSongs: library.albums.reduce((sum, a) => sum + a.songs.length, 0)
  };
}

// Main execution
if (!fs.existsSync(MUSIC_DIR)) {
  console.error(`Music directory not found: ${MUSIC_DIR}`);
  console.log('Please connect your external drive and try again');
  process.exit(1);
}

const result = validateLibrary();

if (result.removedAlbums > 0 || result.removedSongs > 0) {
  saveLibrary(LIBRARY_FILE, result.library);
  console.log(`Library validation complete:`);
  console.log(`  - Removed ${result.removedAlbums} albums`);
  console.log(`  - Removed ${result.removedSongs} songs`);
  console.log(`  - Remaining: ${result.remainingAlbums} albums with ${result.remainingSongs} songs`);
  console.log(`Library saved to ${LIBRARY_FILE}`);
} else {
  console.log(`Library validation complete: All files exist`);
  console.log(`  - ${result.remainingAlbums} albums with ${result.remainingSongs} songs`);
}
