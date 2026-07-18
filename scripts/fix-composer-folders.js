const fs = require('fs');
const path = require('path');

const MUSIC_DIR = '/Volumes/samsung/Music';
const ALIAS_FILE = path.join(__dirname, '../config/composer-aliases.json');

function getAliases() {
  try {
    if (fs.existsSync(ALIAS_FILE)) {
      return JSON.parse(fs.readFileSync(ALIAS_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load composer-aliases.json', e);
  }
  return {};
}

function cleanUpDuplicateFolders() {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error('Music dir not found');
    return;
  }

  const aliases = getAliases();
  const composerDirs = fs.readdirSync(MUSIC_DIR).filter(f => {
    const fullPath = path.join(MUSIC_DIR, f);
    return fs.statSync(fullPath).isDirectory() && !f.startsWith('.');
  });

  let movedCount = 0;

  composerDirs.forEach(sourceName => {
    const normalizedName = sourceName.trim();
    const targetName = aliases[normalizedName] || aliases[sourceName];

    // If this folder name is an alias that needs to be moved to a canonical name
    if (targetName && targetName !== sourceName) {
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
            movedCount++;
          } else {
            console.warn(`Cannot move ${album}, target already exists in ${targetName}`);
          }
        }
      });

      // Remove source dir if empty
      if (fs.readdirSync(sourcePath).length === 0) {
        fs.rmdirSync(sourcePath);
        console.log(`Removed empty duplicate directory: ${sourceName}`);
      }
    }
  });

  console.log(`\nCompleted duplicate folder cleanup: Moved ${movedCount} albums.`);
  if (movedCount > 0) {
    console.log('IMPORTANT: Run `node scripts/scan-library.js` to update music-library.json with the new paths.');
  }
}

cleanUpDuplicateFolders();
