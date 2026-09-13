const fs = require('fs');
const path = require('path');
const { applyComposerAlias, loadLibrary, saveLibrary } = require('../src/utils');

const MUSIC_DIR = '/Volumes/samsung/Music';
const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');

function updateLibraryPaths(library, oldPath, newPath) {
  if (!library.albums) return false;
  let updated = false;
  library.albums.forEach(album => {
    if (album.localPath && album.localPath.startsWith(oldPath)) {
      album.localPath = album.localPath.replace(oldPath, newPath);
      updated = true;
    }
    if (album.songs) {
      album.songs.forEach(song => {
        if (song.audioPath && song.audioPath.startsWith(oldPath)) {
          song.audioPath = song.audioPath.replace(oldPath, newPath);
          updated = true;
        }
      });
    }
  });
  return updated;
}

function cleanUpDuplicateFolders() {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error('Music dir not found');
    return;
  }

  const library = loadLibrary(LIBRARY_FILE);
  const composerDirs = fs.readdirSync(MUSIC_DIR).filter(f => {
    const fullPath = path.join(MUSIC_DIR, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
  });

  let movedCount = 0;
  let libraryUpdated = false;

  composerDirs.forEach(sourceName => {
    const targetName = applyComposerAlias(sourceName);

    if (targetName !== sourceName) {
      const sourcePath = path.join(MUSIC_DIR, sourceName);
      const targetPath = path.join(MUSIC_DIR, targetName);

      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }

      const albums = fs.readdirSync(sourcePath);
      albums.forEach(album => {
        const albumSourcePath = path.join(sourcePath, album);
        const albumTargetPath = path.join(targetPath, album);

        if (fs.statSync(albumSourcePath).isDirectory()) {
          if (!fs.existsSync(albumTargetPath)) {
            console.log(`Moving album: ${sourceName}/${album} -> ${targetName}/${album}`);
            fs.renameSync(albumSourcePath, albumTargetPath);
            if (updateLibraryPaths(library, albumSourcePath, albumTargetPath)) {
              libraryUpdated = true;
            }
            movedCount++;
          } else {
            console.warn(`Cannot move ${album}, target already exists in ${targetName}`);
          }
        }
      });

      if (fs.readdirSync(sourcePath).length === 0) {
        fs.rmdirSync(sourcePath);
        console.log(`Removed empty duplicate directory: ${sourceName}`);
      }
    }
  });

  if (libraryUpdated) {
    saveLibrary(LIBRARY_FILE, library);
    console.log('Updated music-library.json paths');
  }

  console.log(`\nCompleted duplicate folder cleanup: Moved ${movedCount} albums.`);
}

cleanUpDuplicateFolders();
