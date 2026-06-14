const { chromium } = require('playwright');
const axios = require('axios');
const AdmZip = require('adm-zip');
const NodeID3 = require('node-id3');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

// Configuration
const MOVIE_URL = 'https://www.masstamilan.dev/dude-2025-songs';
const TARGET_DIR = '/Users/vino/Documents/songs';
const LOG_FILE = path.join(__dirname, 'process-log.json');
const SONGS_JSON_FILE = path.join(__dirname, 'songs-data.json');
const TEMP_DIR = path.join(__dirname, 'temp');

// Ensure directories exist
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
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
function getAlbumKey(url) {
  return `_album:${url.replace(/https?:\/\/www\.masstamilan\.dev\//, '').replace(/\/$/, '')}`;
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
      album: ''
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
    }
    
    console.log('Movie Info Extracted:', movieInfo);

    // Extract Song List (length, downloads, singers)
    console.log('Extracting Song List...');
    const songList = [];
    
    // Try to find the song table/list on the page
    // Masstamilan typically has songs in a table or list format
    const songRows = await page.locator('table tr, .song-list tr, .songs tr').all();
    
    for (const row of songRows) {
      const rowText = await row.innerText();
      // Parse song info from row text
      // Format typically: "Song Name - Singer(s) Length Downloads"
      if (rowText.includes('Singers:') || rowText.includes('Length:') || rowText.includes('Downloads:')) {
        const songInfo = {
          name: '',
          singers: '',
          length: '',
          downloads: ''
        };
        
        const parts = rowText.split('\n').map(p => p.trim()).filter(p => p);
        for (const part of parts) {
          if (part.includes('Singers:')) {
            songInfo.singers = part.replace('Singers:', '').trim();
          } else if (part.includes('Length:')) {
            songInfo.length = part.replace('Length:', '').trim();
          } else if (part.includes('Downloads:')) {
            songInfo.downloads = part.replace('Downloads:', '').trim();
          } else if (!songInfo.name && part && !part.includes('Singers') && !part.includes('Length') && !part.includes('Downloads')) {
            songInfo.name = part;
          }
        }
        
        if (songInfo.name) {
          songList.push(songInfo);
        }
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
  console.log(`Downloading ZIP using Free Download Manager from ${url}...`);
  
  // Extract the expected filename from the URL (last segment)
  const urlParts = url.split('/');
  const expectedFilename = urlParts[urlParts.length - 1] + '.zip';
  const downloadPath = path.join('/Users/vino/Downloads', expectedFilename);
  
  console.log(`Expected download path: ${downloadPath}`);
  
  return new Promise((resolve, reject) => {
    // Use open command to launch Free Download Manager with the URL
    exec(`open -a "/Applications/Free Download Manager.app" "${url}"`, (error) => {
      if (error) {
        console.error('Failed to open Free Download Manager:', error);
        reject(error);
        return;
      }
      console.log('Free Download Manager launched. Waiting for download to complete...');
      
      // Poll for file existence
      const checkInterval = setInterval(() => {
        if (fs.existsSync(downloadPath)) {
          clearInterval(checkInterval);
          console.log(`Download complete! File found at: ${downloadPath}`);
          resolve(downloadPath);
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

// 3. iTunes API Search - First get album info, then search for songs
async function searchITunes(songName, albumName) {
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
    
    console.log(`Searching iTunes API for album: ${cleanAlbumName} (Tamil)`);
    
    // First, search for the album to get the album ID and proper metadata
    // Add "Tamil" to prioritize Tamil version, use country=IN for India
    const albumQuery = encodeURIComponent(`${cleanAlbumName} Tamil`);
    const albumResponse = await axios.get(`https://itunes.apple.com/search?term=${albumQuery}&entity=album&limit=5&country=IN`);
    
    let albumInfo = null;
    if (albumResponse.data && albumResponse.data.results && albumResponse.data.results.length > 0) {
      // Try to find a Tamil album (check collectionName for Tamil or year 2025)
      albumInfo = albumResponse.data.results.find(r => 
        r.collectionName.toLowerCase().includes('tamil') || 
        r.releaseDate?.startsWith('2025')
      ) || albumResponse.data.results[0];
      console.log(`Found album: ${albumInfo.collectionName} by ${albumInfo.artistName} (${albumInfo.primaryGenreName})`);
    }
    
    // Now search for the specific song
    const songQuery = encodeURIComponent(`${cleanSongName} ${cleanAlbumName} Tamil`);
    console.log(`Searching iTunes API for song: ${cleanSongName}`);
    const songResponse = await axios.get(`https://itunes.apple.com/search?term=${songQuery}&entity=song&limit=5&country=IN`);
    
    if (songResponse.data && songResponse.data.results && songResponse.data.results.length > 0) {
      // Find the best match - prefer one that matches the album
      let track = songResponse.data.results[0];
      if (albumInfo) {
        const albumMatch = songResponse.data.results.find(t => t.collectionId === albumInfo.collectionId);
        if (albumMatch) track = albumMatch;
      }

      return {
        title: track.trackName || cleanSongName,
        artist: track.artistName,
        album: track.collectionName || (albumInfo ? albumInfo.collectionName : cleanAlbumName),
        year: track.releaseDate ? track.releaseDate.substring(0, 4) : '',
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
    const albumKey = getAlbumKey(MOVIE_URL);
    const albumLog = processLog[albumKey];
    
    const { downloadUrl, movieInfo } = await scrapeMovieInfoAndDownloadLink();
    
    // First, get album info from iTunes to determine the folder name
    let albumFolderName = movieInfo.album.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    
    // Try to get proper album name from iTunes
    const cleanAlbumName = movieInfo.album
      .replace(/Tamil mp3 songs download.*/i, '')
      .replace(/Songs Download.*/i, '')
      .replace(/MassTamilan.*/i, '')
      .replace(/\.com.*/i, '')
      .trim();
    
    let albumArtworkBuffer = null;
    let albumInfo = null;
    
    try {
      const albumQuery = encodeURIComponent(`${cleanAlbumName} Tamil`);
      const albumResponse = await axios.get(`https://itunes.apple.com/search?term=${albumQuery}&entity=album&limit=5&country=IN`);
      if (albumResponse.data && albumResponse.data.results && albumResponse.data.results.length > 0) {
        albumInfo = albumResponse.data.results.find(r => 
          r.collectionName.toLowerCase().includes('tamil') || 
          r.releaseDate?.startsWith('2025')
        ) || albumResponse.data.results[0];
        albumFolderName = albumInfo.collectionName;
        console.log(`Using iTunes album name for folder: ${albumFolderName}`);
        
        // Download artwork once for the entire album
        const artworkUrl = albumInfo.artworkUrl100 ? albumInfo.artworkUrl100.replace('100x100bb', '600x600bb') : null;
        if (artworkUrl) {
          try {
            console.log(`Downloading album artwork from: ${artworkUrl}`);
            const artResponse = await axios.get(artworkUrl, { responseType: 'arraybuffer' });
            albumArtworkBuffer = Buffer.from(artResponse.data, 'binary');
            console.log(`Album artwork downloaded successfully (${albumArtworkBuffer.length} bytes)`);
          } catch (e) {
            console.warn(`Failed to download album artwork: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.log('Could not fetch album name from iTunes, using scraped name');
    }
    
    // Create album subfolder
    const albumDir = path.join(TARGET_DIR, albumFolderName);
    if (!fs.existsSync(albumDir)) {
      fs.mkdirSync(albumDir, { recursive: true });
      console.log(`Created album folder: ${albumDir}`);
    }
    
    let zipPath = null;
    
    // Check if album is already downloaded
    if (albumLog && albumLog.downloaded && albumLog.albumFolder === albumFolderName) {
      console.log(`Album already downloaded. Skipping download step.`);
      console.log(`Using existing files from: ${albumDir}`);
      
      // Get existing MP3 files from album folder
      const existingFiles = fs.readdirSync(albumDir).filter(f => f.toLowerCase().endsWith('.mp3'));
      console.log(`Found ${existingFiles.length} existing MP3 files.`);
      
      // Process existing files
      for (const fileName of existingFiles) {
        const targetFilePath = path.join(albumDir, fileName);
        
        // Check if already processed
        if (processLog[fileName] && processLog[fileName].status === 'success') {
          console.log(`Skipping ${fileName} - already processed successfully.`);
          continue;
        }

        console.log(`\nProcessing existing file: ${fileName}`);
        
        // Read existing ID3 tags as fallback
        const existingTags = NodeID3.read(targetFilePath);
        
        // Get song name from file
        const rawSongName = fileName.replace('.mp3', '');
        
        // Fetch metadata from iTunes
        const itunesMeta = await searchITunes(rawSongName, movieInfo.album);
        
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

        // Merge iTunes metadata if available, with fallback to existing tags
        if (itunesMeta) {
          tags.title = cleanMetadataString(itunesMeta.title || existingTags.title || tags.title);
          tags.artist = cleanMetadataString(itunesMeta.artist || existingTags.artist || '');
          tags.album = cleanMetadataString(itunesMeta.album || albumFolderName);
          tags.year = itunesMeta.year || existingTags.year || '';
          tags.genre = itunesMeta.genre || existingTags.genre || '';
          tags.composer = cleanMetadataString(itunesMeta.composer || existingTags.composer || '');
          tags.trackNumber = itunesMeta.trackNumber || existingTags.trackNumber || 0;
          tags.trackCount = itunesMeta.trackCount || existingTags.trackCount || 0;
          tags.discNumber = itunesMeta.discNumber || existingTags.discNumber || 1;
          tags.discCount = itunesMeta.discCount || existingTags.discCount || 1;
          
          // Use album artwork (downloaded once) or fallback to existing artwork
          if (albumArtworkBuffer) {
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
        const success = NodeID3.write(tags, targetFilePath);
        
        if (success) {
          console.log(`Successfully updated metadata for ${fileName}`);
          
          // Find matching song info from scraped list
          const songInfo = movieInfo.songList?.find(s => 
            fileName.toLowerCase().includes(s.name.toLowerCase().replace(/\s+/g, '-')) ||
            s.name.toLowerCase().includes(fileName.toLowerCase().replace('.mp3', '').replace(/-/g, ' '))
          );
          
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
            singers: songInfo?.singers || tags.artist,
            filePath: targetFilePath,
            hasArtwork: !!tags.image,
            starring: movieInfo.starring,
            director: movieInfo.director,
            createdAt: new Date().toISOString()
          };
          
          // Add to songs data array (avoid duplicates)
          const existingIndex = songsData.findIndex(s => s.title === songDataEntry.title && s.album === songDataEntry.album);
          if (existingIndex >= 0) {
            songsData[existingIndex] = songDataEntry;
          } else {
            songsData.push(songDataEntry);
          }
          
          processLog[fileName] = {
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
          console.error(`Failed to update metadata for ${fileName}`);
          processLog[fileName] = {
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
    
    // Download using Free Download Manager (automatic polling)
    zipPath = await downloadZip(downloadUrl, null);
    console.log('Extracting...');
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();
    
    for (const entry of zipEntries) {
      if (!entry.isDirectory && entry.entryName.toLowerCase().endsWith('.mp3')) {
        const fileName = path.basename(entry.entryName);
        
        // Check if already processed
        if (processLog[fileName] && processLog[fileName].status === 'success') {
          console.log(`Skipping ${fileName} - already processed successfully.`);
          continue;
        }

        console.log(`\nProcessing: ${fileName}`);
        
        // Extract to album subfolder
        const targetFilePath = path.join(albumDir, fileName);
        fs.writeFileSync(targetFilePath, entry.getData());
        
        // Read existing ID3 tags as fallback
        const existingTags = NodeID3.read(targetFilePath);
        
        // Get song name from file
        const rawSongName = fileName.replace('.mp3', '');
        
        // Fetch metadata from iTunes
        const itunesMeta = await searchITunes(rawSongName, movieInfo.album);
        
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

        // Merge iTunes metadata if available, with fallback to existing tags
        if (itunesMeta) {
          tags.title = cleanMetadataString(itunesMeta.title || existingTags.title || tags.title);
          tags.artist = cleanMetadataString(itunesMeta.artist || existingTags.artist || '');
          tags.album = cleanMetadataString(itunesMeta.album || albumFolderName);
          tags.year = itunesMeta.year || existingTags.year || '';
          tags.genre = itunesMeta.genre || existingTags.genre || '';
          tags.composer = cleanMetadataString(itunesMeta.composer || existingTags.composer || '');
          tags.trackNumber = itunesMeta.trackNumber || existingTags.trackNumber || 0;
          tags.trackCount = itunesMeta.trackCount || existingTags.trackCount || 0;
          tags.discNumber = itunesMeta.discNumber || existingTags.discNumber || 1;
          tags.discCount = itunesMeta.discCount || existingTags.discCount || 1;
          
          // Use album artwork (downloaded once) or fallback to existing artwork
          if (albumArtworkBuffer) {
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
        const success = NodeID3.write(tags, targetFilePath);
        
        if (success) {
          console.log(`Successfully updated metadata for ${fileName}`);
          
          // Find matching song info from scraped list
          const songInfo = movieInfo.songList?.find(s => 
            fileName.toLowerCase().includes(s.name.toLowerCase().replace(/\s+/g, '-')) ||
            s.name.toLowerCase().includes(fileName.toLowerCase().replace('.mp3', '').replace(/-/g, ' '))
          );
          
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
            singers: songInfo?.singers || tags.artist,
            filePath: targetFilePath,
            hasArtwork: !!tags.image,
            starring: movieInfo.starring,
            director: movieInfo.director,
            createdAt: new Date().toISOString()
          };
          
          // Add to songs data array (avoid duplicates)
          const existingIndex = songsData.findIndex(s => s.title === songDataEntry.title && s.album === songDataEntry.album);
          if (existingIndex >= 0) {
            songsData[existingIndex] = songDataEntry;
          } else {
            songsData.push(songDataEntry);
          }
          
          processLog[fileName] = {
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
          console.error(`Failed to update metadata for ${fileName}`);
          processLog[fileName] = {
            status: 'error',
            error: 'Failed to write ID3 tags',
            timestamp: new Date().toISOString()
          };
        }
        
        saveLog();
        saveSongsData();
      }
    }
    
    // Cleanup
    console.log('\nCleaning up temporary files...');
    if (zipPath && fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    
    // Mark album as downloaded
    processLog[albumKey] = {
      downloaded: true,
      albumFolder: albumFolderName,
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
