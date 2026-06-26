const { chromium } = require('playwright');
const axios = require('axios');
const AdmZip = require('adm-zip');
const NodeID3 = require('node-id3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const Fuse = require('fuse.js');

// Configuration
const args = process.argv.slice(2);
const OVERWRITE = args.includes('-overwrite') || args.includes('--overwrite');
const urlArg = args.find(arg => arg.startsWith('http'));

console.log(`OVERWRITE flag: ${OVERWRITE}`);
console.log(`Args: ${JSON.stringify(args)}`);

const MOVIE_URL = urlArg || 'https://www.masstamilan.dev/dude-2025-songs?ref=sb';
const TARGET_DIR = '/Volumes/samsung/Music/albums';
const ZIP_DIR = '/Volumes/samsung/Music/zips';
const LOG_FILE = path.join(__dirname, 'process-log.json');
const SONGS_JSON_FILE = path.join(__dirname, 'songs-data.json');
const TEMP_DIR = path.join(__dirname, 'temp');
const DELETE_ZIP_AFTER_EXTRACT = false; // Set to true to delete the zip file, false to keep it

// TMDB API Configuration
const TMDB_API_KEY = '9951f6fd62760bffe5c47ba59777221c';
const TMDB_HEADERS = {
  accept: 'application/json',
  Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5OTUxZjZmZDYyNzYwYmZmZTVjNDdiYTU5Nzc3MjIxYyIsIm5iZiI6MTU1NDM5ODk3My41NzMsInN1YiI6IjVjYTYzZWZkYzNhMzY4NjE0ZTE2ZDU5YiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.eCo-hmtR4nKaEzbk9SAQuj6QTQBmFcXCJUAsnAc6GmE'
};

// Ensure directories exist
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}
if (!fs.existsSync(ZIP_DIR)) {
  fs.mkdirSync(ZIP_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Initialize or load log
let processLog = {};
if (fs.existsSync(LOG_FILE)) {
  try {
    processLog = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading log file, starting fresh.');
  }
}

// Initialize or load songs data for MeiliSearch
let songsData = [];
if (fs.existsSync(SONGS_JSON_FILE)) {
  try {
    songsData = JSON.parse(fs.readFileSync(SONGS_JSON_FILE, 'utf8'));
  } catch (e) {
    console.error('Error reading songs data file, starting fresh.');
  }
}

// Helper to get album key from URL
function getAlbumKey(url, composerName = null) {
  const urlPart = url.replace(/https?:\/\/www\.masstamilan\.dev\//, '').replace(/\/$/, '');
  const composerPart = composerName ? `_${composerName.replace(/[\/\\:*?"<>|]/g, '-')}` : '';
  return `_album:${composerPart}_${urlPart}`;
}

// Helper to get expected zip filename from URL
function getZipFilename(url) {
  const urlParts = url.split('/');
  const filename = urlParts[urlParts.length - 1];
  return filename.endsWith('.zip') ? filename : filename + '.zip';
}

function saveLog() {
  fs.writeFileSync(LOG_FILE, JSON.stringify(processLog, null, 2));
}

function saveSongsData() {
  fs.writeFileSync(SONGS_JSON_FILE, JSON.stringify(songsData, null, 2));
}

// Helper function to clean up metadata strings
function cleanMetadataString(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/-\s*MassTamilan.*/gi, '')
    .replace(/-\s*Masstamilan.*/gi, '')
    .replace(/MassTamilan.*/gi, '')
    .replace(/Masstamilan.*/gi, '')
    .trim();
}

// TMDB API Helpers
const tmdbCache = {
  movies: {},
  people: {}
};

async function fetchTmdbMovie(title, year = null) {
  if (tmdbCache.movies[title]) return tmdbCache.movies[title];
  
  // Clean title for TMDB search (remove special chars, parens)
  const cleanTitle = title.replace(/\(.*?\)/g, '').replace(/[^a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  try {
    // Better TMDB search: use title and year parameters directly
    let searchUrl = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanTitle)}&language=en-US`;
    if (year) {
      searchUrl += `&year=${year}`;
    }
    
    // Add retry logic for ECONNRESET
    let searchRes;
    let retries = 10;
    while (retries > 0) {
        try {
            searchRes = await axios.get(searchUrl, { headers: TMDB_HEADERS, timeout: 15000 });
            break;
        } catch (err) {
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                retries--;
                if (retries === 0) throw err;
                console.warn(`TMDB search ECONNRESET, retry ${10 - retries}/10...`);
                await new Promise(r => setTimeout(r, 2000));
            } else {
                throw err;
            }
        }
    }

    if (searchRes.data.results && searchRes.data.results.length > 0) {
      // Find exact or closest match (often TMDB returns sequels, etc.)
      const movie = searchRes.data.results.find(m => m.title.toLowerCase() === cleanTitle.toLowerCase()) || searchRes.data.results[0];
      
      let creditsRes;
      retries = 10;
      while (retries > 0) {
          try {
              creditsRes = await axios.get(`https://api.themoviedb.org/3/movie/${movie.id}/credits?language=en-US`, { headers: TMDB_HEADERS, timeout: 15000 });
              break;
          } catch (err) {
              if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                  retries--;
                  if (retries === 0) throw err;
                  console.warn(`TMDB credits ECONNRESET, retry ${10 - retries}/10...`);
                  await new Promise(r => setTimeout(r, 2000));
              } else {
                  throw err;
              }
          }
      }
      
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

async function fetchTmdbPerson(name) {
  if (!name) return null;
  const cleanName = name.trim();
  if (tmdbCache.people[cleanName]) return tmdbCache.people[cleanName];
  
  // Clean up name for search (remove dots, extra spaces, handle initials better)
  // e.g., "R.Sarath Kumar" -> "R Sarathkumar" (or just let TMDB fuzzy match the raw string without dots)
  const searchString = cleanName.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  
  try {
    let res;
    let retries = 3;
    while (retries > 0) {
        try {
            res = await axios.get(`https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(searchString)}&language=en-US`, { headers: TMDB_HEADERS, timeout: 10000 });
            break;
        } catch (err) {
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
                retries--;
                if (retries === 0) throw err;
                await new Promise(r => setTimeout(r, 1000));
            } else {
                throw err;
            }
        }
    }

    if (res.data.results && res.data.results.length > 0) {
      // Find the best match
      // Try exact match on cleaned name first
      let person = res.data.results.find(p => p.name.replace(/\./g, '').replace(/\s+/g, '').toLowerCase() === searchString.replace(/\s+/g, '').toLowerCase());
      
      // Fallback to first result if no exact string match (TMDB search is usually good at putting the most famous person first)
      if (!person) {
          person = res.data.results[0];
      }
      
      const result = {
        id: person.id,
        name: person.name, // Keep TMDB's official spelling
        profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w200${person.profile_path}` : null
      };
      tmdbCache.people[cleanName] = result;
      return result;
    }
  } catch (e) {
    console.warn(`TMDB Person search failed for ${cleanName}:`, e.message);
  }
  // Cache null so we don't keep retrying
  tmdbCache.people[cleanName] = { id: null, name: cleanName, profileUrl: null };
  return tmdbCache.people[cleanName];
}

async function enrichPeopleNames(namesStr, movieCredits, role = null) {
  if (!namesStr) return [];
  // Handle '&' and ',' as separators
  const names = namesStr.replace(/&/g, ',').split(',').map(n => n.trim()).filter(Boolean);
  const enriched = [];
  
  let fuse = null;
  let allPeople = [];
  if (movieCredits) {
    allPeople = [...(movieCredits.cast || []), ...(movieCredits.crew || [])];
    // Setup Fuse.js for fuzzy matching
    const peopleWithNorm = allPeople.map(p => ({
      ...p,
      normalizedName: p.name.replace(/\./g, '').replace(/\s+/g, '').toLowerCase()
    }));
    fuse = new Fuse(peopleWithNorm, {
      includeScore: true,
      threshold: 0.4,
      keys: ['normalizedName', 'name']
    });
  }
  
  for (const name of names) {
    let personMatch = null;
    
    // Normalize name for comparison
    const normalizedSearchName = name.replace(/\./g, '').replace(/\s+/g, '').toLowerCase();
    
    // 1. Try to find in movie credits using simple string matching across all cast/crew
    if (movieCredits) {
      // Exact match (ignore dots and spaces)
      personMatch = allPeople.find(p =>
        p.name.replace(/\./g, '').replace(/\s+/g, '').toLowerCase() === normalizedSearchName
      );
      
      // First-word match: "Trisha" matches "Trisha Krishnan", "Arjun" matches "Arjun Sarja"
      if (!personMatch) {
        const candidates = allPeople.filter(p =>
          p.name.replace(/\./g, ' ').split(' ')[0].toLowerCase() === name.trim().toLowerCase()
        );
        // If multiple first-word matches, pick the shortest (most specific)
        if (candidates.length > 0) {
          personMatch = candidates.reduce((a, b) => a.name.length <= b.name.length ? a : b);
        }
      }
      
      // Contains match: "Anirudh" matches "Anirudh Ravichander"
      if (!personMatch) {
        personMatch = allPeople.find(p =>
          p.name.toLowerCase().includes(name.trim().toLowerCase())
        );
      }
      
      // Fuzzy match using Fuse.js
      if (!personMatch && fuse && normalizedSearchName.length > 4) {
        const results = fuse.search(normalizedSearchName);
        if (results.length > 0 && results[0].score <= 0.3) {
          personMatch = allPeople.find(p => p.id === results[0].item.id);
        }
      }
    }
    
    // 2. If found in credits, format it
    if (personMatch) {
      enriched.push({
        id: personMatch.id.toString(),
        name: personMatch.name, // Use TMDB official name
        profileUrl: personMatch.profile_path ? `https://image.tmdb.org/t/p/w200${personMatch.profile_path}` : null
      });
      continue;
    }
    
    // 3. Fallback to generic TMDB person search
    if (movieCredits) {
      console.warn(`No TMDB match found in movie credits for "${name}", falling back to generic search.`);
    }
    
    // Skip for single-word names if they're too short, or just use name
    if (name.length <= 1) {
      enriched.push({ id: crypto.randomUUID(), name: name, profileUrl: null, isLocal: true });
      continue;
    }
    const searchPerson = await fetchTmdbPerson(name);
    if (searchPerson && searchPerson.id) {
      enriched.push({
        id: searchPerson.id.toString(),
        name: searchPerson.name,
        profileUrl: searchPerson.profileUrl
      });
    } else {
      enriched.push({ id: crypto.randomUUID(), name: name, profileUrl: null, isLocal: true });
    }
  }
  
  return enriched;
}

