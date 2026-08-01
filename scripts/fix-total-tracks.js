require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { loadLibrary, saveLibrary } = require('../src/utils');

const LIBRARY_FILE = path.join(__dirname, '../data/music-library.json');
const PRIMARY_API = 'https://nepotuneapi.vercel.app/api';

async function fetchAlbumTotalTracks(albumId) {
  try {
    const response = await axios.get(`${PRIMARY_API}/albums`, {
      params: { id: albumId },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const data = response.data?.data;
    return data?.songs?.length || null;
  } catch (error) {
    console.error(`Failed to fetch album ${albumId}:`, error.message);
    return null;
  }
}

async function fixTotalTracks() {
  const library = loadLibrary(LIBRARY_FILE);
  let updated = 0;
  let failed = 0;

  console.log('Checking albums for missing totalTracks...');

  for (const album of library.albums || []) {
    if (!album.totalTracks && album.songs && album.songs.length > 0) {
      console.log(`Fetching totalTracks for: ${album.name} (${album.id})`);
      const apiTotalTracks = await fetchAlbumTotalTracks(album.id);
      
      if (apiTotalTracks) {
        album.totalTracks = apiTotalTracks;
        console.log(`  -> Set totalTracks to ${apiTotalTracks}`);
        updated++;
      } else {
        console.log(`  -> Failed to fetch from API, using song count: ${album.songs.length}`);
        album.totalTracks = album.songs.length;
        updated++;
      }
    }
  }

  if (updated > 0) {
    saveLibrary(LIBRARY_FILE, library);
    console.log(`\n✅ Updated ${updated} albums`);
  } else {
    console.log('\n✅ All albums already have totalTracks');
  }

  console.log(`❌ Failed to fetch ${failed} albums from API`);
}

fixTotalTracks().catch(console.error);
