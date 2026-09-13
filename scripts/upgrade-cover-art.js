const fs = require('fs');
const path = require('path');
const axios = require('axios');
const NodeID3 = require('node-id3');
const { loadLibrary, saveLibrary, getBestImage, fetchWithFallback } = require('../src/utils');

const args = process.argv.slice(2);
const FETCH_MISSING = args.includes('--fetch');
const pathArg = args.find(a => a !== '--fetch');
const MUSIC_DIR = pathArg
  ? path.resolve(pathArg)
  : '/Volumes/samsung/Music';

const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');
const library = loadLibrary(LIBRARY_FILE);

function findImageFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => /\.jpe?g$/i.test(f))
      .map(f => ({ name: f, size: fs.statSync(path.join(dir, f)).size }));
  } catch (e) {
    return [];
  }
}

function pickBestLocalImage(images) {
  const hq = images.filter(i => i.name.includes('500x500'));
  if (hq.length) {
    return hq.sort((a, b) => b.size - a.size)[0].name;
  }
  return null;
}

function getMp3Files(dir) {
  try {
    return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.mp3'));
  } catch (e) {
    return [];
  }
}

function findAlbumInLibrary(albumPath) {
  if (!library || !library.albums) return null;
  return library.albums.find(a => a.localPath === albumPath);
}

function upgradeImageUrl(albumPath, imageUrl) {
  if (!library || !library.albums) return;
  const album = library.albums.find(a => a.localPath === albumPath);
  if (!album || !album.songs) return;
  for (const song of album.songs) {
    if (imageUrl) {
      song.imageUrl = imageUrl;
    } else if (song.imageUrl && song.imageUrl.includes('150x150')) {
      song.imageUrl = song.imageUrl.replace('150x150', '500x500');
    }
  }
}

async function downloadImage(url, destPath) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 20000
    });
    fs.writeFileSync(destPath, Buffer.from(response.data));
    return true;
  } catch (e) {
    console.warn(`  Could not download image from ${url}: ${e.message}`);
    return false;
  }
}

async function fetchHqCoverForAlbum(albumPath) {
  const album = findAlbumInLibrary(albumPath);
  if (!album || !album.id) return null;

  try {
    console.log(`  Fetching cover for album id ${album.id}...`);
    const res = await fetchWithFallback('albums', { id: album.id }, 'albums');
    const albumData = res?.data;
    if (!albumData) return null;

    const imageUrl = getBestImage(albumData.image) || getBestImage(albumData.songs?.[0]?.image);
    if (!imageUrl) return null;

    const destPath = path.join(albumPath, 'cover-500x500.jpg');
    const ok = await downloadImage(imageUrl, destPath);
    if (!ok) return null;

    return { imagePath: destPath, imageUrl };
  } catch (e) {
    console.warn(`  Error fetching cover for ${albumPath}: ${e.message}`);
    return null;
  }
}

async function processAlbum(dir) {
  const mp3s = getMp3Files(dir);
  if (mp3s.length === 0) return null;

  const images = findImageFiles(dir);
  let bestImage = pickBestLocalImage(images);
  let fetched = false;
  let imageUrl = null;

  if (!bestImage && FETCH_MISSING) {
    const fetchedCover = await fetchHqCoverForAlbum(dir);
    if (fetchedCover) {
      bestImage = path.basename(fetchedCover.imagePath);
      imageUrl = fetchedCover.imageUrl;
      fetched = true;
    }
  }

  if (!bestImage) {
    return { dir, status: 'no-hq-image', mp3Count: mp3s.length };
  }

  const imagePath = path.join(dir, bestImage);
  const coverPath = path.join(dir, 'cover.jpg');
  let imageBuffer;

  try {
    imageBuffer = fs.readFileSync(imagePath);
  } catch (e) {
    console.error(`  Could not read ${imagePath}: ${e.message}`);
    return { dir, status: 'read-error', mp3Count: mp3s.length };
  }

  const imageTag = {
    mime: 'image/jpeg',
    type: { id: 3, name: 'Front cover' },
    description: 'Album Art',
    imageBuffer
  };

  let updated = 0;
  let errors = 0;

  for (const mp3 of mp3s) {
    const mp3Path = path.join(dir, mp3);
    try {
      const ok = NodeID3.update({ image: imageTag }, mp3Path);
      if (ok === true) {
        updated++;
      } else {
        console.error(`  Failed: ${mp3Path} — ${ok && ok.message ? ok.message : ok}`);
        errors++;
      }
    } catch (e) {
      console.error(`  Error: ${mp3Path} — ${e.message}`);
      errors++;
    }
  }

  if (imagePath !== coverPath) {
    try {
      fs.copyFileSync(imagePath, coverPath);
    } catch (e) {
      console.warn(`  Could not replace cover.jpg in ${dir}: ${e.message}`);
    }
  }

  upgradeImageUrl(dir, imageUrl);

  return {
    dir,
    status: errors ? 'partial' : 'updated',
    updated,
    errors,
    mp3Count: mp3s.length,
    image: bestImage,
    fetched
  };
}

async function walk(dir, results) {
  const res = await processAlbum(dir);
  if (res) results.push(res);
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      await walk(full, results);
    }
  }
}

(async () => {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.error('Music directory not found:', MUSIC_DIR);
    process.exit(1);
  }

  const results = [];
  await walk(MUSIC_DIR, results);

  const updated = results.filter(r => r.status === 'updated' || r.status === 'partial');
  const noImage = results.filter(r => r.status === 'no-hq-image');

  if (updated.length) {
    console.log(`\nUpdated ${updated.length} album(s):`);
    for (const r of updated) {
      const source = r.fetched ? '(fetched)' : '(local)';
      console.log(`  ${r.dir} — ${r.updated}/${r.mp3Count} tracks (${r.image}) ${source}`);
      if (r.errors) console.log(`    ${r.errors} errors`);
    }
  }

  if (noImage.length) {
    console.log(`\nSkipped ${noImage.length} album(s) with no 500x500 image file.`);
    if (!FETCH_MISSING) {
      console.log('  Re-run with --fetch to download missing covers from the API.');
    }
  }

  saveLibrary(LIBRARY_FILE, library);
  console.log('\nLibrary imageUrl references upgraded where possible.');
  console.log(`Done: ${updated.length} updated, ${noImage.length} skipped, out of ${results.length} album folders.`);
})();