// 1. Scrape Masstamilan using Playwright
async function scrapeMovieInfoAndDownloadLink() {
  console.log('Launching browser to scrape masstamilan.dev...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    await page.goto(MOVIE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Sometimes masstamilan has captchas or overlays, try waiting a bit
    await page.waitForTimeout(2000);

    // Extract Movie Information
    console.log('Extracting Movie Information...');
    const movieInfo = {
      starring: '',
      director: '',
      album: '',
      music: '',
      lyricist: '',
      year: ''
    };
    
    // Extract Album Name
    const h1Text = await page.locator('h1').first().innerText().catch(() => '');
    movieInfo.album = h1Text.replace(/ Songs Download.*/, '').replace('- MassTamilan', '').trim();
    if (!movieInfo.album || movieInfo.album === 'www.masstamilan.dev') {
        // fallback to title
        const titleText = await page.title();
        movieInfo.album = titleText.split('-')[0].trim();
    }

    // Getting the movie info block text
    const pageText = await page.locator('body').innerText();
    const lines = pageText.split('\n');
    for (const line of lines) {
      if (line.includes('Starring:')) {
        movieInfo.starring = line.replace('Starring:', '').trim();
      }
      if (line.includes('Director:')) {
        movieInfo.director = line.replace('Director:', '').trim();
      }
      if (line.includes('Music:')) {
        movieInfo.music = line.replace('Music:', '').trim();
      }
      if (line.match(/Lyricists?:/)) {
        movieInfo.lyricist = line.replace(/Lyricists?:/, '').trim();
      }
      if (line.includes('Year:')) {
        movieInfo.year = line.replace('Year:', '').trim();
      }
    }
    
    console.log('Movie Info Extracted:', movieInfo);

    // Extract Song List (length, downloads, singers)
    console.log('Extracting Song List...');
    const songList = [];
    
    // Try to find the song table/list on the page
    const songRows = await page.locator('table tbody tr[itemprop="itemListElement"]').all();
    
    for (const row of songRows) {
        const songInfo = {
          name: await row.locator('h2 a').innerText().catch(() => ''),
          singers: await row.locator('span[itemprop="byArtist"]').innerText().catch(() => ''),
          length: await row.locator('span[itemprop="duration"]').innerText().catch(() => ''),
          downloads: await row.locator('.dl-count').innerText().catch(() => '')
        };
        
        if (songInfo.name) {
          songList.push(songInfo);
        }
    }
    
    // Alternative: Try to find song info in a different format
    if (songList.length === 0) {
      console.log('Trying alternative song list extraction...');
      const allText = await page.locator('body').innerText();
      const textLines = allText.split('\n');
      
      let currentSong = null;
      for (const line of textLines) {
        const trimmed = line.trim();
        if (trimmed.match(/^\d+\./)) {
          // New song entry (e.g., "6. Oorum Blood")
          if (currentSong && currentSong.name) {
            songList.push(currentSong);
          }
          currentSong = { name: '', singers: '', length: '', downloads: '' };
          currentSong.name = trimmed.replace(/^\d+\.\s*/, '');
        } else if (currentSong) {
          if (trimmed.includes('Singers:')) {
            currentSong.singers = trimmed.replace('Singers:', '').trim();
          } else if (trimmed.includes('Length:')) {
            currentSong.length = trimmed.replace('Length:', '').trim();
          } else if (trimmed.includes('Downloads:')) {
            currentSong.downloads = trimmed.replace('Downloads:', '').trim();
          }
        }
      }
      if (currentSong && currentSong.name) {
        songList.push(currentSong);
      }
    }
    
    console.log(`Extracted ${songList.length} songs from page`);
    movieInfo.songList = songList;

    // Find 320kbps ZIP link
    console.log('Looking for 320kbps ZIP download link...');
    // Finding any link containing "ZIP"
    const links = await page.locator('a').all();
    let href = null;
    for (const link of links) {
        const text = await link.innerText();
        if (text.includes('320kbps') && text.includes('ZIP')) {
            href = await link.getAttribute('href');
            break;
        }
    }
    
    // Fallback if 320kbps zip not found, try 128kbps zip
    if (!href) {
        for (const link of links) {
            const text = await link.innerText();
            if (text.includes('ZIP')) {
                href = await link.getAttribute('href');
                console.log('Fell back to alternative ZIP link:', text);
                break;
            }
        }
    }
    
    if (!href) {
      console.log('Dumping page HTML for debugging to page-dump.html');
      const html = await page.content();
      fs.writeFileSync('page-dump.html', html);
      throw new Error('Could not find any ZIP download link');
    }

    const downloadUrl = href.startsWith('http') ? href : `https://www.masstamilan.dev${href}`;
    console.log(`Found download URL: ${downloadUrl}`);
    
    await browser.close();
    return { downloadUrl, movieInfo };
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// 2. Download ZIP using Free Download Manager with automatic polling
async function downloadZip(url, destPath) {
  const expectedFilename = getZipFilename(url);
  const zipPath = path.join(ZIP_DIR, expectedFilename);
  
  // Check if zip already exists
  if (fs.existsSync(zipPath)) {
    console.log(`ZIP file already exists: ${zipPath}`);
    console.log('Skipping download, using existing file.');
    return zipPath;
  }
  
  console.log(`Downloading ZIP using Free Download Manager from ${url}...`);
  console.log(`Target path: ${zipPath}`);
  
  return new Promise((resolve, reject) => {
    // Use open command to launch Free Download Manager with the URL
    exec(`open -a "/Applications/Free Download Manager.app" "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open Free Download Manager:', error);
        reject(error);
        return;
      }
      console.log('Free Download Manager launched. Waiting for download to complete...');
      
      // Poll for file existence in Downloads first (FDM default location)
      const downloadPath = path.join('/Users/vino/Downloads', expectedFilename);
      const checkInterval = setInterval(() => {
        if (fs.existsSync(downloadPath)) {
          clearInterval(checkInterval);
          console.log(`Download complete! File found at: ${downloadPath}`);
          
          // Move file to ZIP_DIR
          try {
            fs.renameSync(downloadPath, zipPath);
            console.log(`Moved ZIP to: ${zipPath}`);
            resolve(zipPath);
          } catch (moveError) {
            console.error(`Failed to move file to ${zipPath}:`, moveError.message);
            // If move fails, try copy instead
            try {
              fs.copyFileSync(downloadPath, zipPath);
              fs.unlinkSync(downloadPath);
              console.log(`Copied ZIP to: ${zipPath}`);
              resolve(zipPath);
            } catch (copyError) {
              console.error(`Failed to copy file: ${copyError.message}`);
              resolve(downloadPath); // Return original download path as fallback
            }
          }
        }
      }, 2000); // Check every 2 seconds
      
      // Timeout after 5 minutes
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error('Download timeout: file not found after 5 minutes'));
      }, 300000);
    });
  });
}

// Get individual song download URLs from the movie page
async function getIndividualSongUrls(movieUrl, songList) {
  console.log('Getting individual song download URLs...');
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    await page.goto(movieUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    const songUrls = {};
    
    for (const song of songList) {
      const songName = song.name.replace(/\s+/g, '-').toLowerCase();
      const songLinks = await page.locator('a').all();
      
      for (const link of songLinks) {
        const href = await link.getAttribute('href');
        const text = await link.innerText();
        
        if (href && href.includes(songName) && text.includes('320kbps')) {
          songUrls[song.name] = href.startsWith('http') ? href : `https://www.masstamilan.dev${href}`;
          console.log(`Found download URL for ${song.name}`);
          break;
        }
      }
    }
    
    await browser.close();
    return songUrls;
  } catch (error) {
    await browser.close();
    throw error;
  }
}

// Download individual song using Free Download Manager
async function downloadIndividualSong(url, songName) {
  console.log(`Downloading ${songName} using Free Download Manager...`);
  
  const urlParts = url.split('/');
  const expectedFilename = urlParts[urlParts.length - 1] + '.mp3';
  const downloadPath = path.join('/Users/vino/Downloads', expectedFilename);
  
  return new Promise((resolve, reject) => {
    exec(`open -a "/Applications/Free Download Manager.app" "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open Free Download Manager:', error);
        reject(error);
        return;
      }
      console.log(`Free Download Manager launched for ${songName}. Waiting for download...`);
      
      const checkInterval = setInterval(() => {
        if (fs.existsSync(downloadPath)) {
          clearInterval(checkInterval);
          console.log(`Download complete for ${songName}: ${downloadPath}`);
          resolve(downloadPath);
        }
      }, 2000);
      
      setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Download timeout for ${songName}`));
      }, 300000);
    });
  });
}

