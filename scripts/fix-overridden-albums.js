const fs = require('fs');
const path = require('path');
const NodeID3 = require('node-id3');
const { applyComposerAlias, loadLibrary, saveLibrary } = require('../src/utils');

const MUSIC_DIR = '/Volumes/samsung/Music';
const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');
const OVERRIDES_FILE = path.join(__dirname, '../config/composer-overrides.json');

function getComposerOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_FILE)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load composer overrides:', e.message);
  }
  return {};
}

function cleanEmptySourceDir(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || sourceDir === targetDir) return;
  const entries = fs.readdirSync(sourceDir);
  const mp3s = entries.filter(e => e.toLowerCase().endsWith('.mp3'));
  if (mp3s.length > 0) return;

  // If there's a cover.jpg and target doesn't have one, copy it over
  const sourceCover = path.join(sourceDir, 'cover.jpg');
  const targetCover = path.join(targetDir, 'cover.jpg');
  if (entries.includes('cover.jpg') && !fs.existsSync(targetCover)) {
    try {
      fs.copyFileSync(sourceCover, targetCover);
      console.log(`Copied cover: ${sourceCover} -> ${targetCover}`);
    } catch (e) {
      console.warn(`Could not copy cover ${sourceCover}: ${e.message}`);
    }
  }

  // Remove remaining non-mp3 files and the empty directory
  for (const entry of entries) {
    const full = path.join(sourceDir, entry);
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Could not remove ${full}: ${e.message}`);
    }
  }

  try {
    fs.rmdirSync(sourceDir);
    console.log(`Removed empty source dir: ${sourceDir}`);
  } catch (e) {
    console.warn(`Could not remove dir ${sourceDir}: ${e.message}`);
  }
}

function fixOverriddenAlbums() {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error('Music dir not found');
    return;
  }

  const overrides = getComposerOverrides();
  const library = loadLibrary(LIBRARY_FILE);
  let movedCount = 0;
  let libraryUpdated = false;

  for (const album of library.albums || []) {
    const overrideComposer = overrides[album.name];
    if (!overrideComposer) continue;

    const targetComposer = applyComposerAlias(overrideComposer);
    const albumDirName = path.basename(album.localPath);
    const targetAlbumDir = path.join(MUSIC_DIR, targetComposer, albumDirName);

    // Move every song into the correct composer/album directory
    for (const song of album.songs || []) {
      const fileName = path.basename(song.audioPath);
      const expectedPath = path.join(targetAlbumDir, fileName);

      if (song.audioPath !== expectedPath) {
        if (fs.existsSync(song.audioPath)) {
          if (fs.existsSync(expectedPath)) {
            console.warn(`Target already exists, skipping: ${expectedPath}`);
          } else {
            if (!fs.existsSync(targetAlbumDir)) {
              fs.mkdirSync(targetAlbumDir, { recursive: true });
            }
            console.log(`Moving: ${song.audioPath} -> ${expectedPath}`);
            fs.renameSync(song.audioPath, expectedPath);
            movedCount++;
          }
        } else {
          console.warn(`Source file missing: ${song.audioPath}`);
        }
        song.audioPath = expectedPath;
        libraryUpdated = true;
      }

      // Ensure the TPE2 (album artist) tag is canonical
      if (fs.existsSync(expectedPath)) {
        NodeID3.update({ performerInfo: targetComposer }, expectedPath);
      }
    }

    // Also clean up the old album dir if it is not the target
    if (album.localPath !== targetAlbumDir) {
      cleanEmptySourceDir(album.localPath, targetAlbumDir);
      album.localPath = targetAlbumDir;
      libraryUpdated = true;
    }
  }

  if (libraryUpdated) {
    saveLibrary(LIBRARY_FILE, library);
    console.log('Updated music-library.json');
  }

  console.log(`\nCompleted: moved ${movedCount} song(s).`);
}

fixOverriddenAlbums();