// 3. iTunes API Search - First get album info, then search for songs
async function searchITunes(songName, albumName, albumYear = null, artistName = null) {
  try {
    // Clean up album name - extract just the movie name
    const cleanAlbumName = albumName
      .replace(/Tamil mp3 songs download.*/i, '')
      .replace(/Songs Download.*/i, '')
      .replace(/MassTamilan.*/i, '')
      .replace(/\.com.*/i, '')
      .trim();
    
    // Clean up song name
    const cleanSongName = songName.replace(/-\s*MassTamilan.*/i, '').trim();
    
    // Clean up artist name if provided
    const cleanArtistName = artistName ? artistName.trim() : null;
    
    console.log(`Searching iTunes API for album: ${cleanAlbumName} (Tamil)${cleanArtistName ? `, artist: ${cleanArtistName}` : ''}`);
    
    // First, search for the album to get the album ID and proper metadata
    // Add "Tamil" to prioritize Tamil version, use country=IN for India
    let albumQuery = encodeURIComponent(`${cleanAlbumName} Tamil`);
    if (cleanArtistName) {
      albumQuery = encodeURIComponent(`${cleanAlbumName} ${cleanArtistName}`);
    }
    const albumResponse = await axios.get(`https://itunes.apple.com/search?term=${albumQuery}&entity=album&limit=15&country=IN`);
    
    let albumInfo = null;
    if (albumResponse.data && albumResponse.data.results && albumResponse.data.results.length > 0) {
      // Filter out unofficial uploads and prioritize Tamil/Indian/Soundtrack genres, exclude Telugu
      const validAlbums = albumResponse.data.results.filter(r => {
        const genre = r.primaryGenreName || '';
        const artist = (r.artistName || '').toLowerCase();
        const collection = (r.collectionName || '').toLowerCase();
        
        return (genre === 'Tamil' || genre === 'Indian' || genre === 'Soundtrack' || genre === 'Pop') &&
               !artist.includes('vevo') &&
               !collection.includes('#1trending') &&
               !collection.includes('telugu') &&
               !artist.includes('telugu');
      });
      
      const resultsToUse = validAlbums.length > 0 ? validAlbums : albumResponse.data.results;
      
      // Sort results: prioritize Tamil genre
      resultsToUse.sort((a, b) => {
        const aGenre = a.primaryGenreName || '';
        const bGenre = b.primaryGenreName || '';
        if (aGenre === 'Tamil' && bGenre !== 'Tamil') return -1;
        if (bGenre === 'Tamil' && aGenre !== 'Tamil') return 1;
        return 0;
      });
      
      // Try to find the specific single for this song, or fallback to the general album
      albumInfo = resultsToUse.find(r => 
        r.collectionName.toLowerCase().includes(cleanSongName.toLowerCase())
      ) || resultsToUse.find(r =>
        r.collectionName.toLowerCase().includes(cleanAlbumName.toLowerCase()) && !r.collectionName.includes('- Single')
      ) || resultsToUse[0];
      
      console.log(`Found album/single: ${albumInfo.collectionName} by ${albumInfo.artistName} (${albumInfo.primaryGenreName})`);
    }
    
    // Now search for the specific song with multiple strategies
    let songResponse = null;
    const searchStrategies = [
      // Strategy 1: Song + Album + Tamil (first preference)
      `${cleanSongName} ${cleanAlbumName} Tamil`,
      // Strategy 2: Song + Album + Artist + Tamil
      cleanArtistName ? `${cleanSongName} ${cleanAlbumName} ${cleanArtistName} Tamil` : null,
      // Strategy 3: Song + Artist + Tamil
      cleanArtistName ? `${cleanSongName} ${cleanArtistName} Tamil` : null,
      // Strategy 4: Song + Album + Artist
      cleanArtistName ? `${cleanSongName} ${cleanAlbumName} ${cleanArtistName}` : null,
      // Strategy 5: Song + Album
      `${cleanSongName} ${cleanAlbumName}`,
      // Strategy 6: Song + Artist
      cleanArtistName ? `${cleanSongName} ${cleanArtistName}` : null,
      // Strategy 7: Song + Tamil
      `${cleanSongName} Tamil`,
      // Strategy 8: Just song name (fallback)
      cleanSongName
    ].filter(Boolean);
    
    for (const strategy of searchStrategies) {
      const songQuery = encodeURIComponent(strategy);
      console.log(`Searching iTunes API for song: ${strategy}`);
      
      try {
        const response = await axios.get(`https://itunes.apple.com/search?term=${songQuery}&entity=song&limit=10&country=IN`);
        
        if (response.data && response.data.results && response.data.results.length > 0) {
          songResponse = response;
          console.log(`Found results with strategy: ${strategy}`);
          break;
        }
      } catch (e) {
        console.warn(`Search failed for strategy "${strategy}": ${e.message}`);
      }
    }
    
    if (songResponse && songResponse.data && songResponse.data.results && songResponse.data.results.length > 0) {
      // Filter out sketchy artists and prioritize Tamil/Indian genres
      const validSongs = songResponse.data.results.filter(r => {
          const artist = (r.artistName || '').toLowerCase();
          const genre = (r.primaryGenreName || '').toLowerCase();
          return !artist.includes('vevo') && (genre === 'tamil' || genre === 'indian' || genre === 'soundtrack' || genre === 'pop');
      });
      const songsToUse = validSongs.length > 0 ? validSongs : songResponse.data.results;

      // Find the best match - prefer exact match of song name with matching album/artist
      let track = songsToUse.find(t => 
        t.trackName.toLowerCase().includes(cleanSongName.toLowerCase()) &&
        (t.collectionName.toLowerCase().includes(cleanAlbumName.toLowerCase()) || 
         (cleanArtistName && t.artistName.toLowerCase().includes(cleanArtistName.toLowerCase())))
      );
      
      // Fallback to song name match only
      if (!track) {
        track = songsToUse.find(t => t.trackName.toLowerCase().includes(cleanSongName.toLowerCase()));
      }
      
      // Final fallback to first result
      if (!track) track = songsToUse[0];

      // Use album year if provided, otherwise fall back to track year
      const year = albumYear || (track.releaseDate ? track.releaseDate.substring(0, 4) : '');
      console.log(`iTunes releaseDate for ${cleanSongName}: ${track.releaseDate}, using year: ${year}`);
      console.log(`Selected track: ${track.trackName} from ${track.collectionName} by ${track.artistName} (${track.primaryGenreName})`);
      
      return {
        title: track.trackName || cleanSongName,
        artist: track.artistName,
        album: track.collectionName || (albumInfo ? albumInfo.collectionName : cleanAlbumName),
        year: year,
        genre: track.primaryGenreName,
        composer: track.composer || '',
        trackNumber: track.trackNumber || 0,
        trackCount: track.trackCount || 0,
        discNumber: track.discNumber || 1,
        discCount: track.discCount || 1,
        copyright: track.copyright || '',
        collectionId: track.collectionId,
        artworkUrl100: track.artworkUrl100
      };
    } else {
      console.warn(`No iTunes results found for song: ${cleanSongName}`);
    }
  } catch (error) {
    console.warn(`iTunes API search failed for ${songName}: ${error.message}`);
  }
  return null;
}

// Main execution flow
async function main() {
  try {
    // Generate preliminary album key without composer name to check log
    const preliminaryAlbumKey = getAlbumKey(MOVIE_URL);
    const preliminaryAlbumLog = processLog[preliminaryAlbumKey];
    
    let downloadUrl, movieInfo;
    
    // Check if album is already scraped and not in OVERWRITE mode
    if (!OVERWRITE && preliminaryAlbumLog && preliminaryAlbumLog.movieInfo) {
      console.log('Album found in log, using cached movieInfo. Skipping scrape.');
      movieInfo = preliminaryAlbumLog.movieInfo;
      downloadUrl = preliminaryAlbumLog.downloadUrl;
    } else {
      console.log('Scraping masstamilan.dev for movie info...');
      const scraped = await scrapeMovieInfoAndDownloadLink();
      downloadUrl = scraped.downloadUrl;
      movieInfo = scraped.movieInfo;
    }
    
    const albumKey = getAlbumKey(MOVIE_URL, movieInfo.music);
    const albumLog = processLog[albumKey];
    
    // Try to get proper album name from iTunes
    const cleanAlbumName = movieInfo.album
      .replace(/Tamil mp3 songs download.*/i, '')
      .replace(/Songs Download.*/i, '')
      .replace(/MassTamilan.*/i, '')
      .replace(/\.com.*/i, '')
      .trim();
    
    // Clear log entries for this album if OVERWRITE is true
    if (OVERWRITE) {
      console.log('OVERWRITE mode: Clearing log entries for this album...');
      // Clear album-level log
      delete processLog[albumKey];
      delete processLog[preliminaryAlbumKey];
      // Clear individual song logs for this album
      for (const key in processLog) {
        if (key !== albumKey && processLog[key].metadata && processLog[key].metadata.album === cleanAlbumName) {
          delete processLog[key];
        }
      }
      saveLog();
    }

    // Fetch TMDB Movie Data
    console.log(`Fetching TMDB Data for movie: ${cleanAlbumName}`);
    const tmdbMovie = await fetchTmdbMovie(cleanAlbumName, movieInfo.year);
    
    let tmdbMovieId = null;
    let tmdbPosterUrl = null;
    let enrichedStarring = [];
    let enrichedDirector = [];
    let enrichedMusic = [];
    let enrichedLyricist = [];
    
    if (tmdbMovie) {
        tmdbMovieId = tmdbMovie.id;
        tmdbPosterUrl = tmdbMovie.posterUrl;
        
        console.log('Enriching cast and crew with TMDB profiles...');
        enrichedStarring = await enrichPeopleNames(movieInfo.starring, tmdbMovie);
        enrichedDirector = await enrichPeopleNames(movieInfo.director, tmdbMovie);
        enrichedMusic = await enrichPeopleNames(movieInfo.music, tmdbMovie);
        enrichedLyricist = await enrichPeopleNames(movieInfo.lyricist, tmdbMovie);
    } else {
        console.warn('TMDB lookup failed. Continuing without TMDB enrichment.');
    }

    // First, get album info from iTunes to determine the folder name
    let albumFolderName = cleanAlbumName;
    
    let albumArtworkBuffer = null;
    let albumInfo = null;
    
    // Use year from masstamilan as primary source
    const masstamilanYear = movieInfo.year;
    console.log(`Year from masstamilan: ${masstamilanYear}`);
    
    try {
      const albumQuery = encodeURIComponent(`${cleanAlbumName} Tamil`);
      const albumResponse = await axios.get(`https://itunes.apple.com/search?term=${albumQuery}&entity=album&limit=15&country=IN`);
      if (albumResponse.data && albumResponse.data.results && albumResponse.data.results.length > 0) {
        // Filter out sketchy results and Telugu albums
        const validAlbums = albumResponse.data.results.filter(r => {
            const genre = r.primaryGenreName || '';
            const artist = (r.artistName || '').toLowerCase();
            const collection = (r.collectionName || '').toLowerCase();
            
            return (genre === 'Tamil' || genre === 'Indian' || genre === 'Soundtrack') &&
                   !artist.includes('vevo') &&
                   !collection.includes('#1trending') &&
                   !collection.includes('telugu') &&
                   !artist.includes('telugu');
        });
        const resultsToUse = validAlbums.length > 0 ? validAlbums : albumResponse.data.results;
        
        // Sort results: prioritize Tamil genre, then exact album name match
        resultsToUse.sort((a, b) => {
          const aGenre = a.primaryGenreName || '';
          const bGenre = b.primaryGenreName || '';
          if (aGenre === 'Tamil' && bGenre !== 'Tamil') return -1;
          if (bGenre === 'Tamil' && aGenre !== 'Tamil') return 1;
          return 0;
        });
        
        // Find the main album (prefer ones without "- Single")
        albumInfo = resultsToUse.find(r => 
          !r.collectionName.includes('- Single') &&
          r.collectionName.toLowerCase().includes(cleanAlbumName.toLowerCase())
        );
        
        // Fallback to the most relevant single if full album is not found
        if (!albumInfo) {
            albumInfo = resultsToUse.find(r => r.collectionName.toLowerCase().includes(cleanAlbumName.toLowerCase())) || resultsToUse[0];
        }

        // Just use the clean movie name for the folder so all singles go into one folder
        albumFolderName = cleanAlbumName;
        console.log(`Using folder name: ${albumFolderName}`);
        
        const artworkUrl = albumInfo.artworkUrl100 ? albumInfo.artworkUrl100.replace('100x100bb', '600x600bb') : null;
        if (artworkUrl) {
          try {
            console.log(`Downloading default album artwork from: ${artworkUrl}`);
            const artResponse = await axios.get(artworkUrl, { responseType: 'arraybuffer' });
            albumArtworkBuffer = Buffer.from(artResponse.data, 'binary');
            console.log(`Default album artwork downloaded successfully (${albumArtworkBuffer.length} bytes)`);
          } catch (e) {
            console.warn(`Failed to download default album artwork: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch album name from iTunes, using scraped name');
    }
    
    // Create composer folder and album subfolder
    const composerName = movieInfo.music || 'Unknown Composer';
    const cleanComposerName = composerName.replace(/[\/\\:*?"<>|]/g, '-').trim();
    const albumDir = path.join(TARGET_DIR, cleanComposerName, albumFolderName);
    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
      console.log(`Created album folder: ${albumDir}`);
    }
    
    let zipPath = null;
    
    // Check if zip file exists in ZIP_DIR
    const expectedZipFilename = getZipFilename(downloadUrl);
    const existingZipPath = path.join(ZIP_DIR, expectedZipFilename);
    
    // Get existing MP3 files from album folder
    const existingFiles = fs.existsSync(albumDir) ? fs.readdirSync(albumDir).filter(f => f.toLowerCase().endsWith('.mp3')) : [];
    
    // Check if album is already downloaded AND has files
    if (!OVERWRITE && albumLog && albumLog.downloaded && albumLog.albumPath === albumDir && existingFiles.length > 0) {
      console.log(`Album already downloaded with ${existingFiles.length} files. Skipping download step.`);
      console.log(`Using existing files from: ${albumDir}`);
      
      // Process existing files
      for (const fileName of existingFiles) {
        const targetFilePath = path.join(albumDir, fileName);
        
        // Check if already processed
        if (!OVERWRITE && processLog[fileName] && processLog[fileName].status === 'success') {
          console.log(`Skipping ${fileName} - already processed successfully.`);
          continue;
        }

        console.log(`\nProcessing existing file: ${fileName}`);
        
        // Read existing ID3 tags as fallback
        const existingTags = NodeID3.read(targetFilePath);
        
        // Get song name from file
        const rawSongName = fileName.replace('.mp3', '');
        
        // Fetch metadata from iTunes
        const itunesMeta = await searchITunes(rawSongName, movieInfo.album, masstamilanYear, movieInfo.music);
        
        // Prepare ID3 tags with fallback to existing tags
        const commentParts = [];
        if (movieInfo.starring) commentParts.push(`Starring: ${movieInfo.starring}`);
        if (movieInfo.director) commentParts.push(`Director: ${movieInfo.director}`);
        const commentStr = commentParts.join(' | ');

        let tags = {
          title: rawSongName.replace(/-\s*MassTamilan.*/i, '').trim(),
          album: albumFolderName,
          comment: {
            language: "eng",
            text: commentStr
          }
        };
        let trackArtworkUrl = null;

        // Merge iTunes metadata if available, with fallback to existing tags
        if (itunesMeta) {
          tags.title = cleanMetadataString(itunesMeta.title || existingTags.title || tags.title);
          tags.artist = cleanMetadataString(itunesMeta.artist || existingTags.artist || '');
          tags.album = albumFolderName;
          tags.year = itunesMeta.year || existingTags.year || '';
          tags.genre = itunesMeta.genre || existingTags.genre || '';
          tags.composer = cleanMetadataString(itunesMeta.composer || existingTags.composer || '');
          tags.trackNumber = itunesMeta.trackNumber || existingTags.trackNumber || 0;
          tags.trackCount = itunesMeta.trackCount || existingTags.trackCount || 0;
          tags.discNumber = itunesMeta.discNumber || existingTags.discNumber || 1;
          tags.discCount = itunesMeta.discCount || existingTags.discCount || 1;
          
          // Download specific artwork for this song if available
          let trackArtworkBuffer = null;
          trackArtworkUrl = itunesMeta.artworkUrl100 ? itunesMeta.artworkUrl100.replace('100x100bb', '600x600bb') : null;
          
          if (trackArtworkUrl) {
            try {
              console.log(`Downloading track-specific artwork from: ${trackArtworkUrl}`);
              const trackArtResponse = await axios.get(trackArtworkUrl, { responseType: 'arraybuffer' });
              trackArtworkBuffer = Buffer.from(trackArtResponse.data, 'binary');
            } catch (e) {
              console.warn(`Failed to download track artwork, falling back to album artwork: ${e.message}`);
            }
          }
          
          // Use track artwork, fallback to album artwork, fallback to existing artwork
          if (trackArtworkBuffer) {
            tags.image = {
              mime: "image/jpeg",
              type: { id: 3, name: "front cover" },
              description: "Album Art",
              imageBuffer: trackArtworkBuffer
            };
          } else if (albumArtworkBuffer) {
            tags.image = {
              mime: "image/jpeg",
              type: { id: 3, name: "front cover" },
              description: "Album Art",
              imageBuffer: albumArtworkBuffer
            };
          } else if (existingTags.image) {
            tags.image = existingTags.image;
          }
          
          console.log(`Successfully mapped iTunes metadata for ${fileName}`);
        } else {
          // Fallback to existing tags if iTunes search fails
          tags.title = cleanMetadataString(existingTags.title || tags.title);
          tags.artist = cleanMetadataString(existingTags.artist || '');
          tags.year = existingTags.year || '';
          tags.genre = existingTags.genre || '';
          tags.composer = cleanMetadataString(existingTags.composer || '');
          tags.trackNumber = existingTags.trackNumber || 0;
          tags.trackCount = existingTags.trackCount || 0;
          tags.discNumber = existingTags.discNumber || 1;
          tags.discCount = existingTags.discCount || 1;
          if (existingTags.image) {
            tags.image = existingTags.image;
          }
          console.log(`Using existing/fallback metadata for ${fileName}`);
        }

        // Update ID3 tags
        let finalFileName = fileName;
        let finalFilePath = targetFilePath;
        
        if (tags.title) {
          // Keep quotes as they are valid on Mac, only replace path separators
          const sanitizedTitle = tags.title.replace(/[\/\\]/g, '-').trim();
          finalFileName = `${sanitizedTitle}.mp3`;
          finalFilePath = path.join(albumDir, finalFileName);
          
          if (targetFilePath !== finalFilePath) {
            // If target file already exists, keep the original filename to avoid conflicts
            if (fs.existsSync(finalFilePath)) {
              console.log(`iTunes title conflicts with existing file. Keeping original filename: ${fileName}`);
              finalFileName = fileName;
              finalFilePath = targetFilePath;
            } else {
              fs.renameSync(targetFilePath, finalFilePath);
              console.log(`Renamed file to: ${finalFileName}`);
            }
          }
        }
        
        const success = NodeID3.write(tags, finalFilePath);
        
        if (success) {
          console.log(`Successfully updated metadata for ${finalFileName}`);
          
          // Find matching song info from scraped list using original fileName
          const songInfo = movieInfo.songList?.find(s => 
            fileName.toLowerCase().includes(s.name.toLowerCase().replace(/\s+/g, '-')) ||
            s.name.toLowerCase().includes(fileName.toLowerCase().replace('.mp3', '').replace(/-/g, ' '))
          );
          
          const rawSingers = songInfo?.singers || tags.artist;
          const enrichedSingers = await enrichPeopleNames(rawSingers, tmdbMovie);
          
          // Prepare song data for MeiliSearch
          const songDataEntry = {
            id: crypto.randomUUID(),
            title: tags.title,
            artist: tags.artist,
            album: tags.album,
            year: tags.year,
            genre: tags.genre,
            composer: tags.composer,
            trackNumber: tags.trackNumber,
            discNumber: tags.discNumber,
            length: songInfo?.length || '',
            downloads: songInfo?.downloads || '',
            singers: rawSingers,
            filePath: finalFilePath,
            hasArtwork: !!tags.image,
            artworkUrl: trackArtworkUrl || (artworkUrl ? artworkUrl.replace('100x100bb', '600x600bb') : tmdbPosterUrl),
            starring: movieInfo.starring,
            director: movieInfo.director,
            lyricist: movieInfo.lyricist,
            // TMDB Enriched Fields
            movieTmdbId: tmdbMovieId,
            moviePosterUrl: tmdbPosterUrl,
            starringEnriched: enrichedStarring,
            directorEnriched: enrichedDirector,
            composerEnriched: enrichedMusic,
            lyricistEnriched: enrichedLyricist,
            singersEnriched: enrichedSingers,
            createdAt: new Date().toISOString()
          };
          
          // Add to songs data array (avoid duplicates)
          const existingIndex = songsData.findIndex(s => 
            s.title === songDataEntry.title && 
            s.album === songDataEntry.album &&
            s.year === songDataEntry.year &&
            s.composer === songDataEntry.composer
          );
          if (existingIndex >= 0) {
            songsData[existingIndex] = songDataEntry;
          } else {
            songsData.push(songDataEntry);
          }
          
          processLog[finalFileName] = {
            status: 'success',
            timestamp: new Date().toISOString(),
            metadata: {
              title: tags.title,
              artist: tags.artist || null,
              album: tags.album,
              hasArtwork: !!tags.image,
              composer: tags.composer || null,
              trackNumber: tags.trackNumber || 0
            }
          };
        } else {
          console.error(`Failed to update metadata for ${finalFileName}`);
          processLog[finalFileName] = {
            status: 'error',
            error: 'Failed to write ID3 tags',
            timestamp: new Date().toISOString()
          };
        }
        
        saveLog();
        saveSongsData();
      }
      
      console.log('Done processing existing files!');
      return;
    }
    
    // If album folder is empty but zip exists in ZIP_DIR, use it
    if (existingFiles.length === 0 && fs.existsSync(existingZipPath)) {
      console.log(`Album folder is empty but zip exists: ${existingZipPath}`);
      console.log('Using existing zip file.');
      zipPath = existingZipPath;
    } else {
      // Download using Free Download Manager (automatic polling)
      zipPath = await downloadZip(downloadUrl, null);
    }
    console.log('Extracting...');
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    
    // Extract all MP3 files first
    const extractedFiles = [];
    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.mp3')) {
        const fileName = path.basename(entry.entryName);
        const targetFilePath = path.join(albumDir, fileName);
        fs.writeFileSync(targetFilePath, entry.getData());
        extractedFiles.push(fileName);
      }
    }
    
    console.log(`Extracted ${extractedFiles.length} MP3 files from ZIP`);
    console.log(`Expected ${movieInfo.songList.length} songs from page`);
    
    // Check if any songs are missing
    if (extractedFiles.length < movieInfo.songList.length) {
      console.log(`\n⚠️  Missing ${movieInfo.songList.length - extractedFiles.length} song(s). Downloading individually...`);
      
      // Get individual song download URLs
      const songUrls = await getIndividualSongUrls(MOVIE_URL, movieInfo.songList);
      
      // Download missing songs
      for (const song of movieInfo.songList) {
        const songFileName = song.name.replace(/\s+/g, '-') + '.mp3';
        const alreadyExists = extractedFiles.some(f => 
          f.toLowerCase().includes(song.name.toLowerCase().replace(/\s+/g, '-')) ||
          song.name.toLowerCase().includes(f.toLowerCase().replace('.mp3', '').replace(/-/g, ' '))
        );
        
        if (!alreadyExists && songUrls[song.name]) {
          try {
            const downloadedPath = await downloadIndividualSong(songUrls[song.name], song.name);
            const targetPath = path.join(albumDir, songFileName);
            fs.copyFileSync(downloadedPath, targetPath);
            fs.unlinkSync(downloadedPath);
            extractedFiles.push(songFileName);
            console.log(`Downloaded and added: ${song.name}`);
          } catch (error) {
            console.error(`Failed to download ${song.name}:`, error.message);
          }
        }
      }
      
      console.log(`Total files after individual downloads: ${extractedFiles.length}`);
    }
    
    // Process all extracted files
    for (const fileName of extractedFiles) {
      const targetFilePath = path.join(albumDir, fileName);
      
      // Check if already processed
      if (!OVERWRITE && processLog[fileName] && processLog[fileName].status === 'success') {
        console.log(`Skipping ${fileName} - already processed successfully.`);
        continue;
      }

      console.log(`\nProcessing: ${fileName}`);
      
      // Read existing ID3 tags as fallback
      const existingTags = NodeID3.read(targetFilePath);
      
      // Get song name from file
      const rawSongName = fileName.replace('.mp3', '');
      
      // Fetch metadata from iTunes
      const itunesMeta = await searchITunes(rawSongName, movieInfo.album, masstamilanYear, movieInfo.music);
      
      // Prepare ID3 tags with fallback to existing tags
      const commentParts = [];
      if (movieInfo.starring) commentParts.push(`Starring: ${movieInfo.starring}`);
      if (movieInfo.director) commentParts.push(`Director: ${movieInfo.director}`);
      const commentStr = commentParts.join(' | ');

      let tags = {
        title: rawSongName.replace(/-\s*MassTamilan.*/i, '').trim(),
        album: albumFolderName,
        comment: {
          language: "eng",
          text: commentStr
        }
      };
      let trackArtworkUrl = null;

      // Merge iTunes metadata if available, with fallback to existing tags
      if (itunesMeta) {
        tags.title = cleanMetadataString(itunesMeta.title || existingTags.title || tags.title);
        tags.artist = cleanMetadataString(itunesMeta.artist || existingTags.artist || '');
        tags.album = albumFolderName;
        tags.year = itunesMeta.year || existingTags.year || '';
        tags.genre = itunesMeta.genre || existingTags.genre || '';
        tags.composer = cleanMetadataString(itunesMeta.composer || existingTags.composer || '');
        tags.trackNumber = itunesMeta.trackNumber || existingTags.trackNumber || 0;
        tags.trackCount = itunesMeta.trackCount || existingTags.trackCount || 0;
        tags.discNumber = itunesMeta.discNumber || existingTags.discNumber || 1;
        tags.discCount = itunesMeta.discCount || existingTags.discCount || 1;
        
        // Download specific artwork for this song if available
        let trackArtworkBuffer = null;
        trackArtworkUrl = itunesMeta.artworkUrl100 ? itunesMeta.artworkUrl100.replace('100x100bb', '600x600bb') : null;
        
        if (trackArtworkUrl) {
          try {
            console.log(`Downloading track-specific artwork from: ${trackArtworkUrl}`);
            const trackArtResponse = await axios.get(trackArtworkUrl, { responseType: 'arraybuffer' });
            trackArtworkBuffer = Buffer.from(trackArtResponse.data, 'binary');
          } catch (e) {
            console.warn(`Failed to download track artwork, falling back to album artwork: ${e.message}`);
          }
        }
        
        // Use track artwork, fallback to album artwork, fallback to existing artwork
        if (trackArtworkBuffer) {
          tags.image = {
            mime: "image/jpeg",
            type: { id: 3, name: "front cover" },
            description: "Album Art",
            imageBuffer: trackArtworkBuffer
          };
        } else if (albumArtworkBuffer) {
          tags.image = {
            mime: "image/jpeg",
            type: { id: 3, name: "front cover" },
            description: "Album Art",
            imageBuffer: albumArtworkBuffer
          };
        } else if (existingTags.image) {
          tags.image = existingTags.image;
        }
        
        console.log(`Successfully mapped iTunes metadata for ${fileName}`);
      } else {
        // Fallback to existing tags if iTunes search fails
        tags.title = cleanMetadataString(existingTags.title || tags.title);
        tags.artist = cleanMetadataString(existingTags.artist || '');
        tags.year = existingTags.year || '';
        tags.genre = existingTags.genre || '';
        tags.composer = cleanMetadataString(existingTags.composer || '');
        tags.trackNumber = existingTags.trackNumber || 0;
        tags.trackCount = existingTags.trackCount || 0;
        tags.discNumber = existingTags.discNumber || 1;
        tags.discCount = existingTags.discCount || 1;
        if (existingTags.image) {
          tags.image = existingTags.image;
        }
        console.log(`Using existing/fallback metadata for ${fileName}`);
      }

      // Update ID3 tags
      let finalFileName = fileName;
      let finalFilePath = targetFilePath;
      
      if (tags.title) {
        // Keep quotes as they are valid on Mac, only replace path separators
        const sanitizedTitle = tags.title.replace(/[\/\\]/g, '-').trim();
        finalFileName = `${sanitizedTitle}.mp3`;
        finalFilePath = path.join(albumDir, finalFileName);
        
        if (targetFilePath !== finalFilePath) {
          // If target file already exists, keep the original filename to avoid conflicts
          if (fs.existsSync(finalFilePath)) {
            console.log(`iTunes title conflicts with existing file. Keeping original filename: ${fileName}`);
            finalFileName = fileName;
            finalFilePath = targetFilePath;
          } else {
            fs.renameSync(targetFilePath, finalFilePath);
            console.log(`Renamed file to: ${finalFileName}`);
          }
        }
      }
      
      const success = NodeID3.write(tags, finalFilePath);
      
      if (success) {
        console.log(`Successfully updated metadata for ${finalFileName}`);
        
        // Find matching song info from scraped list using original fileName
        const songInfo = movieInfo.songList?.find(s => 
          fileName.toLowerCase().includes(s.name.toLowerCase().replace(/\s+/g, '-')) ||
          s.name.toLowerCase().includes(fileName.toLowerCase().replace('.mp3', '').replace(/-/g, ' '))
        );
        
        const rawSingers = songInfo?.singers || tags.artist;
        const enrichedSingers = await enrichPeopleNames(rawSingers, tmdbMovie);
        
        // Prepare song data for MeiliSearch
        const songDataEntry = {
          id: crypto.randomUUID(),
          title: tags.title,
          artist: tags.artist,
          album: tags.album,
          year: tags.year,
          genre: tags.genre,
          composer: tags.composer,
          trackNumber: tags.trackNumber,
          discNumber: tags.discNumber,
          length: songInfo?.length || '',
          downloads: songInfo?.downloads || '',
          singers: rawSingers,
          filePath: finalFilePath,
          hasArtwork: !!tags.image,
          artworkUrl: trackArtworkUrl || (artworkUrl ? artworkUrl.replace('100x100bb', '600x600bb') : tmdbPosterUrl),
          starring: movieInfo.starring,
          director: movieInfo.director,
          lyricist: movieInfo.lyricist,
          // TMDB Enriched Fields
          movieTmdbId: tmdbMovieId,
          moviePosterUrl: tmdbPosterUrl,
          starringEnriched: enrichedStarring,
          directorEnriched: enrichedDirector,
          composerEnriched: enrichedMusic,
          lyricistEnriched: enrichedLyricist,
          singersEnriched: enrichedSingers,
          createdAt: new Date().toISOString()
        };
        
        // Add to songs data array (avoid duplicates)
        const existingIndex = songsData.findIndex(s => 
          s.title === songDataEntry.title && 
          s.album === songDataEntry.album &&
          s.year === songDataEntry.year &&
          s.composer === songDataEntry.composer
        );
        if (existingIndex >= 0) {
          songsData[existingIndex] = songDataEntry;
        } else {
          songsData.push(songDataEntry);
        }
        
        processLog[finalFileName] = {
          status: 'success',
          timestamp: new Date().toISOString(),
          metadata: {
            title: tags.title,
            artist: tags.artist || null,
            album: tags.album,
            hasArtwork: !!tags.image,
            composer: tags.composer || null,
            trackNumber: tags.trackNumber || 0
          }
        };
      } else {
        console.error(`Failed to update metadata for ${finalFileName}`);
        processLog[finalFileName] = {
          status: 'error',
          error: 'Failed to write ID3 tags',
          timestamp: new Date().toISOString()
        };
      }
      
      saveLog();
      saveSongsData();
    }
    
    // Cleanup
    if (DELETE_ZIP_AFTER_EXTRACT) {
      console.log('\nCleaning up temporary files...');
      if (zipPath && fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
        console.log(`Deleted ZIP file: ${zipPath}`);
      }
    } else {
      console.log(`\nKept ZIP file at: ${zipPath}`);
    }
    
    // Mark album as downloaded and cache movieInfo
    processLog[albumKey] = {
      downloaded: true,
      albumPath: albumDir,
      albumFolder: albumFolderName,
      movieInfo: movieInfo,
      downloadUrl: downloadUrl,
      timestamp: new Date().toISOString()
    };
    // Also cache with preliminary key for easy lookup
    processLog[preliminaryAlbumKey] = {
      downloaded: true,
      albumPath: albumDir,
      albumFolder: albumFolderName,
      movieInfo: movieInfo,
      downloadUrl: downloadUrl,
      timestamp: new Date().toISOString()
    };
    saveLog();
    
    console.log('Done!');
    
  } catch (error) {
    console.error('An error occurred during execution:');
    console.error(error);
  }
}

main();
